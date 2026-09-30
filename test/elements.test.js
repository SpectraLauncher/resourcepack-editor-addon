import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { inflateRawSync } from 'node:zlib'

import { buildElements, classify, excludedPaths, offFromExcluded } from '../addon/ui/elements.js'

const files = paths => paths.map(path => ({ path, size: 1 }))
const find = (built, category, name) => [...built.elements.values()].find(e => e.category === category && e.name === name)

test('a block keeps its texture, animation, model, blockstate, connected textures and PBR maps together', () => {
  const built = buildElements(files([
    'pack.mcmeta',
    'pack.png',
    'assets/minecraft/textures/block/glass.png',
    'assets/minecraft/textures/block/glass.png.mcmeta',
    'assets/minecraft/textures/block/glass_n.png',
    'assets/minecraft/textures/block/glass_s.png',
    'assets/minecraft/models/block/glass.json',
    'assets/minecraft/blockstates/glass.json',
    'assets/minecraft/optifine/ctm/glass/glass.properties',
    'assets/minecraft/optifine/ctm/glass/0.png',
    'assets/minecraft/textures/block/stone.png',
  ]), null)
  const glass = find(built, 'blocks', 'glass')
  assert.equal(glass.files.length, 8)
  assert.equal(glass.thumb, 'assets/minecraft/textures/block/glass.png')
  assert.equal(built.elements.size, 2)
  assert.deepEqual(built.kept, ['pack.mcmeta', 'pack.png'])
})

test('overlay folders count as the same part as the base files', () => {
  const mcmeta = { overlays: { entries: [{ directory: 'overlay_1_21_5' }, { directory: '1.20.2' }] } }
  const built = buildElements(files([
    'assets/minecraft/textures/entity/creeper/creeper.png',
    'overlay_1_21_5/assets/minecraft/textures/entity/creeper/creeper.png',
    '1.20.2/assets/minecraft/textures/entity/creeper/creeper_armor.png',
    'overlay_1_21_5/pack.png',
  ]), mcmeta)
  const creeper = find(built, 'entities', 'creeper')
  assert.equal(creeper.files.length, 3)
  assert.equal(creeper.thumb, 'assets/minecraft/textures/entity/creeper/creeper.png')
  assert.deepEqual(built.kept, ['overlay_1_21_5/pack.png'])
})

test('paths land in the category a player would look for them in', () => {
  const cases = {
    'assets/minecraft/textures/models/armor/diamond_layer_1.png': ['armor', '', 'diamond'],
    'assets/minecraft/textures/entity/equipment/humanoid/diamond.png': ['armor', '', 'diamond'],
    'assets/minecraft/equipment/diamond.json': ['armor', '', 'diamond'],
    'assets/minecraft/textures/gui/sprites/hud/heart/full.png': ['gui', 'hud/heart', 'full'],
    'assets/minecraft/textures/gui/container/inventory.png': ['gui', 'container', 'inventory'],
    'assets/minecraft/sounds/mob/creeper/say1.ogg': ['sounds', 'mob', 'creeper'],
    'assets/minecraft/sounds.json': ['sounds', '', 'sounds.json'],
    'assets/minecraft/lang/pl_pl.json': ['languages', '', 'pl_pl'],
    'assets/minecraft/optifine/cem/creeper.jem': ['entities', '', 'creeper'],
    'assets/minecraft/optifine/random/entity/cow/cow2.png': ['entities', '', 'cow'],
    'assets/minecraft/items/diamond_sword.json': ['items', '', 'diamond_sword'],
    'assets/minecraft/materialmaps/block/stone.json': ['blocks', '', 'stone'],
    'assets/biomeswevegone/models/block/leaves/aspen_leaves.json': ['blocks', 'leaves', 'aspen_leaves'],
    'assets/lumi/shaders/pass/bloom.frag': ['shaders', 'shaders/pass', 'bloom'],
    'assets/icons/textures/menu/options.png': ['other', 'menu', 'options'],
  }
  for (const [path, [category, group, name]] of Object.entries(cases)) {
    assert.deepEqual(classify(path), { category, ns: path.split('/')[1], group, name }, path)
  }
  assert.equal(classify('README.md'), null)
  assert.equal(classify('assets/minecraft'), null)
})

test('turning parts off lists every file of them, and a saved copy reads back the same parts', () => {
  const built = buildElements(files([
    'assets/minecraft/textures/block/dirt.png',
    'assets/minecraft/models/block/dirt.json',
    'assets/minecraft/textures/block/stone.png',
  ]), null)
  const dirt = find(built, 'blocks', 'dirt').key
  const excluded = excludedPaths(built.elements, new Set([dirt]))
  assert.deepEqual(excluded, ['assets/minecraft/models/block/dirt.json', 'assets/minecraft/textures/block/dirt.png'])
  assert.deepEqual([...offFromExcluded(built.elements, excluded)], [dirt])
  assert.deepEqual([...offFromExcluded(built.elements, ['assets/minecraft/models/block/dirt.json'])], [])
})

function zipEntries(buffer) {
  const eocd = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  const count = buffer.readUInt16LE(eocd + 10)
  let at = buffer.readUInt32LE(eocd + 16)
  const out = []
  for (let i = 0; i < count; i++) {
    const method = buffer.readUInt16LE(at + 10)
    const compressed = buffer.readUInt32LE(at + 20)
    const size = buffer.readUInt32LE(at + 24)
    const nameLength = buffer.readUInt16LE(at + 28)
    const skip = nameLength + buffer.readUInt16LE(at + 30) + buffer.readUInt16LE(at + 32)
    const local = buffer.readUInt32LE(at + 42)
    const path = buffer.toString('utf8', at + 46, at + 46 + nameLength)
    const read = () => {
      const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28)
      const raw = buffer.subarray(start, start + compressed)
      return method === 8 ? inflateRawSync(raw) : raw
    }
    if (!path.endsWith('/')) out.push({ path, size, read })
    at += 46 + skip
  }
  return out
}

const PACKS = process.env.PACKS_DIR ?? 'C:/Users/Patryk/Desktop/resy'

test('every real pack splits into parts without losing or doubling a file', { skip: !existsSync(PACKS) && `no packs in ${PACKS}` }, () => {
  for (const name of readdirSync(PACKS).filter(n => n.endsWith('.zip'))) {
    const entries = zipEntries(readFileSync(join(PACKS, name)))
    const meta = entries.find(e => e.path === 'pack.mcmeta')
    let mcmeta = null
    try {
      mcmeta = JSON.parse(meta.read().toString('utf8').replace(/^\uFEFF/, ''))
    } catch {}
    const built = buildElements(entries, mcmeta)

    const placed = [...built.elements.values()].flatMap(e => e.files)
    assert.equal(placed.length + built.kept.length, entries.length, name)
    assert.equal(new Set(placed).size, placed.length, name)
    assert.ok(built.kept.includes('pack.mcmeta'), name)
    assert.ok([...built.elements.values()].every(e => e.files.length), name)
    assert.ok(built.elements.size < entries.length, name)
    console.log(`${name}: ${entries.length} files, ${built.elements.size} parts in ${built.tree.map(c => `${c.id} ${c.groups.reduce((n, g) => n + g.elements.length, 0)}`).join(', ')}`)
  }
})

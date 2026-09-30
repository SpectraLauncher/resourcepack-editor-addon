export const CATEGORIES = [
  'blocks',
  'items',
  'entities',
  'armor',
  'gui',
  'fonts',
  'particles',
  'environment',
  'effects',
  'paintings',
  'misc',
  'sounds',
  'languages',
  'texts',
  'shaders',
  'optifine',
  'other',
]

const stem = file => file.replace(/\..*$/, '')
const armorName = name => name.replace(/_layer_\d+(_overlay)?$/, '').replace(/_overlay$/, '')

export function overlayDirs(mcmeta) {
  const entries = mcmeta?.overlays?.entries
  if (!Array.isArray(entries)) return new Set()
  return new Set(entries.map(e => e?.directory).filter(d => typeof d === 'string' && d && !d.includes('/')))
}

export function logicalPath(path, overlays) {
  const slash = path.indexOf('/')
  return slash > 0 && overlays.has(path.slice(0, slash)) ? path.slice(slash + 1) : path
}

function textures(ns, dirs, file) {
  const under = n => dirs.slice(n).join('/')
  const at = (category, group, name) => ({ category, ns, group, name })
  const name = stem(file)
  switch (dirs[1]) {
    case 'block': return at('blocks', under(2), name)
    case 'item': return at('items', under(2), name)
    case 'entity':
      if (dirs[2] === 'equipment') return at('armor', '', name)
      return at('entities', '', dirs[2] ?? name)
    case 'models': return dirs[2] === 'armor' ? at('armor', '', armorName(name)) : at('other', under(1), name)
    case 'trims': return at('armor', 'trims', name)
    case 'gui': return at('gui', under(2).replace(/^sprites\/?/, ''), name)
    case 'font': return at('fonts', under(2), name)
    case 'particle': return at('particles', under(2), name)
    case 'environment': return at('environment', under(2), name)
    case 'colormap': return at('environment', 'colormap', name)
    case 'mob_effect': return at('effects', under(2), name)
    case 'painting': return at('paintings', under(2), name)
    case 'map':
    case 'misc':
    case 'effect': return at('misc', under(1), name)
  }
  return at('other', under(1), name)
}

function optifine(ns, dirs, file) {
  const at = (category, group, name) => ({ category, ns, group, name })
  const name = stem(file)
  const folder = dirs.length > 2 ? dirs[dirs.length - 1] : name
  switch (dirs[1]) {
    case 'ctm': return at('blocks', '', folder)
    case 'cit': return at('items', '', folder)
    case 'cem': return at('entities', '', dirs[2] ?? name)
    case 'mob': return at('entities', '', dirs[2] ?? name)
    case 'random': return dirs[2] === 'entity' ? at('entities', '', dirs[3] ?? name) : at('optifine', 'random', name)
    case 'sky': return at('environment', 'sky', name)
    case 'colormap': return at('environment', 'colormap', name)
  }
  return at('optifine', dirs.slice(1).join('/'), name)
}

export function classify(logical) {
  const parts = logical.split('/')
  if (parts[0] !== 'assets' || parts.length < 3) return null
  const ns = parts[1]
  const file = parts[parts.length - 1]
  const dirs = parts.slice(2, -1)
  const name = stem(file)
  const at = (category, group, element) => ({ category, ns, group, name: element })
  const under = n => dirs.slice(n).join('/')

  if (!dirs.length) return file === 'sounds.json' ? at('sounds', '', 'sounds.json') : at('other', '', name)

  switch (dirs[0]) {
    case 'textures': return textures(ns, dirs, file)
    case 'optifine': return optifine(ns, dirs, file)
    case 'models':
      if (dirs[1] === 'block') return at('blocks', under(2), name)
      if (dirs[1] === 'item') return at('items', under(2), name)
      return at('other', under(0), name)
    case 'blockstates': return at('blocks', under(1), name)
    case 'items': return at('items', under(1), name)
    case 'equipment': return at('armor', '', name)
    case 'particles': return at('particles', under(1), name)
    case 'sounds': return at('sounds', dirs[1] ?? '', dirs[2] ?? name)
    case 'lang':
    case 'lang_rpo': return at('languages', '', name)
    case 'texts': return at('texts', under(1), name)
    case 'font': return at('fonts', under(1), name)
    case 'materialmaps':
    case 'lights':
      if (dirs[1] === 'block' || dirs[1] === 'fluid') return at('blocks', '', name)
      if (dirs[1] === 'item') return at('items', '', name)
      if (dirs[1] === 'entity' || dirs[1] === 'block_entity') return at('entities', '', name)
      if (dirs[1] === 'particle') return at('particles', '', name)
      return at('shaders', under(0), name)
    case 'shaders':
    case 'post_effect':
    case 'pipeline':
    case 'pipelines':
    case 'materials': return at('shaders', under(0), name)
  }
  return at('other', under(0), name)
}

const keyOf = c => [c.category, c.ns, c.group, c.name].join('\u0000')

export function groupLabel(ns, group) {
  if (ns === 'minecraft') return group
  return group ? `${ns} · ${group}` : ns
}

export function buildElements(files, mcmeta) {
  const overlays = overlayDirs(mcmeta)
  const byKey = new Map()
  const kept = []

  for (const file of files) {
    const logical = logicalPath(file.path, overlays)
    const found = classify(logical)
    if (!found) {
      kept.push(file.path)
      continue
    }
    const key = keyOf(found)
    let element = byKey.get(key)
    if (!element) {
      element = { key, ...found, files: [], size: 0, thumb: null }
      byKey.set(key, element)
    }
    element.files.push(file.path)
    element.size += file.size ?? 0
  }

  for (const [key, element] of [...byKey]) {
    const base = element.name.match(/^(.+)_(n|s|e)$/)?.[1]
    const target = base && byKey.get(keyOf({ ...element, name: base }))
    if (!target) continue
    target.files.push(...element.files)
    target.size += element.size
    byKey.delete(key)
  }

  for (const element of byKey.values()) {
    const pngs = element.files.filter(p => p.endsWith('.png'))
    const score = (p) => {
      const logical = logicalPath(p, overlays)
      return (logical === p ? 0 : 4) + (logical.includes('/textures/') ? 0 : 2) + (stem(p.split('/').pop()) === element.name ? 0 : 1)
    }
    element.thumb = pngs.sort((a, b) => score(a) - score(b) || a.localeCompare(b))[0] ?? null
  }

  const categories = CATEGORIES.map(id => ({ id, groups: new Map() }))
  const byCategory = new Map(categories.map(c => [c.id, c]))
  for (const element of byKey.values()) {
    const groups = byCategory.get(element.category).groups
    const label = groupLabel(element.ns, element.group)
    const groupKey = `${element.category}\u0000${label}`
    if (!groups.has(groupKey)) groups.set(groupKey, { key: groupKey, label, mod: element.ns !== 'minecraft', elements: [] })
    groups.get(groupKey).elements.push(element)
  }

  const tree = categories
    .map(c => ({
      id: c.id,
      groups: [...c.groups.values()]
        .map(g => ({ ...g, elements: g.elements.sort((a, b) => a.name.localeCompare(b.name)) }))
        .sort((a, b) => Number(a.mod) - Number(b.mod) || a.label.localeCompare(b.label)),
    }))
    .filter(c => c.groups.length)

  return { tree, elements: byKey, kept }
}

export function excludedPaths(elements, off) {
  const out = []
  for (const key of off) out.push(...(elements.get(key)?.files ?? []))
  return out.sort()
}

export function offFromExcluded(elements, excluded) {
  const gone = new Set(excluded)
  const off = new Set()
  for (const element of elements.values()) {
    if (element.files.length && element.files.every(p => gone.has(p))) off.add(element.key)
  }
  return off
}

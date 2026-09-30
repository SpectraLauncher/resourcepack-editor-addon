import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

import { CATEGORIES } from '../addon/ui/elements.js'
import { LANGUAGES } from '../addon/ui/strings.js'

const manifest = JSON.parse(readFileSync('addon/addon.json', 'utf8'))
const read = path => readFileSync(`addon/${path}`, 'utf8')

test('addon.json points only at files that exist', () => {
  const c = manifest.contributes
  const paths = [
    ...c.instanceTabs.flatMap(tab => [tab.entry, tab.icon]),
    ...Object.values(c.locales),
  ]
  for (const path of paths) assert.ok(existsSync(`addon/${path}`), path)
  assert.match(manifest.id, /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/)
  assert.deepEqual(manifest.permissions, ['instances:read', 'resourcepacks:read', 'resourcepacks:write'])
})

test('every %key% title has a string in every locale', () => {
  const keys = JSON.stringify(manifest.contributes).match(/%\w+%/g).map(k => k.slice(1, -1))
  for (const file of Object.values(manifest.contributes.locales)) {
    const table = JSON.parse(read(file))
    for (const key of keys) assert.ok(table[key], `${file} ${key}`)
  }
})

test('every text the page uses exists in English and Polish', () => {
  const script = read('ui/editor.js')
  const html = read('ui/editor.html')
  const used = new Set([
    ...[...script.matchAll(/\bt\('([\w.]+)'/g)].map(m => m[1]),
    ...[...html.matchAll(/data-t="(\w+)"/g)].map(m => m[1]),
    ...CATEGORIES.map(id => `categories.${id}`),
  ])
  for (const [lang, table] of Object.entries(LANGUAGES)) {
    for (const key of used) {
      const value = key.split('.').reduce((node, part) => node?.[part], table)
      assert.equal(typeof value, 'string', `${lang} ${key}`)
    }
  }
  assert.deepEqual(Object.keys(LANGUAGES.pl).sort(), Object.keys(LANGUAGES.en).sort())
})

test('the page only calls launcher methods the addon has permission for', () => {
  const script = read('ui/editor.js')
  const calls = new Set([...script.matchAll(/spectra\.(\w+)\.(\w+)\(/g)].map(m => `${m[1]}.${m[2]}`))
  const allowed = new Set([
    'instances.content',
    'instances.isRunning',
    'resourcepacks.files',
    'resourcepacks.read',
    'resourcepacks.save',
    'ui.toast',
    'ui.confirm',
    'launcher.locale',
    'launcher.theme',
  ])
  for (const call of calls) assert.ok(allowed.has(call), call)
})

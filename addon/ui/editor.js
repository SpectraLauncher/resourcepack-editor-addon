import { buildElements, excludedPaths, offFromExcluded } from './elements.js'
import { translator } from './strings.js'

const ACCENTS = {
  sky: '#38bdf8',
  blue: '#60a5fa',
  indigo: '#818cf8',
  violet: '#a78bfa',
  purple: '#c084fc',
  pink: '#f472b6',
  rose: '#fb7185',
  red: '#f87171',
  orange: '#fb923c',
  amber: '#fbbf24',
  green: '#4ade80',
  emerald: '#34d399',
  teal: '#2dd4bf',
  cyan: '#22d3ee',
}
const GLYPHS = { sounds: '♪', languages: 'Aa', texts: '¶', shaders: '✦', fonts: 'Aa' }
const THUMB_JOBS = 6

const instanceId = spectra.context.instanceId
const $ = id => document.getElementById(id)
let t = translator('en')

const state = {
  packs: [],
  selected: null,
  source: null,
  model: null,
  off: new Set(),
  saved: new Set(),
  saving: false,
}

let loadToken = 0
let observer = null
let active = 0
const queue = []
const thumbs = new Map()
const cards = new Map()
const counters = []

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props)
  node.append(...children)
  return node
}

const copyName = filename => `${filename.replace(/\.zip$/i, '').replace(/ \(edited\)$/, '')} (edited).zip`
const dirty = () => state.off.size !== state.saved.size || [...state.off].some(key => !state.saved.has(key))

function showMessage(text) {
  $('message').textContent = text
  $('editor').hidden = true
}

function renderPacks() {
  const list = $('pack-list')
  list.replaceChildren()
  for (const pack of state.packs) {
    const button = el('button', { type: 'button', className: pack.filename === state.selected ? 'active' : '' })
    button.append(el('span', { className: 'name', textContent: pack.filename.replace(/\.zip$/i, '') }))
    const badges = el('span', { className: 'badges' })
    if (/ \(edited\)\.zip$/i.test(pack.filename)) badges.append(el('span', { className: 'badge edited', textContent: t('edited') }))
    if (!pack.enabled) badges.append(el('span', { className: 'badge', textContent: t('off') }))
    if (badges.childElementCount) button.append(badges)
    button.addEventListener('click', () => open(pack.filename))
    list.append(el('li', {}, button))
  }
}

async function loadPacks() {
  const packs = await spectra.instances.content(instanceId, 'resourcepack')
  state.packs = packs.slice().sort((a, b) => a.filename.localeCompare(b.filename))
  renderPacks()
}

function thumb(path) {
  const key = `${state.source}\u0000${path}`
  if (!thumbs.has(key)) {
    thumbs.set(key, new Promise((resolve) => {
      queue.push({ source: state.source, path, resolve })
      pump()
    }))
  }
  return thumbs.get(key)
}

function pump() {
  while (active < THUMB_JOBS && queue.length) {
    const job = queue.shift()
    if (job.source !== state.source) {
      job.resolve(null)
      continue
    }
    active++
    spectra.resourcepacks.read(instanceId, job.source, job.path)
      .then(r => job.resolve(`data:image/png;base64,${r.data}`), () => job.resolve(null))
      .finally(() => {
        active--
        pump()
      })
  }
}

function onVisible(entries) {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue
    observer.unobserve(entry.target)
    const box = entry.target.querySelector('.thumb')
    thumb(box.dataset.path).then((url) => {
      if (!url) return
      const img = new Image()
      img.onload = () => {
        if (img.naturalHeight > img.naturalWidth && img.naturalHeight % img.naturalWidth === 0) img.classList.add('strip')
        box.replaceChildren(img)
      }
      img.src = url
    })
  }
}

function refresh() {
  for (const { box, count, elements } of counters) {
    const off = elements.filter(e => state.off.has(e.key)).length
    box.checked = off === 0
    box.indeterminate = off > 0 && off < elements.length
    count.textContent = off ? t('countOff', { off, total: elements.length }) : String(elements.length)
    count.classList.toggle('has-off', off > 0)
  }
  for (const [key, card] of cards) card.classList.toggle('off', state.off.has(key))
  $('summary').textContent = state.off.size ? t('summary', { off: state.off.size, total: state.model.elements.size }) : t('nothingOff')
  $('save').disabled = !dirty() || state.saving
  $('reset').disabled = !dirty() || state.saving
}

function setOff(elements, off) {
  for (const element of elements) {
    if (off) state.off.add(element.key)
    else state.off.delete(element.key)
  }
  refresh()
}

function summary(label, elements) {
  const box = el('input', { type: 'checkbox' })
  box.addEventListener('click', (event) => {
    event.stopPropagation()
    setOff(elements, !box.checked)
  })
  const count = el('span', { className: 'count' })
  counters.push({ box, count, elements })
  return el('summary', {}, box, el('span', { className: 'label', textContent: label }), count)
}

function grid(elements) {
  const node = el('div', { className: 'grid' })
  for (const element of elements) {
    const lines = element.files.slice(0, 12)
    if (element.files.length > 12) lines.push('…')
    const card = el('button', { type: 'button', className: 'part', title: lines.join('\n') })
    card.dataset.off = t('partOff')
    const box = el('span', { className: 'thumb', textContent: element.thumb ? '' : GLYPHS[element.category] ?? '▦' })
    if (element.thumb) {
      box.dataset.path = element.thumb
      observer.observe(card)
    }
    card.append(box, el('span', { className: 'name', textContent: element.name }))
    card.classList.toggle('off', state.off.has(element.key))
    card.addEventListener('click', () => setOff([element], !state.off.has(element.key)))
    cards.set(element.key, card)
    node.append(card)
  }
  return node
}

function lazy(details, fill, now) {
  let filled = false
  const run = () => {
    if (filled) return
    filled = true
    fill()
  }
  if (now) run()
  else details.addEventListener('toggle', () => details.open && run())
}

function renderTree() {
  observer?.disconnect()
  observer = new IntersectionObserver(onVisible, { root: $('tree'), rootMargin: '200px' })
  cards.clear()
  counters.length = 0

  const tree = $('tree')
  tree.replaceChildren()
  const query = $('search').value.trim().toLowerCase()
  const onlyOff = $('only-off').checked
  const filtering = Boolean(query) || onlyOff
  const visible = element => (!onlyOff || state.off.has(element.key))
    && (!query || element.name.toLowerCase().includes(query) || element.files.some(p => p.toLowerCase().includes(query)))

  for (const category of state.model.tree) {
    const groups = category.groups.map(g => ({ ...g, shown: g.elements.filter(visible) })).filter(g => g.shown.length)
    if (!groups.length) continue
    const details = el('details', { className: 'category', open: filtering })
    details.append(summary(t(`categories.${category.id}`), category.groups.flatMap(g => g.elements)))
    lazy(details, () => {
      if (groups.length === 1 && !groups[0].label) {
        details.append(grid(groups[0].shown))
        return
      }
      for (const group of groups) {
        const inner = el('details', { className: 'group', open: filtering })
        inner.append(summary(group.label || t('general'), group.elements))
        lazy(inner, () => {
          inner.append(grid(group.shown))
          refresh()
        }, filtering)
        details.append(inner)
      }
    }, filtering)
    details.addEventListener('toggle', refresh)
    tree.append(details)
  }
  if (!tree.childElementCount) tree.append(el('p', { className: 'empty-note', textContent: t('noMatch') }))
  refresh()
}

async function open(filename) {
  if (state.model && dirty() && !(await spectra.ui.confirm(t('discard')))) return
  const token = ++loadToken
  state.selected = filename
  renderPacks()
  showMessage(t('loading'))

  try {
    const picked = await spectra.resourcepacks.files(instanceId, filename)
    let listing = picked
    let source = filename
    let excluded = []
    let note = t('intro')

    if (picked.edit) {
      if (state.packs.some(p => p.filename === picked.edit.source)) {
        source = picked.edit.source
        listing = await spectra.resourcepacks.files(instanceId, source)
        excluded = picked.edit.excluded
        note = t('copyOf', { name: source })
      } else {
        note = t('sourceMissing', { name: picked.edit.source })
      }
    } else if (state.packs.some(p => p.filename === copyName(filename))) {
      const copy = await spectra.resourcepacks.files(instanceId, copyName(filename)).catch(() => null)
      if (copy?.edit?.source === filename) {
        excluded = copy.edit.excluded
        note = `${t('intro')} ${t('replaces', { name: copyName(filename) })}`
      }
    }
    if (token !== loadToken) return

    state.source = source
    state.model = buildElements(listing.files, listing.mcmeta)
    state.off = offFromExcluded(state.model.elements, excluded)
    state.saved = new Set(state.off)
    queue.length = 0

    $('pack-name').textContent = source.replace(/\.zip$/i, '')
    $('pack-note').textContent = note
    $('summary').title = t('kept')
    const icon = $('pack-icon')
    icon.removeAttribute('src')
    if (listing.files.some(f => f.path === 'pack.png')) {
      thumb('pack.png').then((url) => {
        if (url && token === loadToken) icon.src = url
      })
    }

    $('message').textContent = ''
    $('editor').hidden = false
    renderTree()
  } catch (error) {
    if (token === loadToken) showMessage(t('unreadable', { reason: error?.message ?? String(error) }))
  }
}

async function save() {
  if (!state.model || state.saving) return
  if (await spectra.instances.isRunning(instanceId)) {
    await spectra.ui.toast(t('running'), { color: 'warning' })
    return
  }
  state.saving = true
  $('save').textContent = t('saving')
  refresh()
  try {
    const excluded = excludedPaths(state.model.elements, state.off)
    const { filename } = await spectra.resourcepacks.save(instanceId, state.source, excluded)
    state.saved = new Set(state.off)
    await spectra.ui.toast(t('saved', { name: filename }), { description: t('savedHint'), color: 'success' })
    await loadPacks()
    state.saving = false
    await open(filename)
  } catch (error) {
    await spectra.ui.toast(t('failed'), { description: error?.message ?? String(error), color: 'error' })
  } finally {
    state.saving = false
    $('save').textContent = t('save')
    if (state.model) refresh()
  }
}

async function init() {
  const [locale, theme] = await Promise.all([
    spectra.launcher.locale().catch(() => 'en'),
    spectra.launcher.theme().catch(() => null),
  ])
  t = translator(locale)
  document.documentElement.lang = String(locale)
  if (theme) {
    document.documentElement.dataset.mode = theme.mode
    if (ACCENTS[theme.accent]) document.documentElement.style.setProperty('--accent', ACCENTS[theme.accent])
  }
  for (const node of document.querySelectorAll('[data-t]')) node.textContent = t(node.dataset.t)
  $('search').placeholder = t('search')

  let timer
  $('search').addEventListener('input', () => {
    clearTimeout(timer)
    timer = setTimeout(() => state.model && renderTree(), 150)
  })
  $('only-off').addEventListener('change', () => state.model && renderTree())
  $('reset').addEventListener('click', () => {
    state.off = new Set(state.saved)
    refresh()
  })
  $('save').addEventListener('click', save)

  try {
    await loadPacks()
  } catch (error) {
    showMessage(t('unreadable', { reason: error?.message ?? String(error) }))
    return
  }
  showMessage(state.packs.length ? t('pick') : t('noPacks'))
}

init()

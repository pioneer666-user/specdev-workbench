import { createFurnitureThumbnail } from './furniture-thumbnail.js'

// 快捷家具卡：显隐按本卡身份操作；选择/资料仍交回唯一核心。
export function createFurniturePanel({ root, toggle, info, selection, display, canInteract, onRead, onExpand, clearInput, focusScene, onControlFocus }) {
  const doc = root.ownerDocument, listeners = [], rows = new Map()
  let opened = false, disposed = false, suspended = false
  const listen = (target, type, fn) => { target.addEventListener(type, fn); listeners.push([target, type, fn]) }
  const active = () => !disposed && !suspended && canInteract()
  const list = root.querySelector('[data-furniture-list]')
  const quickRead = info.querySelector('button')
  const showAll = root.querySelector('[data-furniture-show-all]')
  const visibilityNote = root.querySelector('[data-furniture-visibility-note]')
  const expand = root.querySelector('[data-furniture-expand]')
  const counts = new Map()
  for (const item of selection.items) counts.set(item.name, (counts.get(item.name) ?? 0) + 1)
  root.querySelector('[data-furniture-count]').textContent = String(selection.items.length)
  if (!selection.items.length) { const empty = doc.createElement('li'); empty.className = 'room-furniture-empty'; empty.textContent = '房间里还没有家具。'; list.append(empty) }
  for (const item of selection.items) {
    const li = doc.createElement('li'), button = doc.createElement('button')
    button.type = 'button'
    const title = doc.createElement('span'), note = doc.createElement('small')
    const copy = doc.createElement('span'); copy.className = 'furniture-card-copy'
    title.textContent = item.name; copy.append(title, note); button.append(createFurnitureThumbnail(doc, item), copy)
    button.dataset.instanceId = item.instanceId; button.setAttribute('aria-pressed', 'false')
    listen(button, 'click', () => { if (active() && opened) selection.select(selection.getSelected()?.instanceId === item.instanceId ? null : item.instanceId) })
    const actions = doc.createElement('div'), read = doc.createElement('button'), visibility = doc.createElement('button')
    actions.className = 'furniture-card-actions'
    read.type = visibility.type = 'button'; read.textContent = '资料'; visibility.textContent = '隐藏'
    read.dataset.readInstance = item.instanceId; visibility.dataset.visibilityId = item.instanceId
    read.setAttribute('aria-label', `查看${item.name}的资料（${item.instanceId}）`)
    visibility.setAttribute('aria-label', `隐藏${item.name}（${item.instanceId}）`); visibility.setAttribute('aria-pressed', 'false')
    listen(read, 'click', () => { if (active() && opened && item.binding) onRead(item, read) })
    listen(visibility, 'click', () => {
      const state = display.getState(item.instanceId)
      if (active() && opened && display.canChange() && !state.parentHidden) display.setHidden(item.instanceId, !state.explicitHidden)
      sync()
    })
    actions.append(read, visibility); li.className = 'furniture-card'; li.append(button, actions); list.append(li); rows.set(item.instanceId, { button, read, visibility, li })
  }
  function sync() {
    if (disposed) return
    const item = selection.getSelected()
    const state = item ? display.getState(item.instanceId) : null
    for (const entry of selection.items) {
      const { button, read, visibility, li } = rows.get(entry.instanceId), entryState = display.getState(entry.instanceId)
      button.setAttribute('aria-pressed', String(entry.instanceId === item?.instanceId))
      li.dataset.selected = String(entry.instanceId === item?.instanceId)
      button.querySelector('small').textContent = `${entry.status} · ${entryState.label}${counts.get(entry.name) > 1 ? ` · ${entry.instanceId}` : ''}`
      read.disabled = !active() || !entry.binding
      read.title = entry.binding ? '查看这件家具的资料' : entry.status
      visibility.setAttribute('aria-pressed', String(entryState.hidden))
      visibility.disabled = !active() || !display.canChange() || entryState.parentHidden
      visibility.title = entryState.parentHidden ? '需先显示承载家具' : !display.canChange() ? '仅总览可用；进入行走会恢复全部家具' : entryState.hidden ? '已隐藏，点击恢复显示' : '点击隐藏；仅改变本页总览显示'
    }
    info.hidden = !item
    info.querySelector('span').textContent = item ? `${item.name} · ${state.hidden ? `${state.label} · ${item.binding ? '查看资料' : item.status}` : item.binding ? '再次点击或查看资料' : item.status}` : ''
    quickRead.disabled = !active() || !item?.binding
    const canDisplay = active() && display.canChange()
    showAll.disabled = !canDisplay || !display.hasHidden()
    if (!display.hasHidden() && doc.activeElement === showAll) (rows.get(item?.instanceId)?.button ?? root.querySelector('[data-furniture-close]')).focus({ preventScroll: true })
    showAll.hidden = !display.hasHidden()
    visibilityNote.textContent = '仅总览可隐藏；进入行走恢复全部家具。'
    toggle.disabled = !active()
    expand.disabled = !active()
    root.toggleAttribute('inert', !active() || !opened)
    info.toggleAttribute('inert', !active())
    root.hidden = !opened
    toggle.setAttribute('aria-expanded', String(opened))
  }
  function close() { if (!opened) return; opened = false; onControlFocus(false); sync(); if (active()) { if (!toggle.closest('[hidden]')) toggle.focus(); else focusScene() } }
  listen(toggle, 'click', () => { if (!active() || toggle.closest('[hidden]')) return; opened = !opened; clearInput(); sync(); if (!opened) onControlFocus(false) })
  listen(root.querySelector('[data-furniture-close]'), 'click', () => { if (active()) close() })
  listen(quickRead, 'click', () => { if (active()) onRead(selection.getSelected(), quickRead) })
  listen(expand, 'click', () => { if (active() && opened) onExpand(expand) })
  listen(showAll, 'click', () => { if (active() && opened && !showAll.hidden) display.showAll() })
  for (const element of [root, info]) {
    listen(element, 'pointerdown', event => { event.stopPropagation(); if (active()) { clearInput(); onControlFocus(true) } })
    listen(element, 'keydown', event => { if (event.key !== 'Escape') event.stopPropagation() })
  }
  listen(doc, 'focusin', event => onControlFocus(active() && (root.contains(event.target) || info.contains(event.target))))
  // 阅读器/导出先消费；关闭它们的同一 Escape 不会继续清除选择。
  listen(doc, 'keydown', event => {
    if (event.key !== 'Escape' || event.defaultPrevented || !active()) return
    event.preventDefault(); event.stopPropagation()
    if (opened) close(); else { selection.select(null); focusScene() }
  })
  sync()
  return { sync, isOpen: () => opened, suspend(value) { suspended = value; if (value) onControlFocus(false); sync() }, dispose() { if (disposed) return; disposed = true; for (const [target, type, fn] of listeners) target.removeEventListener(type, fn); root.hidden = info.hidden = true; root.setAttribute('inert', ''); rows.clear() } }
}

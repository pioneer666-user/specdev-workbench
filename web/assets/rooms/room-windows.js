// 家具与设置同属一个前台窗口；阅读器覆盖时保留家具上下文，背景仍受闸门控制。
import { createFurnitureThumbnail } from './furniture-thumbnail.js'
export function createRoomWindows({ browser, settings, settingsButton, selection, assembly, display, createPreview, canInteract, onChange, onRead, focusScene }) {
  const doc = browser.ownerDocument, listeners = [], items = new Map(assembly.instances.map(item => [item.instanceId, item]))
  let kind = null, returnFocus = null, covered = false, suspended = false, disposed = false, preview = null, renderedId = null
  const find = name => browser.querySelector(`[data-${name}]`)
  const choices = find('browser-choices'), prev = find('browser-prev'), next = find('browser-next'), details = find('browser-details'), choiceButtons = new Map()
  const status = find('preview-status'), retry = find('preview-retry'), reset = find('preview-reset')
  const listen = (node, type, fn) => { node.addEventListener(type, fn); listeners.push([node, type, fn]) }
  const active = () => !disposed && !suspended && !covered && !!kind && canInteract()
  const usable = node => node?.isConnected && !node.disabled && !node.closest('[hidden], [inert]')
  const tabs = [...settings.querySelectorAll('[role="tab"]')]
  const tablist = settings.querySelector('[role="tablist"]'), narrow = doc.defaultView.matchMedia?.('(max-width: 540px)')
  const orientation = () => { tablist.setAttribute('aria-orientation', narrow?.matches ? 'horizontal' : 'vertical') }
  orientation()
  if (narrow) listen(narrow, 'change', orientation)
  function chooseTab(tab) {
    if (!active() || kind !== 'settings') return
    for (const item of tabs) {
      const selected = item === tab
      item.setAttribute('aria-selected', String(selected)); item.tabIndex = selected ? 0 : -1
      doc.getElementById(item.getAttribute('aria-controls')).hidden = !selected
    }
    settings.querySelector('.room-settings-content').scrollTop = 0
    onChange()
  }
  for (const tab of tabs) {
    listen(tab, 'click', () => chooseTab(tab))
    listen(tab, 'keydown', event => {
      const key = event.key
      const vertical = tablist.getAttribute('aria-orientation') === 'vertical'
      const before = vertical ? 'ArrowUp' : 'ArrowLeft', after = vertical ? 'ArrowDown' : 'ArrowRight'
      if (![before, after, 'Home', 'End'].includes(key) || !active()) return
      event.preventDefault()
      const index = key === 'Home' ? 0 : key === 'End' ? tabs.length - 1 : (tabs.indexOf(tab) + (key === before ? -1 : 1) + tabs.length) % tabs.length
      chooseTab(tabs[index]); tabs[index].focus()
    })
  }
  for (const [index, item] of selection.items.entries()) {
    const li = doc.createElement('li'), button = doc.createElement('button'), name = doc.createElement('span')
    button.type = 'button'; button.dataset.browserInstance = item.instanceId; name.textContent = item.name
    button.setAttribute('aria-label', `${index + 1}. ${item.name}`)
    button.append(createFurnitureThumbnail(doc, item), name)
    listen(button, 'click', () => { if (active() && kind === 'furniture') selection.select(item.instanceId) })
    li.append(button); choices.append(li); choiceButtons.set(item.instanceId, button)
  }
  function previewStatus(state, text) {
    if (disposed || kind !== 'furniture') return
    status.textContent = text; retry.hidden = state !== 'error'; reset.disabled = state !== 'ready'
    status.dataset.state = state
  }
  function ensurePreview() {
    if (preview || !active() || kind !== 'furniture' || !selection.getSelected()) return
    try { preview = createPreview({ container: find('preview-host'), onStatus: previewStatus }) }
    catch (error) { previewStatus('error', `预览暂不可用：${error.message}`) }
  }
  function sync() {
    if (disposed) return
    browser.hidden = kind !== 'furniture' || covered
    settings.hidden = kind !== 'settings' || covered
    for (const root of [browser, settings]) root.toggleAttribute('inert', root.hidden || !active())
    settingsButton.setAttribute('aria-expanded', String(kind === 'settings'))
    const selected = selection.getSelected(), index = selection.items.indexOf(selected)
    for (const [id, button] of choiceButtons) { button.disabled = !active(); button.setAttribute('aria-pressed', String(id === selected?.instanceId)) }
    find('browser-current').textContent = selected?.name ?? '房间里还没有家具'
    prev.disabled = !active() || index <= 0; next.disabled = !active() || index < 0 || index >= selection.items.length - 1
    find('browser-index').textContent = index < 0 ? '0 / 0' : `${index + 1} / ${selection.items.length}`
    if (kind === 'furniture') {
      find('browser-state').textContent = selected ? `${selected.status} · ${display.getState(selected.instanceId).label}` : '空房间'
      if (renderedId !== selected?.instanceId) {
        renderedId = selected?.instanceId
        details.scrollTop = 0
        find('browser-name').textContent = selected?.name ?? '等待一件心爱的家具'
        find('browser-summary').textContent = selected?.summary ?? ''; find('browser-summary').hidden = !selected?.summary
        const parent = selection.items.find(item => item.instanceId === selected?.parentInstanceId)
        find('browser-relation').textContent = parent ? `放在「${parent.name}」上` : ''
        find('browser-relation').hidden = !parent
        const materials = find('browser-materials'); materials.textContent = ''
        for (const entry of selected?.binding?.entries ?? []) {
          const li = doc.createElement('li'), button = doc.createElement('button'), label = doc.createElement('small'), title = doc.createElement('span')
          button.type = 'button'; label.textContent = entry.kind === 'document' ? '文档' : entry.diagramType === 'lifecycle' ? '生命周期图' : '流程图'; title.textContent = entry.title
          button.append(label, title); button.addEventListener('click', () => {
            if (active() && kind === 'furniture' && materials.contains(button) && selection.getSelected() === selected) onRead(selected, button, entry)
          }); li.append(button); materials.append(li)
        }
        find('browser-empty').textContent = selected ? selected.binding?.entries.length ? '' : selected.status : '先在房间配置中放入家具，即可在这里浏览。'
        if (!selected) previewStatus('empty', '房间里还没有家具')
      }
      ensurePreview()
      preview?.suspend(!active()); if (selected) preview?.show(items.get(selected.instanceId))
    } else preview?.suspend(true)
  }
  function close() {
    if (disposed || !kind) return
    kind = null; preview?.dispose(); preview = null; renderedId = null
    onChange(); sync()
    if (usable(returnFocus)) returnFocus.focus({ preventScroll: true }); else focusScene()
    returnFocus = null
  }
  function open(value, origin) {
    if (disposed || suspended || covered || kind || !canInteract()) return false
    kind = value; returnFocus = origin; renderedId = null
    if (value === 'furniture' && !selection.getSelected() && selection.items.length) selection.select(selection.items[0].instanceId)
    onChange(); sync()
    ;(value === 'furniture' ? browser : settings).querySelector('[data-window-close]').focus()
    return true
  }
  function change(delta) { if (!active() || kind !== 'furniture') return; const i = selection.items.indexOf(selection.getSelected()); const item = selection.items[i + delta]; if (item) selection.select(item.instanceId) }
  listen(prev, 'click', () => change(-1)); listen(next, 'click', () => change(1))
  listen(reset, 'click', () => { if (active() && kind === 'furniture' && !reset.disabled) preview?.reset() })
  listen(retry, 'click', () => { if (!active() || kind !== 'furniture' || retry.hidden) return; if (!preview) { ensurePreview(); preview?.show(items.get(selection.getSelected()?.instanceId)) } else preview.retry() })
  listen(settingsButton, 'click', () => { if (usable(settingsButton)) open('settings', settingsButton) })
  for (const root of [browser, settings]) {
    listen(root.querySelector('[data-window-close]'), 'click', () => { if (active()) close() })
    for (const type of ['pointerdown', 'wheel']) listen(root, type, event => event.stopPropagation())
    // OrbitControls在document结束拖动；只放行预览canvas的松开，背景闸门仍暂停。
    listen(root, 'pointerup', event => { if (!find('preview-host').contains(event.target)) event.stopPropagation() })
    listen(root, 'keydown', event => {
      event.stopPropagation()
      if (!active()) { event.preventDefault(); return }
      if (event.key === 'Escape') { event.preventDefault(); close(); return }
      if (event.key !== 'Tab') return
      const nodes = [...root.querySelectorAll('button,select,input,canvas[tabindex],summary,a[href]')].filter(node => node.tabIndex >= 0 && !node.disabled && !node.closest('[hidden], [inert]') && (!node.closest('details') || node.closest('details').open || node.tagName === 'SUMMARY'))
      const first = nodes[0], last = nodes.at(-1)
      if (event.shiftKey && (doc.activeElement === first || !root.contains(doc.activeElement))) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && (doc.activeElement === last || !root.contains(doc.activeElement))) { event.preventDefault(); first?.focus() }
    })
  }
  return {
    openFurniture: origin => open('furniture', origin), isOpen: () => kind !== null, isFurniture: () => kind === 'furniture', isSettings: () => kind === 'settings', sync,
    cover(value) { covered = value; sync() }, suspend(value) { suspended = value; sync() },
    dispose() { if (disposed) return; disposed = true; preview?.dispose(); preview = null; kind = null; for (const [node, type, fn] of listeners) node.removeEventListener(type, fn); browser.hidden = settings.hidden = true; browser.setAttribute('inert', ''); settings.setAttribute('inert', '') },
  }
}

// 资料标记只有有限的屏幕避让；投影/遮挡由原场景提供，不另建相机或帧循环。
import { createPickGesture } from './pick-gesture.js'
export const MATERIAL_HINT_LIMIT = 64
const OFFSETS = [[0, -14], [36, -14], [-36, -14], [0, -50], [36, -50], [-36, -50], [0, 22], [36, 22], [-36, 22]]

export function arrangeMaterialHints(points, width, height) {
  const placed = []
  for (const point of points.slice(0, MATERIAL_HINT_LIMIT)) {
    if (!point.visible || !Number.isFinite(point.x) || !Number.isFinite(point.y)) continue
    // 原锚点必须在画面内，不能靠避让把屏外家具拉回来。
    if (point.x < 0 || point.x > width || point.y < 0 || point.y > height) continue
    for (const [dx, dy] of OFFSETS) {
      const x = point.x + dx, y = point.y + dy
      if (x < 18 || x > width - 18 || y < 18 || y > height - 18) continue
      if (placed.some((other) => Math.abs(other.x - x) < 34 && Math.abs(other.y - y) < 34)) continue
      placed.push({ instanceId: point.instanceId, x, y })
      break
    }
  }
  return placed
}

export function createMaterialHints({ container, items, project, canInteract, clearInput, onOpen, focusFallback }) {
  const layer = document.createElement('div')
  layer.className = 'room-material-hints'
  layer.setAttribute('aria-label', '家具资料入口')
  const tooltip = document.createElement('span')
  tooltip.className = 'room-material-name'
  tooltip.hidden = true
  const records = new Map(), listeners = []
  let disposed = false, pointerStart = null, hovered = null
  const gesture = createPickGesture()
  const listen = (target, type, fn) => { target.addEventListener(type, fn); listeners.push([target, type, fn]) }
  const available = record => !disposed && canInteract() && !layer.hidden && !record.button.hidden
  function cancelGesture() { gesture.cancel(); pointerStart = null; hovered = null; tooltip.hidden = true }
  function describe(record) {
    if (tooltip.textContent !== record.title) tooltip.textContent = record.title
    tooltip.hidden = false
    const left = `${Math.max(8, Math.min(container.clientWidth - 208, record.x - 16))}px`
    const height = tooltip.offsetHeight || 28
    const below = record.y + 20
    const top = `${Math.max(8, Math.min(container.clientHeight - height - 8, below + height <= container.clientHeight - 8 ? below : record.y - height - 20))}px`
    if (tooltip.style.left !== left) tooltip.style.left = left
    if (tooltip.style.top !== top) tooltip.style.top = top
  }
  for (const item of items.slice(0, MATERIAL_HINT_LIMIT)) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'room-material-hint'
    button.textContent = '▤'
    button.hidden = true
    button.setAttribute('aria-label', `阅读资料：${item.title}`)
    const record = { ...item, button, x: 0, y: 0 }
    records.set(item.instanceId, record)
    listen(button, 'pointerenter', () => { if (!available(record)) return; hovered = record; describe(record) })
    listen(button, 'pointerleave', () => { pointerStart = null; gesture.cancel(); hovered = null; tooltip.hidden = true; const focused = [...records.values()].find((entry) => entry.button === document.activeElement); if (focused) describe(focused) })
    listen(button, 'focus', () => { if (!available(record)) return; clearInput(); describe(record) })
    listen(button, 'blur', () => { tooltip.hidden = true; if (hovered) describe(hovered) })
    listen(button, 'pointerdown', (event) => { if (!available(record)) return; event.stopPropagation(); clearInput(); gesture.down(event); pointerStart = { button } })
    listen(button, 'pointermove', event => gesture.move(event))
    listen(button, 'pointercancel', cancelGesture)
    listen(button, 'wheel', cancelGesture)
    listen(button, 'click', (event) => {
      event.stopPropagation()
      const down = pointerStart; pointerStart = null
      if (event.detail > 0 && (!down || down.button !== button || !gesture.up(event))) return
      gesture.cancel()
      if (!available(record) || !project(record).visible) return
      clearInput()
      onOpen({ ...record.pick, returnFocus: button })
    })
    listen(button, 'keydown', (event) => { if (!available(record)) return; event.stopPropagation(); clearInput(); if (event.key === 'Escape') { event.preventDefault(); focusFallback.focus() } })
    layer.append(button)
  }
  layer.append(tooltip)
  container.append(layer)
  function update() {
    if (disposed) return
    const active = canInteract()
    layer.hidden = !active
    if (!active) {
      cancelGesture()
      if (layer.contains(document.activeElement)) focusFallback.focus()
      return
    }
    const placed = arrangeMaterialHints([...records.values()].map((entry) => ({ instanceId: entry.instanceId, ...project(entry) })), container.clientWidth, container.clientHeight)
    const positions = new Map(placed.map((entry) => [entry.instanceId, entry]))
    for (const record of records.values()) {
      const point = positions.get(record.instanceId)
      if (!point && document.activeElement === record.button) focusFallback.focus()
      record.button.hidden = !point
      if (!point) continue
      if (record.x !== point.x || record.y !== point.y) {
        record.x = point.x; record.y = point.y
        record.button.style.transform = `translate(${point.x}px, ${point.y}px)`
      }
    }
    const named = [...records.values()].find((entry) => entry.button === document.activeElement) ?? hovered
    if (named && !named.button.hidden) describe(named)
    else tooltip.hidden = true
  }
  return { update, cancelGesture, dispose() { if (disposed) return; disposed = true; cancelGesture(); for (const [target, type, fn] of listeners) target.removeEventListener(type, fn); records.clear(); layer.remove() } }
}

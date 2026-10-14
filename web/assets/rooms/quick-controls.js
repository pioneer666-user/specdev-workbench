// 快捷控件只保存浮层种类，亮度与音量直接读写原控制器，不另造播放或偏好状态。
export function createQuickControls({ root, viewport, sound, getBrightness, setBrightness, canInteract, onChange, clearInput, focusScene }) {
  const doc = root.ownerDocument, win = doc.defaultView, get = id => doc.getElementById(id), listeners = []
  const brightness = get('quickBrightness'), toggle = get('quickSound'), expand = get('quickSoundExpand')
  const triggers = [brightness, toggle, expand]
  let kind = null, origin = null, disposed = false, consumePointer = false
  const listen = (node, type, fn, capture = false) => { node.addEventListener(type, fn, capture); listeners.push([node, type, fn, capture]) }
  const usable = () => !disposed && canInteract()
  const stop = event => { event.preventDefault(); event.stopImmediatePropagation() }
  function position() {
    if (!kind) return
    const box = viewport.getBoundingClientRect(), anchor = (kind === 'brightness' ? brightness : expand).getBoundingClientRect()
    // 相对视口定位；工具栏换行、宿主缩放后仍留安全边距，小屏内容在浮层内部滚动。
    const width = Math.min(280, Math.max(0, box.width - 24))
    root.style.width = `${width}px`
    root.style.maxHeight = `${Math.max(0, box.height - 24)}px`
    root.style.left = `${Math.max(12, Math.min(anchor.left - box.left, box.width - width - 12))}px`
    root.style.top = `${Math.max(12, Math.min(anchor.bottom - box.top + 8, box.height - root.offsetHeight - 12))}px`
  }
  function sync() {
    if (disposed) return
    const state = sound.get(), light = getBrightness()
    for (const button of triggers) button.disabled = !usable()
    brightness.setAttribute('aria-expanded', String(kind === 'brightness'))
    expand.setAttribute('aria-expanded', String(kind === 'sound'))
    expand.setAttribute('aria-label', kind === 'sound' ? '收起总音量' : '展开总音量'); expand.title = expand.getAttribute('aria-label')
    toggle.setAttribute('aria-pressed', String(state.enabled))
    const status = !state.enabled ? '声音已关闭' : state.retry ? '声音待手动继续' : state.masterVolume === 0 ? '总音量为 0 · 静音' : state.message
    const action = state.enabled ? '关闭全部声音' : '开启全部声音'
    toggle.setAttribute('aria-label', `${action}；${status}`); toggle.title = `${action} · ${status}`
    toggle.dataset.soundState = !state.enabled ? 'off' : state.retry ? 'paused' : state.masterVolume === 0 ? 'muted' : 'enabled'
    toggle.querySelector('[data-sound-on]').toggleAttribute('hidden', !state.enabled || state.masterVolume === 0)
    toggle.querySelector('[data-sound-off]').toggleAttribute('hidden', state.enabled && state.masterVolume > 0)
    get('quickSoundStatus').textContent = status
    get('quickSoundRetry').hidden = !state.enabled || !state.retry
    get('quickSoundRetry').disabled = !usable() || kind !== 'sound'
    get('quickMasterVolume').value = String(state.masterVolume); get('quickMasterValue').textContent = `${state.masterVolume}%`
    get('quickBrightnessSlider').value = String(light.value); get('quickBrightnessValue').textContent = String(Math.round(light.value))
    get('quickBrightnessSlider').disabled = !usable() || kind !== 'brightness'
    get('quickMasterVolume').disabled = !usable() || kind !== 'sound'
    get('quickTitle').textContent = kind === 'sound' ? '房间声音' : '房间亮度'
    get('quickBrightnessPanel').hidden = kind !== 'brightness'; get('quickSoundPanel').hidden = kind !== 'sound'
    root.hidden = !kind; root.toggleAttribute('inert', !kind || !usable())
    position()
  }
  function close(restoreFocus = true) {
    if (disposed || !kind) return
    const previous = origin; kind = null; origin = null
    clearInput(); onChange(); sync()
    if (restoreFocus) {
      if (previous?.isConnected && !previous.disabled && !previous.closest('[hidden], [inert]')) previous.focus({ preventScroll: true })
      else focusScene()
    }
  }
  function open(value, button) {
    if (!usable()) return
    kind = value; origin = button
    clearInput(); onChange(); sync()
    get(value === 'brightness' ? 'quickBrightnessSlider' : 'quickMasterVolume').focus({ preventScroll: true })
  }
  listen(brightness, 'click', () => { if (usable()) kind === 'brightness' ? close() : open('brightness', brightness) })
  listen(expand, 'click', () => { if (usable()) kind === 'sound' ? close() : open('sound', expand) })
  listen(toggle, 'click', () => {
    if (!usable()) return
    const enabled = sound.get().enabled
    if (!enabled) open('sound', toggle)
    void sound.setEnabled(!enabled)
  })
  listen(get('quickClose'), 'click', () => { if (usable()) close() })
  listen(get('quickSoundRetry'), 'click', () => { if (usable() && kind === 'sound' && sound.get().retry) void sound.retry() })
  listen(get('quickMasterVolume'), 'input', () => { if (usable() && kind === 'sound') sound.setMasterVolume(Number(get('quickMasterVolume').value)) })
  const slider = get('quickBrightnessSlider')
  listen(slider, 'input', () => { if (usable() && kind === 'brightness') setBrightness(Number(slider.value)) })
  listen(slider, 'keydown', event => {
    if (!usable() || kind !== 'brightness') return
    const value = Number(slider.value), next = { ArrowLeft: value - 1, ArrowDown: value - 1, ArrowRight: value + 1, ArrowUp: value + 1, Home: 0, End: 100 }[event.key]
    if (next !== undefined) { event.preventDefault(); setBrightness(next) }
  })
  // 捕获外部的一整次手势，包括关闭后的 pointerup/click，避免此击落到家具/相机。
  listen(doc, 'pointerdown', event => {
    consumePointer = false
    if (!kind || root.contains(event.target) || triggers.some(node => node.contains(event.target))) return
    consumePointer = true; stop(event); close()
  }, true)
  for (const type of ['pointerup', 'click']) listen(doc, type, event => {
    if (consumePointer) { stop(event); if (type === 'click') consumePointer = false; return }
    if (type === 'click' && kind && !root.contains(event.target) && !triggers.some(node => node.contains(event.target))) { stop(event); close() }
  }, true)
  listen(doc, 'pointercancel', () => { consumePointer = false }, true)
  listen(doc, 'wheel', event => { if (kind && !root.contains(event.target)) stop(event) }, true)
  listen(doc, 'keydown', event => {
    if (!kind) return
    if (!usable()) { stop(event); return }
    if (event.key === 'Escape') { stop(event); close(); return }
    if (event.key !== 'Tab') return
    const nodes = [...triggers, ...root.querySelectorAll('button,input')].filter(node => !node.disabled && !node.closest('[hidden], [inert]'))
    const index = nodes.indexOf(doc.activeElement), next = (index + (event.shiftKey ? -1 : 1) + nodes.length) % nodes.length
    stop(event); nodes[next]?.focus()
  }, true)
  for (const type of ['pointerdown', 'pointerup', 'wheel', 'keydown', 'keyup']) listen(root, type, event => event.stopPropagation())
  for (const button of triggers) for (const type of ['pointerdown', 'pointerup', 'keydown', 'keyup']) listen(button, type, event => event.stopPropagation())
  listen(win, 'resize', position)
  sync()
  return { isOpen: () => !!kind, isBrightness: () => kind === 'brightness', sync, close,
    deactivate() { close(false); sync() },
    dispose() { if (disposed) return; kind = null; disposed = true; for (const [node, type, fn, capture] of listeners) node.removeEventListener(type, fn, capture); root.hidden = true; root.setAttribute('inert', ''); for (const button of triggers) button.disabled = true },
  }
}

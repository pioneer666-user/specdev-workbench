// 在官方图子文档Realm执行，只桥接已登记信息卡、选中及未消费的ESC。
(() => {
  const config = JSON.parse(document.getElementById('specdev-official-config').textContent)
  const svg = document.querySelector('.diagram-container > svg')
  if (!svg) return
  let alive = true, nativeOverlay = false
  const send = (action, fields = {}) => { if (alive) parent.postMessage({ type: 'specdev-official', contextId: config.contextId, token: config.token, action, ...fields }, location.origin) }
  const selection = () => {
    const nodes = [...svg.querySelectorAll('[data-node-id][data-focus-selected]')]
    const id = nodes.length === 1 ? nodes[0].getAttribute('data-node-id') : null
    return config.entities.includes(id) ? id : null
  }
  const sync = () => {
    const id = selection(); send('selection', { entityId: id })
    // local-only原生位置仍可通过键盘激活，不伪造远程href。
    for (const link of document.querySelectorAll('#focus-evidence-links div.semantic-passport-source')) { link.tabIndex = 0; link.setAttribute('role', 'button') }
  }
  const open = event => {
    if (event.type === 'click' && (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)) return
    if (event.type === 'keydown' && !['Enter', ' '].includes(event.key)) return
    const link = event.target.closest?.('.semantic-passport-source'), container = document.getElementById('focus-evidence-links')
    if (!link || !container?.contains(link)) return
    const id = selection()
    if (!id || document.getElementById('focus-id')?.textContent !== id) return
    const sources = [...container.querySelectorAll('.semantic-passport-source')], index = sources.indexOf(link)
    const ref = config.refs.find(x => x.entityId === id && x.sourceIndex === index)
    if (!ref || link.querySelector('small')?.textContent !== ref.path || (ref.href ? link.href !== ref.href : link.tagName !== 'DIV')) return
    const expectedLine = ref.fromLine === null ? '' : `L${ref.fromLine}${ref.toLine && ref.toLine !== ref.fromLine ? '–' + ref.toLine : ''}${ref.href ? ' ↗' : ''}`
    if ((ref.authoredLabel && link.querySelector('strong')?.textContent !== ref.authoredLabel) || (ref.fromLine !== undefined && link.querySelector('code')?.textContent !== expectedLine)) return
    event.preventDefault(); event.stopPropagation(); send('evidence', { refId: ref.id })
  }
  const capture = event => { if (event.key === 'Escape') nativeOverlay = document.documentElement.getAttribute('data-reader-rail') === 'overlay' }
  const key = event => {
    open(event)
    if (event.key === 'Escape' && !event.defaultPrevented && !nativeOverlay && !document.querySelector('dialog[open]')) send('escape')
  }
  const observer = new MutationObserver(sync)
  observer.observe(svg, { subtree: true, attributes: true, attributeFilter: ['data-focus-selected'] })
  function dispose() { if (!alive) return; alive = false; observer.disconnect(); document.removeEventListener('click', open, true); document.removeEventListener('keydown', capture, true); document.removeEventListener('keydown', key); window.removeEventListener('pagehide', dispose) }
  window.SpecDevOfficialBridge?.dispose()
  window.SpecDevOfficialBridge = { dispose }
  document.addEventListener('click', open, true); document.addEventListener('keydown', capture, true); document.addEventListener('keydown', key)
  window.addEventListener('pagehide', dispose); sync()
})()

// 样式前初始化；通信只传深浅色，不读取或写入宿主配置。
;((window, document) => {
  const KEY = 'specdev-last-host-theme', CHANNEL = 'specdev-theme-v1'
  const valid = v => v === 'light' || v === 'dark'
  const read = () => { try { return sessionStorage.getItem(KEY) } catch { return null } }
  let lastHost = read(), hostMode = null, mode, active = false
  let channel, timer, parentStop, parentObserver, parentController, parentMode, source = null, revision = -1, seen = 0, sequence = 0
  const requests = new Map(), subscribers = new Set()
  const media = window.matchMedia?.('(prefers-color-scheme: light)')
  const id = () => window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`
  const token = v => typeof v === 'string' && v.length > 0 && v.length <= 100
  const snapshot = () => ({ mode, hostMode, lastHostMode: valid(lastHost) ? lastHost : null, connected: valid(hostMode) })
  function apply() {
    mode = parentController ? parentMode : valid(hostMode) ? hostMode : valid(lastHost) ? lastHost : media?.matches ? 'light' : 'dark'
    if (!document.documentElement) return // 已销毁的子文档不再写DOM。
    document.documentElement.dataset.theme = mode
    document.documentElement.style.colorScheme = mode
    for (const fn of subscribers) fn(snapshot())
  }
  function remember(value) {
    if (!valid(value)) return
    lastHost = value
    try { sessionStorage.setItem(KEY, value) } catch { /* 禁止存储时保留本页内存记录。 */ }
  }
  const setHost = value => { hostMode = valid(value) ? value : null; if (valid(hostMode)) remember(hostMode); apply() }
  window.SpecDevTheme = { get: snapshot,
    subscribe(fn) { subscribers.add(fn); fn(snapshot()); return () => subscribers.delete(fn) },
  }
  function disconnect() { source = null; revision = -1; seen = 0; requests.clear(); setHost(null) }
  function closeChannel() { if (channel) { channel.removeEventListener('message', receive); channel.close(); channel = null } }
  function sendRequest() {
    if (!channel) return
    const now = Date.now()
    for (const [key, time] of requests) if (now - time > 30000) requests.delete(key)
    const request = id() + '-' + (++sequence)
    requests.set(request, now)
    try { channel.postMessage({ v: 1, type: 'request', request, source }) } catch { disconnect(); closeChannel() }
  }
  function receive({ data: m }) {
    if (!active || !m || m.v !== 1 || !['response', 'update'].includes(m.type)
      || !token(m.source) || !Number.isSafeInteger(m.revision) || m.revision < 0 || !valid(m.mode)) return
    if (m.type === 'response') {
      if (!token(m.request) || !requests.has(m.request) || Date.now() - requests.get(m.request) > 30000) return
      if (source && m.source !== source) return
      requests.delete(m.request)
      if (!source) { source = m.source; revision = -1 }
    } else if (!source || m.source !== source) return
    if (m.revision < revision || (m.revision === revision && m.mode !== hostMode)) return
    if (m.type === 'update' && m.revision === revision) return
    revision = m.revision; seen = Date.now(); setHost(m.mode)
  }
  function openChannel() {
    try { channel = new window.BroadcastChannel(CHANNEL); channel.addEventListener('message', receive) } catch { channel = null }
  }
  function tick() {
    if (source && Date.now() - seen > 30000) disconnect()
    if (!channel) openChannel()
    sendRequest()
  }
  const desktopEvent = event => { if (active && !parentController) setHost(event.detail?.mode) }
  function connect() {
    if (active) return
    active = true
    // 资料页只继承仍存活的同源插件父控制器。
    try {
      const p = window.parent, url = new URL(p.location.href)
      if (p !== window && url.protocol === location.protocol && url.hostname === location.hostname && url.port === location.port
        && (url.pathname === '/specdev-workbench' || url.pathname.startsWith('/specdev-workbench/')) && p.SpecDevTheme) {
        parentController = p.SpecDevTheme
        parentStop = parentController.subscribe(state => { if (active) {
          parentMode = state.mode; hostMode = state.connected && valid(state.hostMode) ? state.hostMode : null
          // 只继承父页确认过的宿主记录，系统备用色不能变成宿主缓存。
          lastHost = valid(state.lastHostMode) ? state.lastHostMode : null
          if (valid(state.lastHostMode)) remember(state.lastHostMode)
          apply()
        } })
        const frame = window.frameElement
        if (frame) {
          parentObserver = new p.MutationObserver(() => { if (!frame.isConnected || frame.contentWindow !== window) stop() })
          parentObserver.observe(p.document, { childList: true, subtree: true })
        }
      }
    } catch { /* 无权访问父文档时使用通道或备用主题。 */ }
    document.addEventListener('specdev-host-theme', desktopEvent)
    document.addEventListener('DOMContentLoaded', apply)
    document.addEventListener('visibilitychange', visible)
    media?.addEventListener?.('change', changeMedia)
    if (!parentStop && location.protocol !== 'dsh-app:') { openChannel(); sendRequest(); timer = window.setInterval(tick, 10000) }
    document.dispatchEvent(new window.CustomEvent('specdev-theme-ready'))
    apply() // 恢复时立即显示最后宿主色，首次无记录才使用当前系统值。
  }
  function stop() {
    if (!active) return
    active = false; window.clearInterval(timer); timer = null
    parentStop?.(); parentStop = null; parentObserver?.disconnect(); parentObserver = null
    parentController = null; parentMode = null; closeChannel()
    document.removeEventListener('specdev-host-theme', desktopEvent)
    document.removeEventListener('DOMContentLoaded', apply)
    document.removeEventListener('visibilitychange', visible)
    media?.removeEventListener?.('change', changeMedia)
    disconnect()
  }
  const changeMedia = () => { if (active) apply() }
  const visible = () => { if (active && !document.hidden && !parentStop && location.protocol !== 'dsh-app:') tick() }
  window.addEventListener('pagehide', stop)
  window.addEventListener('pageshow', () => { connect(); if (!parentStop && location.protocol !== 'dsh-app:') tick() })
  apply(); connect()
})(window, document)

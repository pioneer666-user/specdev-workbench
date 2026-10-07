// 房间阅读面板（E3b-2；E9c 扩展流程图）：点书架、告示牌或"业务资料"后在房间之上
// 打开的资料集合与阅读区。文档继续本模块正文阅读；流程图复用既有 read 页面装进
// iframe（不开新标签、不另造图渲染）。本模块只负责 DOM 面板、资料请求、焦点与请求
// 失效；不 import Three、场景、旧建筑模型或业务清单读取代码。正文共用 markdown.js
// 的受控令牌 DOM 输出，HTML 字符一律按文字显示。
// 流程图的打开做法迁用 building.js 的 openWorkflowReader：先 fetch 同工作区阅读入口，
// 取不到如实报错并可重试；取到再设 iframe 地址——预检 200 只证明 read.html 可达，
// 图文件缺失、坏 JSON 和编译问题由阅读页自己显示，不用 iframe 的 error 事件判断。
//
// 暂停与恢复不在本模块：open/close 时经 onReadingChange 通知页面（页面调场景句柄
// setReading 并同步按钮），重复 open 不重复暂停，dispose 不触发恢复。
// iframe 里的阅读页按既有约定（panel-link.js）把 ESC 转发回来关面板；它自己的
// 节点详情等 dialog 开着时先按原行为关 dialog，不提前退出面板——本模块不改 read.js。
import { el, wsUrl } from '../common.js'
import { renderMarkdown } from '../markdown.js'
import { listenMaterialClose } from '../panel-link.js'
import { isChartMaterial, chartMaterialLabel } from '../chart-entities.js'
import { materialFetch, offlineRuntime, listenOfflineClose } from '../runtime-mode.js'

/** 接口失败时优先说后端给的中文原因（JSON 错误体的 error 字段），拿不到再按 HTTP 状态说。
 *  与 building.js 同口径（迁用，不 import 整个页面脚本）。 */
async function failureReason(response) {
  try {
    const body = await response.json()
    if (body && typeof body.error === 'string' && body.error) return body.error
  } catch { /* 正文不是 JSON：按状态码说。 */ }
  return `HTTP ${response.status}`
}

/**
 * 房间阅读面板。
 * @param root           room.html 里唯一的阅读覆盖层（面板放在 viewport 外、roomStage 内，
 *                       背景视口加 inert 不会波及面板）
 * @param onReadingChange 开／关面板时各通知一次（true＝进入阅读，false＝退出）；页面负责
 *                       暂停场景与按钮同步
 * @param focusFallback  归还焦点时的兜底元素（触发元素已不在文档里时用）
 * @returns { open({ title, entries, emptyText, returnFocus }), close(), isOpen(), dispose() }
 *   entries 条目来自 resolver 已验证的目录（{ kind: 'document'|'workflow', … }），本模块
 *   不自行造链接；文档条目带 path，图条目带 chartId（unavailableReason 的登记图不发请求）。
 */

/** 资料条目的稳定身份（与绑定层同口径）：文档＝登记路径、流程图＝图 ID；不按标题区分。 */
const materialKey = (entry) => (isChartMaterial(entry) ? `chart:${entry.chartId}` : `doc:${entry.path}`)

/** 清单与标题里的人话前缀。 */
const kindLabel = (entry) => (isChartMaterial(entry) ? chartMaterialLabel(entry) : '文档')

export function createRoomReader({ root, onReadingChange = () => {}, focusFallback = null, documents = [] } = {}) {
  const panel = root.querySelector('#readerPanel')
  const title = root.querySelector('#readerTitle')
  const closeBtn = root.querySelector('#readerClose')
  const listLabel = root.querySelector('#readerListLabel')
  const list = root.querySelector('#readerList')
  const count = root.querySelector('#readerCount')
  const listEmpty = root.querySelector('#readerEmpty')
  const hint = root.querySelector('#readerHint')
  const docTitle = root.querySelector('#readerDocTitle')
  const status = root.querySelector('#readerStatus')
  const body = root.querySelector('#readerBody')
  const retryLine = root.querySelector('#readerRetryLine')
  const retryBtn = root.querySelector('#readerRetry')
  const frameHost = root.querySelector('#readerFrameHost')
  const listToggle = root.querySelector('#readerListToggle')
  const listArrow = root.querySelector('#readerListArrow')
  const appearanceToggle = root.querySelector('#readerAppearanceToggle')
  const side = root.querySelector('.material-side')
  const startGuard = root.querySelector('#readerFocusStart')
  const endGuard = root.querySelector('#readerFocusEnd')

  let openState = false
  let disposed = false
  // 左侧清单收缩（作者令 2026-10-01）：换集合（open）时重置为展开——新集合要看清单；
  // 同一次打开内自由切换。T15唯一大尺寸，外观选择仅存于本页句柄，跨open/缓存保持。
  let listCollapsed = false
  let plainAppearance = false
  // 单调请求序号＝最终写入条件：换资料、换集合（resetReader）、关闭、dispose 都使旧序号
  // 失效；成功与失败分支在异步正文／错误体读取之后都复查"当前请求、面板仍开着、控制器仍存活"。
  let requestSeq = 0
  let currentEntry = null
  let returnFocus = null
  // 当前集合的条目表（按钮 → 已验证 entry，E3b-2 验收补齐 R1）：条目点击经 list 一次性
  // 委托分发，只认这张表——不从 DOM 的 dataset/path 重建资料链接；换集合清空、销毁清空。
  const entryByButton = new Map()
  // 图阅读页（E9c）：同时最多一个 iframe。每次选图新建节点，切走/换集合/关闭/销毁时
  // 清空导航（about:blank）、移除节点并解绑关闭消息监听——旧 load/消息不能改写新资料，
  // 也不能在关闭后复活面板。
  let frame = null
  let unlistenClose = null
  let unlistenFrameLoad = null

  const setNote = (kind, text) => {
    status.hidden = !text
    status.textContent = text || ''
    status.dataset.kind = kind || ''
  }

  /** 撤掉当前图 iframe：先解绑关闭消息，再清空导航并移除节点。幂等。 */
  function clearFrame() {
    if (unlistenFrameLoad) { unlistenFrameLoad(); unlistenFrameLoad = null }
    if (unlistenClose) {
      unlistenClose()
      unlistenClose = null
    }
    if (frame) {
      frame.removeAttribute('srcdoc')
      frame.setAttribute('src', 'about:blank')
      frame.remove()
      frame = null
    }
    frameHost.textContent = ''
    frameHost.hidden = true
  }

  const markActive = () => {
    const currentKey = currentEntry ? materialKey(currentEntry) : ''
    for (const button of list.querySelectorAll('.material-item')) {
      if (currentKey && button.dataset.material === currentKey) button.setAttribute('aria-current', 'true')
      else button.removeAttribute('aria-current')
    }
  }

  /** 换集合、换资料、关闭都走这里：使在途请求失效并回到"还没挑资料"。 */
  const resetReader = () => {
    requestSeq += 1
    currentEntry = null
    clearFrame()
    body.textContent = ''
    body.hidden = true
    retryLine.hidden = true
    docTitle.hidden = true
    setNote('', '')
    hint.textContent = '选择一份资料开始阅读'
    hint.hidden = false
    markActive()
  }

  const renderList = (entries, emptyText) => {
    list.textContent = '' // 旧按钮随清空移除（脱离文档的引用无法再冒泡到委托层）
    entryByButton.clear() // 换集合：旧条目表整体作废
    const empty = entries.length === 0
    listLabel.hidden = empty
    list.hidden = empty
    listEmpty.hidden = !empty
    listEmpty.textContent = empty ? emptyText : ''
    count.textContent = empty ? '' : `${entries.length} 份`
    for (const entry of entries) {
      const item = el('li')
      const button = el('button', 'material-item')
      button.type = 'button'
      button.dataset.kind = entry.kind
      button.dataset.material = materialKey(entry)
      button.textContent = `${kindLabel(entry)} · ${entry.title}`
      entryByButton.set(button, entry)
      item.appendChild(button)
      list.appendChild(item)
    }
  }

  const showFailure = (reason) => {
    setNote('bad', `读不到这份资料：${reason}。可以点“重试”再取一次。`)
    retryLine.hidden = false
  }

  /** 取一份文档的正文（不缓存：每次点击都重新请求，服务端仍负责当时的登记与文件权限）。
   *  入口先于一切 DOM 写入与请求检查存活与打开：销毁后或面板已关时，旧按钮引用
   *  （含已脱离文档的）不能再触发加载状态或发起新请求（E3b-2 验收补齐 R1）。 */
  async function openEntry(entry) {
    if (disposed || !openState) return
    if (body.contains(document.activeElement)) closeBtn.focus()
    requestSeq += 1 // 所有切换都先作废旧请求，包括不发请求的不可用图。
    currentEntry = entry
    markActive()
    hint.hidden = true
    docTitle.textContent = `${kindLabel(entry)} · ${entry.title}`
    docTitle.title = docTitle.textContent
    docTitle.hidden = isChartMaterial(entry) // 图内已有标题，不重复占正文上沿。
    body.textContent = ''
    body.hidden = true
    retryLine.hidden = true
    clearFrame() // 换目标：旧图先让位（含解绑监听），文档与图互不残留
    return isChartMaterial(entry) ? openChart(entry) : openDocument(entry)
  }

  /** 文档正文：错误体读取也是等待，期间用户可能已换目标/关面板。 */
  async function openDocument(entry) {
    setNote('info', '正在读取文档…')
    const seq = ++requestSeq
    try {
      const response = await materialFetch(wsUrl(entry.href))
      if (seq !== requestSeq || !openState || disposed) return
      if (!response.ok) {
        const reason = await failureReason(response) // 异步读错误体期间用户可能已换目标
        if (seq !== requestSeq || !openState || disposed) return
        return showFailure(reason)
      }
      const text = await response.text()
      if (seq !== requestSeq || !openState || disposed) return
      setNote('', '')
      renderDocumentBody(text, entry)
    } catch (error) {
      if (seq !== requestSeq || !openState || disposed) return
      showFailure(error instanceof Error ? error.message : String(error))
    }
  }

  /** 流程图（E9c）：入口预检（同 building.js 做法）成功后新建 iframe 装既有阅读页；
   *  重试按当前资料类型重新走本入口。坏登记条目（unavailableReason）不发网络请求，
   *  只显示说明——刷新房间后可重新读取登记状态。 */
  async function openChart(entry) {
    if (entry.unavailableReason) {
      setNote('bad', `这张流程图当前不可用：${entry.unavailableReason}。刷新房间后可重新读取登记状态。`)
      retryLine.hidden = true // 不发请求的说明不是网络失败，不给重试按钮
      return
    }
    setNote('info', '正在打开阅读页…')
    const seq = ++requestSeq
    const offline = offlineRuntime(), offlinePage = offline?.chartDocument(entry.chartId)
    if (offline && !offlinePage) { setNote('bad', '此资料未随包导出'); retryLine.hidden = true; return }
    const url = offline ? 'about:srcdoc' : wsUrl(entry.href)
    let response
    try {
      response = offline ? { ok: true } : await fetch(url)
    } catch (error) {
      if (seq !== requestSeq || !openState || disposed) return
      return showFailure(`阅读页没有打开（${error instanceof Error ? error.message : String(error)}）`)
    }
    if (seq !== requestSeq || !openState || disposed) return
    if (!response.ok) {
      const reason = await failureReason(response) // 异步读错误体期间用户可能已换目标
      if (seq !== requestSeq || !openState || disposed) return
      return showFailure(`阅读页打不开（${reason}）`)
    }
    if (seq !== requestSeq || !openState || disposed) return
    // 预检负责HTTP失败；load只结束外层重复提示，图API/编译成败仍由阅读页说明。
    const node = el('iframe', 'material-reader-frame')
    node.title = `流程图阅读：${entry.title}`
    frameHost.textContent = ''
    frameHost.appendChild(node)
    frameHost.hidden = false
    frame = node
    const expected = new URL(url, location.href)
    const onLoad = () => {
      if (disposed || !openState || frame !== node || currentEntry !== entry) return
      let actual
      try { actual = new URL(node.contentWindow.location.href) } catch { clearFrame(); showFailure('阅读页来源已变化，请重新选择流程图'); return }
      if (actual.href === 'about:blank') return
      if (offline ? actual.href !== 'about:srcdoc' || node.srcdoc !== offlinePage : actual.origin !== expected.origin || actual.pathname !== expected.pathname || actual.searchParams.get('workspace') !== expected.searchParams.get('workspace')) {
        clearFrame()
        showFailure('阅读页离开了当前流程图，请重新选择流程图')
        return
      }
      setNote('', '')
    }
    node.addEventListener('load', onLoad)
    unlistenFrameLoad = () => node.removeEventListener('load', onLoad)
    node.setAttribute('src', url)
    if (offline) node.srcdoc = offlinePage
    // 阅读页里按 ESC 会经 panel-link.js 转发关面板；只认当前 iframe 的同源消息。
    unlistenClose = offline ? listenOfflineClose(window, frame, () => close()) : listenMaterialClose(window, frame, () => close())
  }

  /** 三入口共用正文；相对链接仅从完整、已验证的本业务文档目录取目标。 */
  function renderDocumentBody(text, entry) {
    const available = documents.length ? documents : [...entryByButton.values()]
    const docs = available.filter(item => item.kind === 'document')
    renderMarkdown(body, text, { path: entry.path, documents: docs.map(item => item.path), openDocument: path => {
      const target = docs.find(item => item.path === path)
      if (target) void openEntry(target)
    } })
  }

  /** 清单与外观只改局部属性，不重置正文/iframe/请求，也不通知场景。 */
  const syncListToggle = () => {
    side.hidden = listCollapsed // DOM 与样式同步隐藏，焦点循环也能排除收起清单。
    side.toggleAttribute('inert', listCollapsed)
    if (listCollapsed) root.dataset.list = 'collapsed'
    else delete root.dataset.list
    const label = listCollapsed ? '展开资料清单' : '收起资料清单'
    listArrow.textContent = listCollapsed ? '→' : '←'
    listToggle.setAttribute('aria-label', label)
    listToggle.title = label
    listToggle.setAttribute('aria-expanded', String(!listCollapsed))
  }
  const syncAppearanceToggle = () => {
    root.dataset.appearance = plainAppearance ? 'plain' : 'material'
    appearanceToggle.textContent = plainAppearance ? '房间材质' : '朴素外观'
    appearanceToggle.title = `切换为${appearanceToggle.textContent}，保留当前资料与阅读位置`
    appearanceToggle.setAttribute('aria-pressed', String(plainAppearance))
  }

  function onListToggleClick(event) {
    if (disposed || !openState) return
    event.stopPropagation()
    if (!listCollapsed && side.contains(document.activeElement)) listToggle.focus()
    listCollapsed = !listCollapsed
    syncListToggle()
  }

  function onAppearanceToggleClick(event) {
    if (disposed || !openState) return
    event.stopPropagation()
    plainAppearance = !plainAppearance
    syncAppearanceToggle()
  }

  function open({ title: heading = '', entries = [], emptyText = '', returnFocus: focusTarget = null } = {}) {
    if (disposed) return
    const wasOpen = openState
    openState = true
    returnFocus = focusTarget || focusFallback
    title.textContent = heading
    title.title = heading
    renderList(Array.isArray(entries) ? entries : [], emptyText)
    listCollapsed = false // 换集合重置清单为展开；外观选择保持。
    syncListToggle()
    resetReader()
    root.hidden = false
    if (wasOpen) return // 已打开时换集合：不重复暂停、不动焦点
    onReadingChange(true)
    closeBtn.focus()
  }

  function close() {
    if (disposed || !openState) return
    openState = false
    requestSeq += 1 // 关闭后晚到的响应不能重新打开面板或写正文
    currentEntry = null
    clearFrame() // 关面板：停掉图阅读页与它的关闭消息监听（dispose 也不再补发恢复）
    root.hidden = true
    onReadingChange(false) // 页面先解除背景 inert，焦点才能落回触发元素
    const target = returnFocus
    returnFocus = null
    if (target && target.isConnected) target.focus?.()
    else if (focusFallback && focusFallback.isConnected) focusFallback.focus?.()
  }

  function dispose() {
    if (disposed) return
    disposed = true
    openState = false
    requestSeq += 1
    currentEntry = null
    returnFocus = null
    clearFrame() // 销毁后旧条目引用/委托不再请求或写 DOM（幂等：clearFrame 重复调用安全）
    root.removeEventListener('keydown', onRootKeydown)
    closeBtn.removeEventListener('click', onCloseClick)
    retryBtn.removeEventListener('click', onRetryClick)
    list.removeEventListener('click', onListClick)
    listToggle.removeEventListener('click', onListToggleClick)
    appearanceToggle.removeEventListener('click', onAppearanceToggleClick)
    startGuard.removeEventListener('focus', onStartGuardFocus)
    endGuard.removeEventListener('focus', onEndGuardFocus)
    entryByButton.clear()
  }

  function onCloseClick() { close() }

  function onRetryClick() {
    if (disposed || !openState || !currentEntry) return
    openEntry(currentEntry) // 重试取当前资料类型：文档重取正文、图重走入口预检
  }

  const visibleFocusables = () => [...root.querySelectorAll('button:not([disabled]), a[href], .markdown-table[tabindex="0"], iframe')]
    .filter((node) => !node.closest('[hidden]'))

  // 子文档键盘事件不会冒泡到父页：靠原生 Tab 离开 iframe 后到达的边界守卫回环。
  function onStartGuardFocus() {
    if (disposed || !openState) return
    const nodes = visibleFocusables()
    nodes.at(-1)?.focus()
  }
  function onEndGuardFocus() {
    if (disposed || !openState) return
    visibleFocusables()[0]?.focus()
  }

  /** 只在阅读开启时拦截 Escape／Tab，不影响原页面键盘操作。
   *  焦点循环收可见按钮与可见图 iframe（E9c）：键盘可以进图、离图、到关闭按钮并回环，
   *  不深入改子页控件。iframe 里的 ESC 由 read.js 经 panel-link.js 转发回来，不在这里处理。 */
  function onRootKeydown(event) {
    if (disposed || !openState) return
    event.stopPropagation() // 阅读器内按键不送到背景行走/拾取；保留控件原生按键默认行为。
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
      return
    }
    if (event.key !== 'Tab') return
    // 只算真正露着的控件（隐藏的重试行、空目录与收起的 iframe 不参与循环）。
    const focusables = visibleFocusables()
    if (focusables.length === 0) return
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    const inside = root.contains(document.activeElement)
    if (event.shiftKey && (document.activeElement === first || !inside)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && (document.activeElement === last || !inside)) {
      event.preventDefault()
      first.focus()
    }
  }

  /** 条目点击在 list 上一次性委托分发（E3b-2 验收补齐 R1）：只认当前条目表里的
   *  按钮——换集合后残留的旧按钮、销毁后保存的按钮引用都不处理；资料链接不从
   *  DOM 重建，entry 永远来自页面交入并经 resolver 验证的集合。 */
  function onListClick(event) {
    const button = event.target instanceof Element ? event.target.closest('.material-item') : null
    if (!button || !list.contains(button)) return
    const entry = entryByButton.get(button)
    if (!entry) return
    void openEntry(entry)
  }

  root.addEventListener('keydown', onRootKeydown)
  closeBtn.addEventListener('click', onCloseClick)
  retryBtn.addEventListener('click', onRetryClick)
  list.addEventListener('click', onListClick)
  listToggle.addEventListener('click', onListToggleClick)
  appearanceToggle.addEventListener('click', onAppearanceToggleClick)
  startGuard.addEventListener('focus', onStartGuardFocus)
  endGuard.addEventListener('focus', onEndGuardFocus)

  syncListToggle()
  syncAppearanceToggle()

  return {
    open,
    close,
    isOpen: () => !disposed && openState,
    getAppearance: () => plainAppearance ? 'plain' : 'material',
    setAppearance: (value) => { plainAppearance = value === 'plain'; syncAppearanceToggle() },
    dispose,
  }
}

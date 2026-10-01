// 资料面板与它里面那份阅读页之间的两句话（同源 postMessage）。为什么需要它：
// 流程图装在 iframe 里，用户点进阅读页后焦点进了子文档，父文档收不到键盘事件——
// 面板上的 ESC 就"失灵"了。所以由阅读页在自己那侧接住 ESC，把"关掉资料面板"
// 转给宿主页；顶层标签页里打开阅读页时什么都不做（没有面板可关）。
// 另外：iframe 导航失败不会触发 error 事件，别指望用它报加载失败（见 MDN iframe 说明）；
// 宿主页在设置 src 之前先自己取一次入口，那里才是可靠的门。

/** 面板与阅读页约定的那一句话（只此一条，不带任何数据）。 */
export const MATERIAL_CLOSE_REQUEST = 'archify-material-close'

/**
 * 阅读页侧：嵌在资料面板里时，把"用户想关掉面板"的 ESC 转给宿主页。
 * 阅读页自己的弹层（节点详情／全部资料／保存版本）开着时不动手——那时 ESC 是关弹层的，
 * 交给它们自己的原生 dialog 行为；只有没有弹层时才算"想退出阅读"。
 * 用捕获阶段接：转发只是捎个话，不 preventDefault，但别被别的 document 级监听挡在前面。
 * 同一个窗口可以接多份文档（阅读页自己的、以及它里面那张图的那份）。
 * 返回解绑函数；顶层窗口（parent === window）直接返回空函数。
 */
export function forwardEscapeToHost(win, doc, { type = MATERIAL_CLOSE_REQUEST } = {}) {
  const host = win?.parent
  if (!host || host === win || !doc) return () => {}
  const onKeyDown = (event) => {
    if (event.key !== 'Escape') return
    if (doc.querySelector('dialog[open]')) return
    host.postMessage({ type }, win.location.origin)
  }
  doc.addEventListener('keydown', onKeyDown, true)
  return () => doc.removeEventListener('keydown', onKeyDown, true)
}

/**
 * 宿主页侧：收到面板里那份阅读页的关闭请求就关面板。
 * 只认同一来源（同源）与约定的那一句话：这条消息只会关掉一个只读面板，
 * 不带数据进来，也不触发任何读写。frame 在手上时再核一次事件来源，
 * 免得别处的同源窗口冒名（拿不到 contentWindow 时不因此拒收——宁可关得上）。
 */
export function listenMaterialClose(win, frame, onClose, { type = MATERIAL_CLOSE_REQUEST } = {}) {
  const onMessage = (event) => {
    if (!event?.data || event.data.type !== type) return
    if (event.origin !== win.location.origin) return
    const source = frame?.contentWindow
    if (event.source && source && event.source !== source) return
    onClose()
  }
  win.addEventListener('message', onMessage)
  return () => win.removeEventListener('message', onMessage)
}

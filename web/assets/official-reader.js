// 新路径专用：不套旧layout，不重建图；绑定当前文档、load世代、引用及宿主主题。
import { adaptChartTemplate } from './chart-theme.js'
import { connectChartLayout } from './chart-layout.js'
import { sourceEntities, sourceSelection } from './chart-entities.js'
export function officialHtml(html, mode) {
  // 官方只给带远程href的a高亮；页内阅读由桥接把local-only的div变为按钮。
  // 从固定官方模板提取同一状态声明，不另设计颜色，也不改vendor原件。
  const states = [...html.matchAll(/a\.semantic-passport-source:hover,\s*a\.semantic-passport-source:focus-visible\s*\{([^}]+)\}/g)]
  if (states.length !== 1) throw Error('官方源码来源高亮模板锚点不匹配，请核对随包模板版本')
  const style = `<style id="specdev-official-source-state">
    #focus-evidence-links div.semantic-passport-source[role="button"] { cursor: pointer; }
    #focus-evidence-links div.semantic-passport-source[role="button"]:hover,
    #focus-evidence-links div.semantic-passport-source[role="button"]:focus-visible { ${states[0][1]} }
  </style>`
  // 宽度仍沿官方阅读布局；自然高度不能再反向按子视口高度缩图或增加留白。
  const natural = "html.getAttribute('data-specdev-natural-height') === 'true' && html.getAttribute('data-present') !== 'true'"
  const replacements = [
    ['var availableSvgHeight = Math.max(1, window.innerHeight - fixedHeight);', `var availableSvgHeight = (${natural}) ? Math.max(1, (maxWidth - chrome.diagramX - (docked ? railExtra : 0)) / Math.max(ratio, 0.001)) : Math.max(1, window.innerHeight - fixedHeight);`],
    ['        settleOverflow(minWidth);', `        if (!(${natural})) settleOverflow(minWidth);`],
    ['var floor = window.innerHeight - number(window.getComputedStyle(body).paddingBottom) - top;', `var floor = (${natural}) ? 0 : window.innerHeight - number(window.getComputedStyle(body).paddingBottom) - top;`],
    ['          container && svg && nav &&', `          container && svg && nav &&\n          (!(${natural})) &&`],
  ]
  let result = adaptChartTemplate(html, mode)
  for (const [anchor, replacement] of replacements) {
    if (result.split(anchor).length !== 2) throw Error('官方自然高度模板锚点不匹配，请核对随包模板版本')
    result = result.replace(anchor, replacement)
  }
  const height = `<style id="specdev-official-height">
html[data-specdev-natural-height="true"]:not([data-present="true"]) { height:auto; min-height:0; overflow-y:hidden; }
html[data-specdev-natural-height="true"]:not([data-present="true"]) body { display:flow-root; height:auto; min-height:0; }
</style><script>document.documentElement.setAttribute('data-specdev-natural-height','true');</script>`
  return result.replace('</head>', style + height + '</head>')
}
export function connectOfficialFrame(frame, expectedURL, data, { onSelection, onEvidence, onEscape, onFailure, controller, win = window }) {
  let alive = true, bound = null, token = '', unsubscribe = () => {}
  const stopLayout = connectChartLayout(frame, expectedURL, { official: true, onFailure }, win)
  const refs = new Map(data.references.map(ref => [ref.id, ref]))
  const entities = new Map(sourceEntities(data.version).map(node => [node.id, sourceSelection(data.version, node.id)]))
  const valid = () => {
    try { return alive && frame.isConnected && frame.src === expectedURL && frame.contentDocument === bound && bound?.location.href.split('#')[0] === expectedURL }
    catch { return false }
  }
  function bind() {
    unsubscribe(); unsubscribe = () => {}; bound = null; token = ''
    if (!alive || !frame.isConnected || frame.src !== expectedURL) return
    try {
      const doc = frame.contentDocument
      if (!doc || doc.location.href.split('#')[0] !== expectedURL) return
      bound = doc; token = win.crypto.randomUUID()
      doc.defaultView.SpecDevOfficialBridge?.dispose()
      doc.getElementById('specdev-official-config')?.remove()
      const config = doc.createElement('script'); config.type = 'application/json'; config.id = 'specdev-official-config'
      const refsWithNames = data.references.map(ref => {
        const source = sourceEntities(data.version).find(node => node.id === ref.entityId)?.sources?.[ref.sourceIndex]
        return { ...ref, authoredLabel: source?.label || ref.path.split('/').pop() || ref.path }
      })
      config.textContent = JSON.stringify({ contextId: data.contextId, token, refs: refsWithNames, entities: [...entities.keys()] })
      const script = doc.createElement('script'); script.src = new URL('/specdev-workbench/assets/official-bridge.js', win.location.href).href
      doc.head.append(config, script)
      unsubscribe = controller?.subscribe(state => {
        if (valid()) doc.dispatchEvent(new doc.defaultView.CustomEvent('specdev-chart-theme', { detail: { mode: state.mode } }))
      }) || (() => {})
    } catch (error) { onFailure?.(`新版图连接失败：${error.message}`) }
  }
  const message = event => {
    const value = event.data
    if (!valid() || event.origin !== win.location.origin || event.source !== frame.contentWindow || !value || value.type !== 'specdev-official' || value.token !== token || value.contextId !== data.contextId) return
    if (value.action === 'selection' && (value.entityId === null || entities.has(value.entityId))) onSelection(value.entityId ? entities.get(value.entityId) : null)
    else if (value.action === 'evidence' && refs.has(value.refId)) onEvidence(refs.get(value.refId), frame)
    else if (value.action === 'escape') onEscape()
  }
  const observer = new win.MutationObserver(() => { if (!frame.isConnected || frame.src !== expectedURL) dispose() })
  function dispose() {
    if (!alive) return
    alive = false; stopLayout(); unsubscribe(); bound?.defaultView.SpecDevOfficialBridge?.dispose(); bound = null
    observer.disconnect(); frame.removeEventListener('load', bind); win.removeEventListener('message', message)
  }
  observer.observe(frame.ownerDocument, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] })
  frame.addEventListener('load', bind); win.addEventListener('message', message); bind()
  return dispose
}
export function rendererURL(href, renderer) {
  if (renderer !== null && !['legacy', '3.0.1'].includes(renderer)) throw Error('阅读版本参数无效')
  const url = new URL(href)
  if (renderer === '3.0.1' || renderer === 'legacy') url.searchParams.set('renderer', renderer)
  else url.searchParams.delete('renderer')
  return url.href
}

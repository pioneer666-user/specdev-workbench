// 只适配当前随包模板：保持文档、原生工具、图几何和脚本隔离。
export function adaptChartLayout(template) {
  const anchor = "          shell && diagram && svg && ratio >= WIDE_RATIO &&"
  const chrome = '          container && svg && nav &&'
  const required = ['</head>', '    Archify.readerLayout = (function () {', anchor,
    chrome, '<div class="container">', '<div class="header">', '<div class="toolbar"', 'class="diagram-container"']
  for (const text of required) {
    if (template.split(text).length !== 2) throw Error('流程图布局模板锚点不匹配，请核对随包模板版本：' + text)
  }
  // 普通阅读宽度只由父页可用宽度决定；停用按子视口高度反推宽度的反馈链。
  const result = template.replace(anchor, anchor + "\n          html.getAttribute('data-specdev-read') !== 'true' &&")
    // 普通阅读将导航自然占位，不能让每次iframe高度resize清零再添底部留白。
    .replace(chrome, chrome + "\n          (html.getAttribute('data-specdev-read') !== 'true' || html.getAttribute('data-present') === 'true') &&")
  return result.replace('</head>', `<style id="specdev-chart-layout">
html[data-specdev-read="true"]:not([data-present="true"]) { height:auto; min-height:0; overflow-y:hidden; }
html[data-specdev-read="true"]:not([data-present="true"]) body { display:flow-root; height:auto; min-height:0; padding:0; background-image:none; }
html[data-specdev-read="true"]:not([data-present="true"]) body > .toolbar { position:relative; inset:auto; flex-wrap:wrap; margin:0 0 12px; max-width:100%; }
html[data-specdev-read="true"]:not([data-present="true"]) .container { width:100%; max-width:none; height:auto; }
html[data-specdev-read="true"]:not([data-present="true"]) .header { padding-right:0; margin-bottom:12px; }
html[data-specdev-read="true"]:not([data-present="true"]) .header-row { flex-wrap:wrap; }
html[data-specdev-read="true"]:not([data-present="true"]) h1 { font-size:20px; overflow-wrap:anywhere; }
html[data-specdev-read="true"]:not([data-present="true"]) .subtitle { white-space:pre-wrap; overflow-wrap:anywhere; }
html[data-specdev-read="true"]:not([data-present="true"]) .diagram-container { border:0; border-radius:0; padding:12px; }
html[data-specdev-read="true"]:not([data-present="true"]) .diagram-container > svg { height:auto; }
html[data-specdev-read="true"]:not([data-present="true"]) .diagram-container .diagram-nav { position:relative; inset:auto; display:flex; width:max-content; max-width:100%; margin:12px 0 0 auto; }
html[data-specdev-read="true"]:not([data-present="true"]) .header-row[data-specdev-duplicate],
html[data-specdev-read="true"]:not([data-present="true"]) .subtitle[data-specdev-duplicate] { display:none; }
</style><script>document.documentElement.setAttribute('data-specdev-read','true');</script></head>`)
}

// 不测 document.scrollHeight（至少等于旧视口）；测自然流 body，允许收缩。
export function connectChartLayout(frame, expectedURL, { title, summary, official = false, onFailure = () => {} } = {}, win = window) {
  let alive = true, doc = null, cleanup = () => {}, raf = 0, failed = false
  const valid = () => alive && frame.isConnected && frame.src === expectedURL && frame.contentDocument === doc
    && (official ? doc?.defaultView.location.href.split('#')[0] === expectedURL : doc?.defaultView.location.href === expectedURL)
  function fallback(reason) {
    if (!alive || !frame.isConnected || frame.src !== expectedURL) return
    cleanup(); cleanup = () => {}
    frame.style.removeProperty('height'); frame.removeAttribute('data-layout')
    frame.dataset.layout = 'fallback'
    // 去除只在成功测量时使用的纵向隐藏，保留原图滚动回退。
    try { doc?.documentElement.removeAttribute('data-specdev-read') } catch { /* 不操作不可访问的文档。 */ }
    if (official) doc?.documentElement.removeAttribute('data-specdev-natural-height')
    if (!failed) { failed = true; onFailure('图尺寸自动适配失败：' + reason + '。已保留图内滚动阅读。') }
  }
  function measure() {
    raf = 0
    try {
      if (failed || !valid()) return
      const presenting = doc.documentElement.getAttribute('data-present') === 'true' || !!doc.fullscreenElement
      const height = presenting ? frame.ownerDocument.documentElement.clientHeight : doc.body.getBoundingClientRect().height
      if (!Number.isFinite(height) || height < 0) throw Error('文档高度无效')
      if (height === 0) return // 隐藏阅读视口等待恢复，不编造高度。
      const next = Math.ceil(height)
      if (frame.style.height !== next + 'px') frame.style.height = next + 'px'
      frame.dataset.layout = presenting ? 'presentation' : 'natural'
    } catch (error) { fallback(error.message) }
  }
  function schedule() { if (alive && !failed && !raf) raf = win.requestAnimationFrame(measure) }
  function bind() {
    if (raf) win.cancelAnimationFrame(raf); raf = 0; failed = false
    cleanup(); cleanup = () => {}; doc = null
    if (!alive || !frame.isConnected || frame.src !== expectedURL) return
    try {
      doc = frame.contentDocument
      if (!doc || (official ? doc.defaultView.location.href.split('#')[0] : doc.defaultView.location.href) !== expectedURL) return // 初始 about:blank 等待真正 load。
      const body = doc.body, shell = doc.querySelector('.container'), toolbar = official ? doc.querySelector('.toolbar') : body?.querySelector(':scope > .toolbar')
      if (!body || !shell || !toolbar || !doc.querySelector(official ? '#specdev-official-height' : '#specdev-chart-layout')) throw Error('图文档布局结构不匹配')
      const row = shell.querySelector('.header-row'), heading = row?.querySelector('h1'), subtitle = shell.querySelector('.header .subtitle')
      if (!official && heading?.textContent === title) row.setAttribute('data-specdev-duplicate', '')
      if (!official && subtitle?.textContent === summary) subtitle.setAttribute('data-specdev-duplicate', '')
      const current = doc
      const changed = () => { if (doc === current && valid()) schedule() }
      let ro, mo
      cleanup = () => {
        ro?.disconnect(); mo?.disconnect(); current.removeEventListener('fullscreenchange', changed)
        current.fonts?.removeEventListener('loadingdone', changed); win.removeEventListener('resize', changed)
      }
      ro = new win.ResizeObserver(changed); mo = new win.MutationObserver(changed)
      ro.observe(body); ro.observe(shell); ro.observe(toolbar); ro.observe(frame)
      mo.observe(body, { subtree:true, childList:true, characterData:true, attributes:true })
      mo.observe(doc.documentElement, { attributes:true, attributeFilter:['data-present', 'data-theme'] })
      doc.addEventListener('fullscreenchange', changed); win.addEventListener('resize', changed)
      doc.fonts?.addEventListener('loadingdone', changed)
      doc.fonts?.ready.then(changed).catch(() => {})
      doc.documentElement.setAttribute(official ? 'data-specdev-natural-height' : 'data-specdev-read', 'true')
      schedule()
    } catch (error) { fallback(error.message) }
  }
  function dispose() {
    if (!alive) return
    alive = false; cleanup(); observer.disconnect(); frame.removeEventListener('load', bind)
    if (raf) win.cancelAnimationFrame(raf); raf = 0
  }
  const observer = new win.MutationObserver(() => { if (!frame.isConnected || frame.src !== expectedURL) dispose() })
  observer.observe(frame.ownerDocument, { childList:true, subtree:true, attributes:true, attributeFilter:['src'] })
  frame.addEventListener('load', bind); bind()
  return dispose
}

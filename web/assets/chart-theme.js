// 仅适配随包模板；锚点变化时报错，不让旧主题逻辑悄悄恢复。
export function adaptChartTemplate(template, mode) {
  const early = /<script>\s*\/\/ Resolve the theme before first paint[\s\S]*?<\/script>/g
  const start = '    Archify.theme = (function () {'
  const end = '    })();'
  const offset = template.indexOf(start), stop = template.indexOf(end, offset)
  if ((template.match(early) || []).length !== 1 || offset < 0 || stop < 0 || template.indexOf(start, offset + 1) !== -1) {
    throw new Error('流程图主题模板锚点不匹配，请核对随包模板版本')
  }
  const original = template.slice(offset, stop + end.length)
  if (!original.includes("var STORAGE_KEY = 'archify-theme';") || !original.includes('media.addEventListener')
    || !original.includes('return { toggle: toggle };') || !original.includes('btn.addEventListener')) {
    throw new Error('流程图主题模板结构不匹配，请核对随包模板版本')
  }
  const controlled = `    Archify.theme = (function () {
      var html = document.documentElement;
      function apply(theme) {
        if (theme !== 'light' && theme !== 'dark') return;
        html.setAttribute('data-theme', theme);
      }
      document.addEventListener('specdev-chart-theme', function(e) { apply(e.detail && e.detail.mode); });
      apply(html.getAttribute('data-theme'));
      return {};
    })();`
  const resolved = mode === 'light' ? 'light' : 'dark'
  let result = template.slice(0, offset).concat(controlled, template.slice(stop + end.length))
    .replace(early, `<script>document.documentElement.setAttribute('data-theme','${resolved}');</script>`)
  // 同时移除真实按钮、帮助提示与两个快捷键入口，保留导出/样式/展示的原接线。
  const removals = [
    /<button id="btn-theme"[\s\S]*?<\/button>/g,
    /<span><kbd>T<\/kbd>[^<]*<\/span>/g,
    /[ \t]*if \(action === 'theme'\) return Archify\.theme\.toggle\(\);\r?\n/g,
    /[ \t]*t: 'theme',\r?\n/g,
    /\} else if \(e\.key === 't' \|\| e\.key === 'T'\) \{\s*e\.preventDefault\(\);\s*Archify\.theme\.toggle\(\);\s*/g,
  ]
  for (const pattern of removals) {
    if ((result.match(pattern) || []).length !== 1) throw new Error('流程图主题入口模板结构不匹配，请核对随包模板版本')
    result = result.replace(pattern, '')
  }
  return result.replace('Keyboard: T toggles theme, S cycles style,', 'Keyboard: S cycles style,')
    .replace(/^[ \t]*T -> toggle theme\r?\n/m, '')
    .replace(':not(#btn-theme)', '')
    .replace(/\[data-theme="(?:light|dark)"\] #theme-icon\s*\{[^}]*\}/g, '')
    .replace('#theme-label, ', '')
}

export function connectChartTheme(frame, expectedURL, controller, win = window) {
  let alive = true, stop = () => {}, bound
  const valid = () => alive && frame.isConnected && frame.src === expectedURL && frame.contentDocument === bound
  function bind() {
    stop(); stop = () => {}; bound = null
    if (!alive || !frame.isConnected || frame.src !== expectedURL) return
    try {
      bound = frame.contentDocument
      if (!bound || bound.defaultView.location.href !== expectedURL) return
      const doc = bound
      const unsubscribe = controller?.subscribe(state => {
        if (valid()) doc.dispatchEvent(new doc.defaultView.CustomEvent('specdev-chart-theme', { detail: { mode: state.mode } }))
      })
      stop = () => { unsubscribe?.() }
    } catch { /* 失效或跨源文档不接管。 */ }
  }
  function dispose() {
    if (!alive) return
    alive = false; stop(); observer.disconnect(); frame.removeEventListener('load', bind)
    win.removeEventListener('pagehide', dispose)
  }
  const observer = new win.MutationObserver(() => { if (!frame.isConnected || frame.src !== expectedURL) dispose() })
  observer.observe(frame.ownerDocument, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] })
  frame.addEventListener('load', bind)
  win.addEventListener('pagehide', dispose)
  bind() // 缓存恢复直接重绑当前文档，不合成共用load事件。
  return dispose
}

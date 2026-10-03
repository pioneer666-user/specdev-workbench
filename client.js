// Web 保留新标签入口；桌面用宿主中央面板承载同一项目选择页。
window.__ModuleLoader__.load({
  id: '@pioneer_zmc/dsh-workbench/client',
  factory(require) {
    const React = require('react')
    const desktop = window.location?.protocol === 'dsh-app:' && window.location?.hostname === 'app'
    const entryStyle = { display: 'block', padding: '8px', width: '100%', color: 'inherit', textDecoration: 'none' }
    return {
      inject: desktop ? ['slots', 'layout'] : ['slots'],
      apply(ctx) {
        let panelRegistered = false
        const panelStops = new Set()
        const panelAvailable = () => panelRegistered && typeof ctx.layout?.selectPanel === 'function'
        const unavailable = (error) => `工作台入口无法使用：${error?.message || '宿主面板方法不可用'}。`

        function ManageEntry() {
          const [error, setError] = React.useState('')
          if (!desktop) return React.createElement('a', {
            href: '/specdev-workbench/workspaces', target: '_blank', rel: 'noopener',
            title: 'SpecDev 工作台', 'aria-label': 'SpecDev 工作台', style: entryStyle,
          }, 'SpecDev 工作台 ↗')
          return React.createElement(React.Fragment, null,
            React.createElement('button', {
              type: 'button', title: 'SpecDev 工作台', 'aria-label': 'SpecDev 工作台',
              style: { ...entryStyle, background: 'none', border: 0, textAlign: 'left', cursor: 'pointer' },
              onClick() {
                try {
                  if (!panelAvailable()) throw new Error('宿主面板方法不可用')
                  ctx.layout.selectPanel('specdev-workbench')
                  setError('')
                } catch (cause) { setError(unavailable(cause)) }
              },
            }, 'SpecDev 工作台'),
            error && React.createElement('p', { role: 'alert' }, error))
        }

        function WorkbenchPanel() {
          const frameRef = React.useRef(null)
          const [error, setError] = React.useState('')
          React.useLayoutEffect(() => {
            const frame = frameRef.current
            let active = true
            let detachDocument = () => {}
            const sameAuthority = (url) => url.protocol === window.location.protocol
              && url.hostname === window.location.hostname && url.port === window.location.port
              && url.username === '' && url.password === ''
            const internalPath = (url) => url.pathname === '/specdev-workbench'
              || url.pathname.startsWith('/specdev-workbench/')
            const onLoad = () => {
              if (!active) return
              detachDocument()
              detachDocument = () => {}
              try {
                const doc = frame.contentDocument
                if (!doc) throw new Error('无法访问工作台页面')
                const current = new URL(doc.defaultView.location.href)
                if (!sameAuthority(current) || !internalPath(current)) throw new Error('工作台页面来源不符合要求')
                const onClick = (event) => {
                  if (!active || event.defaultPrevented || event.button !== 0
                    || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
                  try {
                    if (frame.contentDocument !== doc) return // 换文档到 load 之间的旧事件也无效。
                    const target = event.target?.nodeType === 3 ? event.target.parentElement : event.target
                    const link = target?.closest?.('a[href]')
                    if (!link || link.hasAttribute('download')) return
                    const url = new URL(link.href, doc.baseURI)
                    if (!sameAuthority(url) || !internalPath(url)) return
                    event.preventDefault()
                    frame.contentWindow.location.assign(url.href)
                  } catch (cause) { if (active) setError(unavailable(cause)) }
                }
                doc.addEventListener('click', onClick)
                detachDocument = () => { doc.removeEventListener('click', onClick) }
                setError('')
              } catch (cause) { if (active) setError(unavailable(cause)) }
            }
            frame.addEventListener('load', onLoad)
            const stop = () => {
              if (!active) return
              active = false
              frame.removeEventListener('load', onLoad)
              detachDocument()
              panelStops.delete(stop)
            }
            panelStops.add(stop)
            return stop
          }, [])
          return React.createElement('section', {
            'aria-label': 'SpecDev 工作台',
            style: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden' },
          },
          React.createElement('div', { style: { flexShrink: 0, padding: '8px', paddingInlineStart: 'max(8px, var(--dsh-frame-leading-clearance, 0px))' } },
            React.createElement('button', {
              type: 'button', onClick() {
                try {
                  if (!panelAvailable()) throw new Error('宿主面板方法不可用')
                  ctx.layout.selectPanel(null)
                } catch (cause) { setError(unavailable(cause)) }
              },
            }, '返回聊天'),
            error && React.createElement('p', { role: 'alert' }, error)),
          React.createElement('iframe', {
            ref: frameRef, src: '/specdev-workbench/workspaces', title: 'SpecDev 项目选择与资料阅读',
            style: { flex: 1, minHeight: 0, width: '100%', border: 0 },
          }))
        }

        if (desktop) ctx.slots.inject('main', () => {
          const unregister = ctx.slots.register({ name: 'main', key: 'specdev-workbench' }, WorkbenchPanel)
          panelRegistered = true
          return () => {
            panelRegistered = false
            for (const stop of [...panelStops]) stop()
            unregister()
          }
        })
        ctx.slots.inject('sidebar.footer.action', () =>
          ctx.slots.register({ name: 'sidebar.footer.action', id: 'specdev-workbench', order: 100 }, ManageEntry))
      },
    }
  },
})

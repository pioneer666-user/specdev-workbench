// 业务页轻量文档面板：没有三维依赖，资料只来自当前业务登记清单。
import { wsUrl } from './common.js'
import { renderMarkdown } from './markdown.js'

export function createDocumentReader({ root, background, businessId, documents = [] }) {
  const panel = root.querySelector('[role="dialog"]'), title = root.querySelector('[data-doc-title]')
  const body = root.querySelector('[data-doc-body]'), status = root.querySelector('[data-doc-status]')
  const list = root.querySelector('[data-doc-list]'), closeButton = root.querySelector('[data-doc-close]'), retry = root.querySelector('[data-doc-retry]')
  const registered = [...new Set(documents)], actions = new Map()
  let alive = true, opened = false, seq = 0, current = '', trigger = null, pending = null, oldInert = false
  for (const path of registered) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = path
    const li = document.createElement('li'); li.append(button); list.append(li); actions.set(button, path)
  }
  const invalidate = () => { seq++; pending?.abort(); pending = null }
  const note = (text, failed = false) => { status.textContent = text; retry.hidden = !failed }
  async function select(path) {
    if (!alive || !opened || !registered.includes(path)) return
    if (body.contains(document.activeElement)) closeButton.focus()
    invalidate(); const request = seq, controller = new AbortController(); pending = controller
    current = path; title.textContent = path; body.replaceChildren(); body.hidden = true
    for (const [button, value] of actions) { if (value === path) button.setAttribute('aria-current', 'true'); else button.removeAttribute('aria-current') }
    note('正在读取文档…')
    try {
      const response = await fetch(wsUrl(`/specdev-workbench/api/doc?business=${encodeURIComponent(businessId)}&path=${encodeURIComponent(path)}`), { signal: controller.signal })
      if (!response.ok) {
        let reason = `HTTP ${response.status}`
        try { const error = await response.json(); if (typeof error.error === 'string') reason = error.error } catch { /* 非JSON保留HTTP原因。 */ }
        throw Error(reason)
      }
      const text = await response.text()
      if (!alive || !opened || request !== seq) return
      renderMarkdown(body, text, { path, documents: registered, openDocument: select }); note('')
    } catch (error) {
      if (!alive || !opened || request !== seq) return
      note(`读不到这份文档：${error.message || String(error)}。可以重试。`, true)
    } finally { if (pending === controller) pending = null }
  }
  function open(path, returnFocus = document.activeElement) {
    if (!alive || !registered.includes(path)) return
    if (!opened) { trigger = returnFocus; oldInert = background.inert; background.inert = true; opened = true; root.hidden = false; closeButton.focus() }
    void select(path)
  }
  function close() {
    if (!alive || !opened) return
    invalidate(); opened = false; root.hidden = true; background.inert = oldInert; body.replaceChildren(); note('')
    if (trigger?.isConnected) trigger.focus(); trigger = null
  }
  const focusables = () => [...panel.querySelectorAll('button:not([disabled]), a[href], [tabindex="0"]')].filter(n => !n.closest('[hidden]'))
  function keydown(event) {
    if (!opened || !alive) return
    if (event.key === 'Escape') { event.preventDefault(); close(); return }
    if (event.key !== 'Tab') return
    const nodes = focusables(), first = nodes[0], last = nodes.at(-1)
    if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) { event.preventDefault(); first?.focus() }
  }
  const choose = event => { const button = event.target.closest('button'); if (actions.has(button)) void select(actions.get(button)) }
  const again = () => { if (current) void select(current) }
  const leave = event => { if (!event.persisted) dispose() }
  function dispose() {
    if (!alive) return
    close(); alive = false; invalidate(); actions.clear()
    closeButton.removeEventListener('click', close); retry.removeEventListener('click', again); list.removeEventListener('click', choose); root.removeEventListener('keydown', keydown); window.removeEventListener('pagehide', leave)
  }
  closeButton.addEventListener('click', close); retry.addEventListener('click', again); list.addEventListener('click', choose); root.addEventListener('keydown', keydown); window.addEventListener('pagehide', leave)
  return { open, close, dispose }
}

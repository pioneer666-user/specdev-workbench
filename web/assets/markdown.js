// 成熟解析器只负责令牌；正文仅用受控 DOM 输出，绝不把原文交给 innerHTML。
import { Lexer } from './vendor/marked/marked.esm.js'
let documentSerial = 0

function decoded(value) {
  let text = String(value)
  // 编码只作为安全判定；不把多次解码结果交给外部导航。
  for (let i = 0; i < 5; i++) {
    const next = text.replace(/&#(x[0-9a-f]+|\d+);?/gi, (_, n) => {
      const code = n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : Number(n)
      return code <= 0x10ffff ? String.fromCodePoint(code) : '\ufffd'
    }).replace(/&(colon|tab|newline);/gi, (_, n) => ({ colon: ':', tab: '\t', newline: '\n' })[n.toLowerCase()])
    let unescaped = next
    try { unescaped = decodeURIComponent(next) } catch { /* 坏编码不导航。 */ }
    if (unescaped === text) break
    text = unescaped
  }
  return text
}

/** 相对路径只与当前业务登记路径精确配对；拒绝根路径、URL、查询、反斜线和越界。 */
export function resolveDocumentLink(href, currentPath, documents = []) {
  const text = decoded(href)
  if (!text || /[\u0000-\u0020\u007f\\:?]/.test(text.replace(/ /g, '')) || text.startsWith('/')) return null
  const [relative, fragment = ''] = text.split('#')
  if (!relative || !currentPath) return null
  const parts = currentPath.split('/').slice(0, -1)
  for (const part of relative.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') { if (!parts.length) return null; parts.pop() } else parts.push(part)
  }
  const path = parts.join('/')
  return documents.includes(path) ? { path, fragment } : null
}

export function renderMarkdown(host, text, { path = '', documents = [], openDocument = null } = {}) {
  host.replaceChildren()
  host.classList.add('markdown-body')
  const doc = host.ownerDocument, prefix = `md-${++documentSerial}-`, headings = new Map(), used = new Map()
  const node = (tag, parent, value) => {
    const n = doc.createElement(tag)
    if (value !== undefined) n.textContent = value
    parent.append(n)
    return n
  }
  const appendText = (parent, value) => parent.append(doc.createTextNode(value ?? ''))
  const inline = (tokens, parent) => {
    for (const token of tokens || []) {
      switch (token.type) {
        case 'strong': case 'em': case 'del': inline(token.tokens, node(token.type, parent)); break
        case 'codespan': node('code', parent, token.text); break
        case 'br': node('br', parent); break
        case 'image': node('span', parent, `${token.text || '图片'}（图片暂未加载）`).className = 'markdown-placeholder'; break
        case 'link': {
          const safe = decoded(token.href)
          const control = /[\u0000-\u0020\u007f\\]/.test(safe)
          if (!control && /^https?:\/\//i.test(safe) && /^https?:\/\//i.test(token.href)) {
            let url
            try { url = new URL(token.href) } catch { /* 无效URL只显示文字。 */ }
            if (url && !url.username && !url.password) {
              const a = node('a', parent); a.href = url.href; a.target = '_blank'; a.rel = 'noopener noreferrer'; inline(token.tokens, a); break
            }
          }
          if (!control && safe.startsWith('#')) {
            const button = node('button', parent); button.type = 'button'; button.className = 'markdown-link'; inline(token.tokens, button)
            button.addEventListener('click', () => headings.get(safe.slice(1))?.scrollIntoView?.({ block: 'start' })); break
          }
          const target = resolveDocumentLink(token.href, path, documents)
          if (target && openDocument) {
            const button = node('button', parent); button.type = 'button'; button.className = 'markdown-link'; inline(token.tokens, button)
            button.addEventListener('click', () => openDocument(target.path)); break
          }
          inline(token.tokens, parent); node('span', parent, '（此链接不可打开）').className = 'markdown-placeholder'; break
        }
        case 'html': appendText(parent, token.raw); break
        case 'escape': appendText(parent, token.text); break
        default: if (token.tokens) inline(token.tokens, parent); else appendText(parent, token.text ?? token.raw)
      }
    }
  }
  const blocks = (tokens, parent) => {
    for (const token of tokens || []) {
      switch (token.type) {
        case 'space': break
        case 'heading': {
          const h = node(`h${token.depth}`, parent); h.className = 'material-doc-heading'; h.dataset.level = String(token.depth); inline(token.tokens, h)
          const slug = h.textContent.trim().toLowerCase().replace(/[^\p{L}\p{N}_\-\s]/gu, '').replace(/\s+/g, '-')
          const count = used.get(slug) || 0; used.set(slug, count + 1)
          const key = count ? `${slug}-${count}` : slug
          h.id = prefix + key; headings.set(key, h); break
        }
        case 'paragraph': inline(token.tokens, Object.assign(node('p', parent), { className: 'material-doc-paragraph' })); break
        case 'text': if (token.tokens) inline(token.tokens, parent); else appendText(parent, token.text); break
        case 'code': node('code', node('pre', parent), token.text); break
        case 'html': node('p', parent, token.raw); break
        case 'hr': node('hr', parent); break
        case 'blockquote': blocks(token.tokens, node('blockquote', parent)); break
        case 'list': {
          const list = node(token.ordered ? 'ol' : 'ul', parent); list.className = 'material-doc-list'
          if (token.ordered && Number.isSafeInteger(token.start)) list.start = token.start
          for (const item of token.items) {
            const li = node('li', list)
            if (item.task) { const check = node('input', li); check.type = 'checkbox'; check.checked = Boolean(item.checked); check.disabled = true; check.setAttribute('aria-label', item.checked ? '已完成' : '未完成') }
            blocks(item.tokens, li)
          }
          break
        }
        case 'table': {
          const wrap = node('div', parent); wrap.className = 'markdown-table'; wrap.tabIndex = 0; wrap.setAttribute('aria-label', '表格，可横向滚动')
          const table = node('table', wrap), row = node('tr', node('thead', table))
          token.header.forEach((cell, i) => { const th = node('th', row); th.scope = 'col'; if (token.align[i]) th.style.textAlign = token.align[i]; inline(cell.tokens, th) })
          const tbody = node('tbody', table)
          for (const cells of token.rows) { const tr = node('tr', tbody); cells.forEach((cell, i) => { const td = node('td', tr); if (token.align[i]) td.style.textAlign = token.align[i]; inline(cell.tokens, td) }) }
          break
        }
        default: appendText(parent, token.raw)
      }
    }
  }
  if (!String(text ?? '').trim()) node('p', host, '这份文档没有正文（文件是空的）。').className = 'material-doc-empty'
  else blocks(Lexer.lex(String(text), { gfm: true }), host)
  host.hidden = false
}

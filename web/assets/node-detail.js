// 节点源码对照：只认文案中显式的“（证据 编号）”，不按相似名称推断关联。
import { findSection, splitInline } from './details.js'
import { describeSource, displayError, formatCodeBlock } from './evidence.js'
import { resolveSourceGroups } from './source-pairing.js'
import { sourceEntities } from './chart-entities.js'

const make = (tag, cls, text) => {
  const node = document.createElement(tag)
  if (cls) node.className = cls
  if (text !== undefined) node.textContent = text
  return node
}

// 围栏内的示例不作为证据声明，也不把示例中的标题拆成业务步骤。
export function detailGroups(body) {
  const groups = []
  let lines = [], title = '', fence = null
  const flush = () => {
    if (!title && !lines.join('').trim()) return
    const text = lines.join('\n').trim()
    let inFence = null
    const declarations = text.split('\n').filter(line => {
      const mark = /^\s*(`{3,}|~{3,})/.exec(line)?.[1]
      if (mark) {
        if (!inFence) inFence = mark
        else if (mark[0] === inFence[0] && mark.length >= inFence.length) inFence = null
        return false
      }
      return !inFence
    }).join('\n')
    const ids = [...declarations.matchAll(/[（(]证据\s+([^）)\n]+)[）)]/g)]
      .flatMap(match => match[1].split(/[、，,；;\s]+/)).filter(Boolean)
    groups.push({ title, body: text, ids: [...new Set(ids)] })
    lines = []
  }
  for (const line of String(body || '').split(/\r?\n/)) {
    const mark = /^\s*(`{3,}|~{3,})/.exec(line)?.[1]
    if (fence) {
      lines.push(line)
      if (mark && mark[0] === fence[0] && mark.length >= fence.length && !line.trim().slice(mark.length).trim()) fence = null
      continue
    }
    if (mark) { fence = mark; lines.push(line); continue }
    const heading = /^###\s+(.+?)\s*#*\s*$/.exec(line)
    if (heading) { flush(); title = heading[1]; continue }
    // 没有子标题的旧详情按段落对照；有标题则保留整个步骤为一组。
    if (!title && !line.trim()) { flush(); continue }
    lines.push(line)
  }
  flush()
  return groups
}

function inline(host, text) {
  for (const part of splitInline(text)) {
    host.append(part.code || part.strong ? make(part.code ? 'code' : 'strong', '', part.text) : document.createTextNode(part.text))
  }
}

function prose(host, text) {
  let fence = null, code = [], list = null
  const flushCode = () => { host.append(make('pre', 'detail-example', code.join('\n'))); code = [] }
  for (const line of text.split('\n')) {
    const mark = /^\s*(`{3,}|~{3,})/.exec(line)?.[1]
    if (fence) {
      if (mark && mark[0] === fence[0] && mark.length >= fence.length && !line.trim().slice(mark.length).trim()) { fence = null; flushCode() }
      else code.push(line)
      continue
    }
    if (mark) { fence = mark; list = null; continue }
    if (!line.trim()) { list = null; continue }
    const bullet = /^\s*(?:[-*+]|\d+\.)\s+(.*)$/.exec(line)
    const heading = /^#{3,6}\s+(.*)$/.exec(line)
    const node = make(bullet ? 'li' : heading ? 'h4' : 'p')
    inline(node, bullet?.[1] || heading?.[1] || line)
    if (bullet) {
      if (!list) { list = make('ul'); host.append(list) }
      list.append(node)
    } else { list = null; host.append(node) }
  }
  if (fence) flushCode()
}

export async function loadDetailEvidence(version, request) {
  if (version.evidenceError) return { refs: [], message: `证据文件读不开：${version.evidenceError}` }
  if (version.files.evidence === null) return { refs: [], message: '这个版本没有证据文件。' }
  try {
    const data = await request(version.files.evidence)
    return { refs: data.refs || [], message: data.parseError ? `证据文件有问题：${data.parseError}` : data.missing ? '这个版本没有证据文件。' : '' }
  } catch (error) { return { refs: [], message: `证据读取失败：${error.message}` } }
}

export function renderNodeDetail(host, version, details, selection, evidence) {
  host.replaceChildren()
  const found = findSection(details, selection.id, { unreadable: version.detailsError })
  host.append(make('h2', 'reader-title', selection.label), make('p', 'detail-source', `${selection.id} · ${version.kind === 'snapshot' ? version.label || version.tag : '当前工作区'}`))
  if (found.kind !== 'section') {
    const reason = found.kind === 'unreadable' ? `说明文档读不开：${found.reason}`
      : found.kind === 'malformed' ? '说明文档没有按“## 节点编号”分节，暂时无法定位此节点。'
      : found.kind === 'empty' ? '这个版本没有说明文档。' : '这个节点还没有说明。'
    host.append(make('p', 'detail-miss', reason))
    return
  }
  if (found.repeats > 1) host.append(make('p', 'details-warn', `此编号有 ${found.repeats} 节说明，当前显示第一份。`))
  if (found.block.note) host.append(make('p', 'muted', found.block.note))
  const labels = make('div', 'reader-columns')
  labels.append(make('span', '', '源码依据'), make('span', '', '业务说明'))
  host.append(labels)
  const groups = detailGroups(found.block.body)
  if (!groups.length) host.append(make('p', 'detail-miss', '这一节还没有正文。'))
  for (const group of groups) {
    const row = make('section', 'reader-pair')
    const left = make('div', 'reader-code')
    const link = make('span', 'reader-link')
    link.setAttribute('aria-hidden', 'true')
    const right = make('div', 'reader-prose')
    if (group.title) right.append(make('h3', '', group.title))
    prose(right, group.body)
    if (!group.ids.length) {
      left.append(make('p', 'muted', '此段未关联源码证据'))
      row.classList.add('reader-unpaired')
    } else if (evidence.loading || evidence.message) {
      left.append(make('p', 'ev-warn', evidence.loading ? '正在读取源码证据…' : evidence.message))
    } else {
      for (const id of group.ids) {
        const refs = evidence.refs.filter(ref => ref.id === id)
        if (refs.length !== 1) {
          left.append(make('p', 'ev-bad', refs.length ? `证据编号重复：${id}，无法确定对应源码。` : `找不到引用：${id}`))
          continue
        }
        const ref = refs[0]
        const box = make('figure', 'reader-snippet')
        box.append(make('figcaption', '', ref.label || id))
        if (!ref.ok) box.append(make('p', 'ev-bad', displayError(ref.error)))
        else {
          const source = make('p', 'ev-src', describeSource(ref))
          source.title = `完整提交：${ref.commit}`
          const code = make('pre', 'ev-code', formatCodeBlock(ref.text, ref.fromLine))
          code.tabIndex = 0
          code.setAttribute('aria-label', `源码 ${ref.path}`)
          box.append(source, code)
        }
        left.append(box)
      }
    }
    row.append(left, link, right)
    host.append(row)
  }
  host.append(make('p', 'detail-source', '仅按文案中明确注明的证据编号配对；未关联资料可从“全部阅读资料”查看。源码取自引用写定的提交。'))
}

/** 新sources直接按稳定实体列出，不要求业务说明重复填写证据编号。 */
export function renderOfficialDetail(host, version, details, selection, refs, results = new Map()) {
  host.replaceChildren()
  const found = findSection(details, selection.id, { unreadable: version.detailsError })
  if (selection.kind === 'transition') {
    host.dataset.pairing = 'false'
    host.append(make('h3', '', '转移说明'), make('p', 'detail-source', selection.label), make('p', 'muted', '转移没有官方源码引用；以下仅为此转移的说明。'))
    if (found.kind === 'section') prose(host, found.block.body)
    else host.append(make('p', 'detail-miss', version.detailsError ? `说明文档读不开：${version.detailsError}` : '此转移尚无说明。'))
    return
  }
  const sourceId = selection.sourceEntityId ?? selection.id
  // 用当前所选workflow的原始label，不能把T17显示用的“引用 N”回退当作者声明。
  const node = sourceEntities(version).find(node => node.id === sourceId)
  const ownRefs = refs.filter(ref => ref.entityId === sourceId)
  const authoredRefs = ownRefs.map(ref => ({ ...ref, label: node?.sources?.[ref.sourceIndex]?.label }))
  const groups = found.kind === 'section' ? resolveSourceGroups(found.block.body, sourceId, authoredRefs) : []
  const paired = groups.some(group => group.labels.length || group.diagnostics.length)
  host.dataset.pairing = String(paired)
  if (paired) {
    const used = new Set()
    if (found.repeats > 1) host.append(make('p', 'details-warn', `此编号有 ${found.repeats} 节说明，当前显示第一份。`))
    if (found.block.note) host.append(make('p', 'muted', found.block.note))
    for (const group of groups) {
      const row = make('section', group.title || group.diagnostics.length ? 'official-pair' : 'official-background')
      row.tabIndex = -1
      if (group.title) row.append(make('h3', '', group.title))
      if (!group.title && !group.diagnostics.length) prose(row, group.body)
      else {
        const grid = make('div', 'official-pair-grid'), left = make('div', 'reader-code'), right = make('div', 'reader-prose')
        left.append(make('h4', 'pair-label', '源码依据')); right.append(make('h4', 'pair-label', '业务说明'))
        for (const diagnostic of group.diagnostics) left.append(make('p', 'ev-bad', `${diagnostic.message}${diagnostic.label ? ` 标签：${diagnostic.label}` : ''}`))
        for (const ref of group.refs) {
          used.add(ref.id)
          const box = make('figure', 'reader-snippet'); box.dataset.refId = ref.id; box.tabIndex = -1; left.append(box)
        }
        if (!group.labels.length && !group.diagnostics.length) left.append(make('p', 'muted', '此小节未关联源码'))
        prose(right, group.body); grid.append(left, right); row.append(grid)
      }
      host.append(row)
    }
    const unpaired = ownRefs.filter(ref => !used.has(ref.id))
    if (unpaired.length) {
      const section = make('section', 'official-unpaired-sources')
      section.append(make('h3', '', '未配对源码来源'), make('p', 'muted', '这些来源没有明确关联到说明小节，仅按来源阅读。'))
      for (const ref of unpaired) { const box = make('figure', 'reader-snippet'); box.dataset.refId = ref.id; box.tabIndex = -1; section.append(box) }
      host.append(section)
    }
    for (const ref of ownRefs) updateOfficialReference(host, ref, results.get(ref.id))
    return
  }
  const column = (label, cls) => {
    const section = make('section', 'official-column ' + cls)
    const heading = make('h3', '', label), body = make('div', 'official-column-body')
    body.tabIndex = 0; body.setAttribute('aria-label', label)
    section.append(heading, body); host.append(section)
    return body
  }
  const left = column('源码依据', 'official-evidence'), right = column('业务说明', 'official-description')
  if (found.kind !== 'section') {
    const reason = found.kind === 'unreadable' ? `说明文档读不开：${found.reason}`
      : found.kind === 'malformed' ? '说明文档没有按“## 节点编号”分节，暂时无法定位此节点。'
      : found.kind === 'empty' ? '这个版本没有说明文档。' : '这个节点还没有说明。'
    right.append(make('p', 'detail-miss', reason))
  } else {
    if (found.repeats > 1) right.append(make('p', 'details-warn', `此编号有 ${found.repeats} 节说明，当前显示第一份。`))
    if (found.block.note) right.append(make('p', 'muted', found.block.note))
    right.append(make('p', 'muted', '此节点尚未声明逐段源码关联，说明与来源分别阅读。'))
    const body = make('div', 'reader-prose'); prose(body, found.block.body); right.append(body)
    if (!found.block.body.trim()) right.append(make('p', 'detail-miss', '这一节还没有正文。'))
  }
  for (const ref of ownRefs) {
    const box = make('figure', 'reader-snippet'); box.dataset.refId = ref.id; box.tabIndex = -1
    left.append(box)
    updateOfficialReference(host, ref, results.get(ref.id))
  }
  if (!ownRefs.length) left.append(make('p', 'muted', '此节点没有官方源码引用'))
}

/** 仅替换一条源码块；右侧DOM与两栏滚动位置保持。 */
export function updateOfficialReference(host, ref, result) {
  const boxes = [...host.querySelectorAll('[data-ref-id]')].filter(x => x.dataset.refId === ref.id)
  if (!boxes.length) return
  const body = host.dataset.pairing === 'true' ? host : boxes[0].closest('.official-column-body'), scroll = body.scrollTop
  for (const box of boxes) {
    box.replaceChildren()
    const source = make('p', 'ev-src', `${ref.path} · ${ref.fromLine === null ? '未指定行范围' : `${ref.fromLine}–${ref.toLine}行`} · ${ref.commit.slice(0, 8)}`)
    source.title = `完整提交：${ref.commit}`
    box.append(make('figcaption', '', ref.label), source)
    if (!result) box.append(make('p', 'muted', '选择此引用后读取固定提交源码'))
    else if (result.loading) box.append(make('p', 'muted', '正在读取这条固定提交源码…'))
    else if (!result.ok) box.append(make('p', 'ev-bad', displayError(result.error)))
    else {
      const code = make('pre', 'ev-code', formatCodeBlock(result.text, result.fromLine))
      code.tabIndex = 0; code.setAttribute('aria-label', `源码 ${ref.path}`); box.append(code)
    }
    if (ref.href) { const remote = make('a', '', '远程查看'); remote.href = ref.href; remote.target = '_blank'; remote.rel = 'noopener noreferrer'; box.append(remote) }
    const read = make('button', '', result?.ok ? '定位这条源码' : '读取这条源码'); read.dataset.readRef = ref.id; read.disabled = !!result?.loading; box.append(read)
  }
  body.scrollTop = scroll
}

/** 已声明时定位第一整组，兼容未声明时定位来源；不牵动底层图或房间。 */
export function locateOfficialReference(host, id) {
  const box = [...host.querySelectorAll('[data-ref-id]')].find(x => x.dataset.refId === id)
  if (!box) return
  const target = box.closest('.official-pair') || box
  const body = host.dataset.pairing === 'true' ? host : box.closest('.official-column-body')
  body.scrollTop = Math.max(0, body.scrollTop + target.getBoundingClientRect().top - body.getBoundingClientRect().top - 10)
  target.focus({ preventScroll: true }); target.classList.add('ref-active')
  setTimeout(() => target.classList.remove('ref-active'), 1400)
}

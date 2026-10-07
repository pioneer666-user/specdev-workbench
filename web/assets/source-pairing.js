// 新版逐段关联的纯逻辑：浏览器与随包CLI共用，不包含读取授权或DOM。
export function sourceGroups(body) {
  const groups = []
  let group = { title: '', lines: [], labels: [], diagnostics: [] }, fence = null
  const flush = () => {
    if (group.title || group.lines.join('').trim() || group.diagnostics.length || group.labels.length) {
      groups.push({ title: group.title, body: group.lines.join('\n').trim(), labels: [...new Set(group.labels)], diagnostics: group.diagnostics })
    }
    group = { title: '', lines: [], labels: [], diagnostics: [] }
  }
  for (const [index, line] of String(body || '').split(/\r?\n/).entries()) {
    const mark = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1]
    if (fence) {
      group.lines.push(line)
      if (mark && mark[0] === fence[0] && mark.length >= fence.length && !line.trim().slice(mark.length).trim()) fence = null
      continue
    }
    if (mark) { fence = mark; group.lines.push(line); continue }
    const heading = /^ {0,3}###[ \t]+(.+?)[ \t]*#*[ \t]*$/.exec(line)
    if (heading) { flush(); group.title = heading[1]; continue }
    if (/[（(]\s*源码引用/.test(line) || /^\s*源码引用(?:\s|[）)])/.test(line)) {
      const match = /^（源码引用[ \t]+([^（）()\r\n]+)）$/.exec(line.trim())
      const label = match?.[1].trim()
      if (!label) group.diagnostics.push({ code: 'invalid-source-declaration', message: '源码关联须独立一行写“（源码引用 非空标签）”，标签不能含括号界符。', line: index + 1 })
      else if (!group.title) group.diagnostics.push({ code: 'source-declaration-outside-group', message: '源码关联须放在“### 业务小节”内，背景说明不能硬配来源。', label, line: index + 1 })
      else group.labels.push(label)
      continue
    }
    group.lines.push(line)
  }
  flush()
  return groups
}

export function resolveSourceGroups(body, nodeId, refs) {
  const own = refs.filter(ref => ref.entityId === nodeId)
  return sourceGroups(body).map((group, groupIndex) => {
    const diagnostics = [...group.diagnostics], selected = []
    for (const label of group.labels) {
      const matches = own.filter(ref => typeof ref.label === 'string' && ref.label === label)
      if (matches.length !== 1) diagnostics.push({ code: matches.length ? 'ambiguous-source-label' : 'missing-source-label', message: matches.length ? '同节点来源标签重复，无法确定源码。' : '本节点找不到精确来源标签。', label })
      else selected.push(matches[0])
    }
    return { ...group, refs: selected, diagnostics: diagnostics.map(item => ({ ...item, nodeId, sectionTitle: group.title, groupIndex })) }
  })
}

export function validateSourcePairing(sections, nodes) {
  const refs = nodes.flatMap(node => (Array.isArray(node?.sources) ? node.sources : []).map(source => ({ entityId: node.id, label: source?.label })))
  return sections.flatMap(section => resolveSourceGroups(section.body, section.id, refs).flatMap(group => group.diagnostics))
}

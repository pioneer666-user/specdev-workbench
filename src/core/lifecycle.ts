// 生命周期的稳定实体与说明身份规则，转移不拥有官方源码引用。
export function lifecycleProblems(candidate: any): { code: string; message: string; entityId?: string }[] {
  const problems: { code: string; message: string; entityId?: string }[] = []
  const states = new Set<string>()
  for (const [collection, values] of [['states', candidate?.states], ['transitions', candidate?.transitions]] as const) {
    if (!Array.isArray(values)) { problems.push({ code: 'invalid-lifecycle', message: `${collection} 必须为数组` }); continue }
    const ids = new Set<string>()
    for (const item of values) {
      if (typeof item?.id !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]*$/.test(item.id) || ids.has(item.id)) problems.push({ code: 'invalid-lifecycle-id', message: `${collection} 要求稳定、合法且唯一的显式ID`, entityId: item?.id })
      else { ids.add(item.id); if (collection === 'states') states.add(item.id) }
      if (collection === 'transitions' && Object.hasOwn(item ?? {}, 'sources')) problems.push({ code: 'transition-sources-unsupported', message: '官方生命周期转移不支持sources，不能挪给状态', entityId: item?.id })
    }
  }
  for (const item of Array.isArray(candidate?.transitions) ? candidate.transitions : []) if (!states.has(item?.from) || !states.has(item?.to)) problems.push({ code: 'unknown-transition-endpoint', message: '转移端点必须指向本图状态ID', entityId: item?.id })
  return problems
}

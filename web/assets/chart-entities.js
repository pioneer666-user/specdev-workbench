// 所选版本的显式图种/字段与详情身份；不按文件存在或显示名字猜对象。
export const isLifecycle = version => version?.diagramType === 'lifecycle'
export function selectedGraph(version) {
  try { return JSON.parse(version?.files?.[isLifecycle(version) ? 'lifecycle' : 'workflow'] || '{}') || {} } catch { return {} }
}
export function sourceEntities(version) {
  const graph = selectedGraph(version)
  const entities = isLifecycle(version) ? graph.states : graph.nodes
  return (Array.isArray(entities) ? entities : []).filter(entity => entity && typeof entity.id === 'string')
}
export function sourceSelection(version, id) {
  const node = sourceEntities(version).find(node => node.id === id)
  return { id: isLifecycle(version) ? `state:${id}` : id, sourceEntityId: id, kind: isLifecycle(version) ? 'state' : 'node', label: node?.label || id }
}
export function detailEntities(version) {
  const graph = selectedGraph(version)
  if (!isLifecycle(version)) return sourceEntities(version)
  const states = sourceEntities(version), byId = new Map(states.map(state => [state.id, state]))
  const transitions = (Array.isArray(graph.transitions) ? graph.transitions : []).filter(edge => edge && typeof edge.id === 'string')
  return [...states.map(state => ({ ...state, ...sourceSelection(version, state.id) })), ...transitions.map(edge => ({
    ...edge, id: `transition:${edge.id}`, sourceEntityId: null, kind: 'transition',
    label: `${byId.get(edge.from)?.label || edge.from} → ${byId.get(edge.to)?.label || edge.to} · ${edge.label || edge.id}`,
  }))]
}
export const isChartMaterial = entry => entry?.kind === 'workflow' || entry?.kind === 'chart'
export const chartMaterialLabel = entry => entry?.diagramType === 'lifecycle' ? '生命周期图' : '流程图'

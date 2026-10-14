// 只消费正式装配的一层承载关系；主动隐藏与父项联动分开，不改布局或模型树。
export function createFurnitureVisibility({ instances, canChange, onChange }) {
  const parents = new Map(instances.map(item => [item.instanceId, item.parentId ?? null]))
  const hidden = new Set()
  let disposed = false
  function getState(instanceId) {
    if (disposed || !parents.has(instanceId)) return null
    const parentInstanceId = parents.get(instanceId)
    const explicitHidden = hidden.has(instanceId), parentHidden = hidden.has(parentInstanceId)
    return { instanceId, parentInstanceId, explicitHidden, parentHidden,
      hidden: explicitHidden || parentHidden,
      label: parentHidden ? '随承载家具隐藏' : explicitHidden ? '已隐藏' : '显示中' }
  }
  function clear() { if (disposed || !hidden.size) return; hidden.clear(); onChange() }
  return {
    getState, hasHidden: () => !disposed && hidden.size > 0,
    canChange: () => !disposed && canChange(),
    setHidden(instanceId, value) {
      if (disposed || !canChange() || typeof value !== 'boolean') return false
      const state = getState(instanceId)
      if (!state || state.parentHidden) return false
      if (state.explicitHidden === value) return true
      if (value) hidden.add(instanceId); else hidden.delete(instanceId)
      onChange(); return true
    },
    showAll() { if (disposed || !canChange()) return false; clear(); return true },
    // 仅场景在模式切换已被接受后调用；不经页面暴露这个专用恢复入口。
    restoreForWalk: clear,
    dispose() { disposed = true; hidden.clear(); parents.clear() },
  }
}

// 条目与唯一选择身份不依赖 DOM、相机或资料读取；下一轮可替换面板表现。
export function createFurnitureSelection({ assembly, bindings, bindingsOK, catalog = { assets: [] }, missing = [], onChange = () => {} }) {
  const byBinding = new Map(bindings.map(binding => [binding.instanceId, binding]))
  const omitted = new Set(missing)
  const assets = new Map(catalog.assets.map(asset => [asset.assetId, asset]))
  const items = assembly.instances.map(instance => {
    const binding = bindingsOK ? byBinding.get(instance.instanceId) : null
    return {
      instanceId: instance.instanceId, assetId: instance.assetId,
      previewUrl: assets.get(instance.assetId)?.previewRef === `assets/${instance.assetId}/preview.webp` ? `/specdev-workbench/assets/furniture/assets/${instance.assetId}/preview.webp` : null,
      name: binding?.title ?? instance.name ?? instance.assetId,
      summary: binding?.summary ?? '', parentInstanceId: instance.parentId ?? null,
      binding, status: !bindingsOK ? '绑定异常' : omitted.has(instance.instanceId) ? '资料未随包导出'
        : !binding ? '未绑定 · 没有资料' : binding.entries.length ? `${binding.entries.length} 份资料` : '空资料集合',
    }
  })
  const byId = new Map(items.map(item => [item.instanceId, item]))
  let selected = null, disposed = false
  const select = id => {
    if (disposed || (id !== null && !byId.has(id))) return false
    if (selected !== id) { selected = id; onChange(byId.get(id) ?? null) }
    return true
  }
  return {
    items, getSelected: () => byId.get(selected) ?? null, select,
    // 再次点击由已有选择决定，与时间间隔无关。
    pick(id) { const again = selected === id; return select(id) && again ? byId.get(id) : null },
    dispose() { disposed = true; selected = null },
  }
}

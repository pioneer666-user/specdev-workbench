// 台面盘点与单件surface推荐；没有第二套几何，确认全部委托正式整屋check。
import { roomJsonSnapshot, jsonObject, finite, ROOM_JSON_LIMITS, type JsonObject } from './room-json-input.ts'
import type { RoomPlacementOutcome } from './room-placement.ts'
import type { RoomDiagnostic } from './room-resources.ts'
export const SURFACE_LIMITS = Object.freeze({ ...ROOM_JSON_LIMITS, instances: 64, surfaces: 256, children: 256, generated: 64, candidates: 48, checks: 48, results: 5, diagnostics: 8, milliseconds: 1500 })
export interface SurfacePlacement { kind: 'surface'; parentInstanceId: string; surfaceId: string; offsetX: number; offsetZ: number; yawDeg: number }
export interface SurfaceInventoryItem {
  parentInstanceId: string; assetId: string; name: string; surfaceId: string; surfaceName: string
  rect: { minX: number; maxX: number; minZ: number; maxZ: number }; width: number; depth: number; y: number
  allowedCategories: string[]; items: { instanceId: string; assetId: string; name: string; category: string; placement: SurfacePlacement }[]
}
type Diagnostic = RoomDiagnostic & { stage: string }
export interface SurfaceInventoryOutcome {
  schemaVersion: 1; scope: 'surface-inventory'; kind: 'checked' | 'failed'; ok: boolean
  status: 'inventoried' | 'invalid-input' | 'limit-exceeded' | 'failed'; nature: string; unchecked: string[]
  surfaces: SurfaceInventoryItem[]; diagnostics: Diagnostic[]; diagnosticsTruncated: boolean; limits: typeof SURFACE_LIMITS
}
export interface SurfaceSuggestionOutcome {
  schemaVersion: 1; scope: 'surface-suggestion'; kind: 'checked' | 'failed'; ok: boolean
  status: 'suggested' | 'invalid-input' | 'not-found' | 'unconfirmed' | 'failed'; instanceId: string | null; unchecked: string[]
  suggestions: { placement: SurfacePlacement; parentInstanceId: string; assetId: string; surfaceId: string; surfaceName: string; sameSurface: boolean; localDistance: number | null; yawChanged: boolean; confirmation: RoomPlacementOutcome }[]
  diagnostics: Diagnostic[]; diagnosticsTruncated: boolean
  search: { generated: number; candidates: number; checked: number; resourceChecks: number; confirmed: number; hardRejected: number; unconfirmed: number; matchedSurfaces: number; visitedSurfaces: number; truncated: boolean; termination: string; elapsedMs: number; coverage: string; limits: typeof SURFACE_LIMITS }
}
const unchecked = () => ['business-ownership', 'binding-validity', 'material-readability']
export function surfaceInventoryOutcome(): SurfaceInventoryOutcome {
  return { schemaVersion: 1, scope: 'surface-inventory', kind: 'failed', ok: false, status: 'failed', nature: '配置与能力盘点；当前未放物品不代表任意物品能放，不提供剩余件数。',
    unchecked: ['geometry', 'collision', 'reachability', ...unchecked()], surfaces: [], diagnostics: [], diagnosticsTruncated: false, limits: { ...SURFACE_LIMITS } }
}
export function surfaceSuggestionOutcome(): SurfaceSuggestionOutcome {
  return { schemaVersion: 1, scope: 'surface-suggestion', kind: 'failed', ok: false, status: 'failed', instanceId: null, unchecked: unchecked(), suggestions: [], diagnostics: [], diagnosticsTruncated: false,
    search: { generated: 0, candidates: 0, checked: 0, resourceChecks: 0, confirmed: 0, hardRejected: 0, unconfirmed: 0, matchedSurfaces: 0, visitedSurfaces: 0, truncated: false, termination: 'not-started', elapsedMs: 0,
      coverage: '有效原父面优先；各匹配面按房间实例/元数据顺序轮流取一个候选。先期望偏移或中心，再朝向、邻近点、边界点；已确认结果按原面、同面局部位移/朝向排序，跨面只用扫描次序，不比较世界距离。不保证全部空隙或全局最优/放不下。', limits: { ...SURFACE_LIMITS } } }
}
interface Context { check(layout: unknown): RoomPlacementOutcome; templates: JsonObject[]; catalog: { assets: unknown[] }; worldBox(local: any, position: any, yaw: number): any }
interface Control { now?: () => number; limits?: Partial<typeof SURFACE_LIMITS> }
class SurfaceError extends Error {
  readonly code: string; readonly fieldPath: string; readonly resource: boolean; readonly limit: boolean
  constructor(code: string, message: string, fieldPath = 'layout', resource = false, limit = false) {
    super(message); this.code = code; this.fieldPath = fieldPath; this.resource = resource; this.limit = limit
  }
}
function fail(code: string, message: string, at?: string): never { throw new SurfaceError(code, message, at) }
const string = (v: unknown) => typeof v === 'string' && Boolean(v.trim())
function inputLayout(input: unknown, limits: typeof SURFACE_LIMITS, tick: () => void): JsonObject {
  const layout = roomJsonSnapshot(input, tick, limits)
  if (layout.schemaVersion !== 1 || !string(layout.roomId) || !string(layout.templateRef) || !Array.isArray(layout.instances)) fail('SURFACE_INPUT', '需要schemaVersion=1、房间/模板身份和完整instances')
  if (layout.instances.length > limits.instances) throw new SurfaceError('SURFACE_LIMIT', '实例数超出盘点界；未返回部分结果', 'layout.instances', false, true)
  return layout
}
// 空实例探针仅验证同一正式模板/目录结构；不判调用方家具的几何。推荐也计入整次48次检查界。
function auditResources(layout: JsonObject, context: Context): void {
  if (!context.templates.some(t => t.templateId === layout.templateRef)) fail('TEMPLATE_UNKNOWN', '候选引用了未登记模板', 'layout.templateRef')
  const probe = context.check({ schemaVersion: 1, roomId: layout.roomId, templateRef: layout.templateRef, instances: [] })
  const diagnostics = probe.diagnostics.filter(d => /^(template|catalog)(?:\.|$)/.test(d.fieldPath ?? '') || d.stage === 'resources')
  if (probe.kind === 'failed' || diagnostics.length || probe.status === 'unconfirmed') {
    const error = new SurfaceError('SURFACE_RESOURCE', '运行包元数据校验失败或未完成', 'catalog', true)
    Object.assign(error, { diagnostics: diagnostics.length ? diagnostics : probe.diagnostics })
    throw error
  }
}
function inventory(layout: JsonObject, context: Context, limits: typeof SURFACE_LIMITS, tick: () => void): SurfaceInventoryItem[] {
  const assets = new Map<string, JsonObject>(context.catalog.assets.map((a: any) => [a.assetId, a]))
  const template = context.templates.find(t => t.templateId === layout.templateRef)!
  const byId = new Map<string, JsonObject>(), surfaces: SurfaceInventoryItem[] = []
  let outputNodes = 1, outputStrings = 0
  const reserve = (values: string[], nodes: number) => {
    outputNodes += nodes; outputStrings += 256 // 字段名等固定开销的保守上界
    if (outputNodes > limits.inputNodes) throw new SurfaceError('SURFACE_LIMIT', '盘点输出节点/数组总槽位超界；未返回部分结果', 'surfaces', false, true)
    for (const v of values) { tick(); outputStrings += v.length }
    if (outputStrings > limits.inputStringUnits) throw new SurfaceError('SURFACE_LIMIT', '盘点输出字符串总量超界；未返回部分结果', 'surfaces', false, true)
  }
  for (const [index, item] of layout.instances.entries()) {
    tick()
    const at = `layout.instances[${index}]`
    if (!jsonObject(item) || !string(item.instanceId) || !string(item.assetId) || !jsonObject(item.placement)) fail('SURFACE_INSTANCE', '实例需要唯一身份、资产和placement', at)
    if (byId.has(item.instanceId)) fail('SURFACE_ID_DUPLICATE', '实例ID重复，不能确定目标或父项', at)
    byId.set(item.instanceId, item)
    const asset = assets.get(item.assetId), p = item.placement
    if (!asset) fail('REF_UNKNOWN', '实例引用未知资产', at + '.assetId')
    const fields = p.kind === 'floor' ? ['kind', 'zoneId', 'x', 'z', 'yawDeg'] : ['kind', 'parentInstanceId', 'surfaceId', 'offsetX', 'offsetZ', 'yawDeg']
    if (!asset.placement.allowedKinds.includes(p.kind) || !asset.placement.allowedYawDeg.includes(p.yawDeg) || Object.keys(p).some(k => !fields.includes(k))) fail('SURFACE_PLACEMENT', '实例摆放类型/朝向或字段不合法', at + '.placement')
    if (p.kind === 'floor') {
      if (!finite(p.x) || !finite(p.z) || !string(p.zoneId) || !template.zones.some((z: any) => z.kind === 'floor' && z.zoneId === p.zoneId)) fail('SURFACE_PARENT', 'floor父项坐标或区域引用不合法', at + '.placement')
      for (const s of asset.surfaces) {
        tick()
        if (surfaces.length >= limits.surfaces) throw new SurfaceError('SURFACE_LIMIT', '承载面数超出盘点界；未返回部分结果', at, false, true)
        reserve([item.instanceId, asset.assetId, asset.name, s.surfaceId, s.name], 24 + s.allowedCategories.length)
        for (const category of s.allowedCategories) reserve([category], 0)
        surfaces.push({ parentInstanceId: item.instanceId, assetId: asset.assetId, name: asset.name, surfaceId: s.surfaceId, surfaceName: s.name, rect: { ...s.rect }, width: s.rect.maxX - s.rect.minX, depth: s.rect.maxZ - s.rect.minZ, y: s.y, allowedCategories: [...s.allowedCategories], items: [] })
      }
    } else if (p.kind !== 'surface' || !string(p.parentInstanceId) || !string(p.surfaceId) || !finite(p.offsetX) || !finite(p.offsetZ) || !finite(Math.hypot(p.offsetX, p.offsetZ))) fail('SURFACE_PLACEMENT', 'surface需要完整有限局部placement', at + '.placement')
  }
  let children = 0
  for (const item of layout.instances) {
    tick()
    const p = item.placement
    if (p.kind !== 'surface') continue
    const parent = byId.get(p.parentInstanceId)
    if (!parent || parent === item || parent.placement.kind !== 'floor') fail('SURFACE_PARENT', '未知父项、自依附或嵌套依附不能忽略', 'layout.instances')
    const s = surfaces.find(s => s.parentInstanceId === p.parentInstanceId && s.surfaceId === p.surfaceId)
    if (!s) fail('SURFACE_UNKNOWN', '初始面不属于该floor父项；不能猜测替代引用', 'layout.instances')
    if (++children > limits.children) throw new SurfaceError('SURFACE_LIMIT', '子项引用数超出盘点界；未返回部分结果', 'layout.instances', false, true)
    const asset = assets.get(item.assetId)!
    reserve([item.instanceId, item.assetId, asset.name, asset.category, p.parentInstanceId, p.surfaceId], 20)
    s.items.push({ instanceId: item.instanceId, assetId: item.assetId, name: asset.name, category: asset.category, placement: { ...p } })
  }
  return surfaces
}
function errorDiagnostics(error: unknown): Diagnostic[] {
  if (error instanceof SurfaceError) {
    const diagnostics = (error as SurfaceError & { diagnostics?: RoomDiagnostic[] }).diagnostics
    return diagnostics ? diagnostics.map(d => ({ ...d, stage: 'resources' })) : [{ stage: error.resource ? 'resources' : 'input', code: error.code, message: error.message, fieldPath: error.fieldPath }]
  }
  return [{ stage: 'input', code: 'SURFACE_INPUT', message: error instanceof Error ? error.message : String(error) }]
}
export function inspectRoomSurfaces(input: unknown, context: Context, control: Control = {}): SurfaceInventoryOutcome {
  const result = surfaceInventoryOutcome(), limits = testLimits(control)
  result.limits = limits
  try {
    const layout = inputLayout(input, limits, () => {})
    auditResources(layout, context)
    result.surfaces = inventory(layout, context, limits, () => {})
    result.kind = 'checked'; result.ok = true; result.status = 'inventoried'
  } catch (error) {
    result.kind = error instanceof SurfaceError && error.resource ? 'failed' : 'checked'
    result.status = result.kind === 'failed' ? 'failed' : error instanceof SurfaceError && error.limit ? 'limit-exceeded' : 'invalid-input'
    const diagnostics = errorDiagnostics(error)
    result.diagnostics = diagnostics.slice(0, limits.diagnostics); result.diagnosticsTruncated = diagnostics.length > limits.diagnostics
  }
  return structuredClone(result)
}
function testLimits(control: Control): typeof SURFACE_LIMITS {
  const limits = { ...SURFACE_LIMITS }
  for (const [k, v] of Object.entries(control.limits ?? {})) {
    if (!Object.hasOwn(limits, k) || !Number.isSafeInteger(v) || v! < 0 || v! > limits[k as keyof typeof limits]) throw TypeError('私有测试只能缩小界')
    Object.assign(limits, { [k]: v })
  }
  return limits
}
// 按面惰性产生少量局部参考点；worldBox来自同包公开几何，只生成参考点，不自判可行。
function* proposals(s: SurfaceInventoryItem, asset: JsonObject, desired: SurfacePlacement, worldBox: Context['worldBox']): Generator<SurfacePlacement> {
  const same = s.parentInstanceId === desired.parentInstanceId && s.surfaceId === desired.surfaceId
  const yaws = [...new Set<number>(asset.placement.allowedYawDeg)].sort((a, b) => Number(a !== desired.yawDeg) - Number(b !== desired.yawDeg) || a - b)
  const base = { kind: 'surface' as const, parentInstanceId: s.parentInstanceId, surfaceId: s.surfaceId }
  for (const yaw of yaws) yield { ...base, offsetX: same ? desired.offsetX : 0, offsetZ: same ? desired.offsetZ : 0, yawDeg: yaw }
  const centerX = (s.rect.minX + s.rect.maxX) / 2, centerZ = (s.rect.minZ + s.rect.maxZ) / 2
  for (const yaw of yaws) {
    const b = worldBox(asset.bounds, { x: 0, z: 0 }, yaw)
    const x0 = s.rect.minX - centerX - b.minX, x1 = s.rect.maxX - centerX - b.maxX, z0 = s.rect.minZ - centerZ - b.minZ, z1 = s.rect.maxZ - centerZ - b.maxZ
    if (![x0, x1, z0, z1].every(finite) || x0 > x1 || z0 > z1) continue
    // 同面先靠近原偏移，跨面先中心；仅在同一面内比较局部距离。
    const points = [[0, 0], [x0, 0], [x1, 0], [0, z0], [0, z1], [x0, z0], [x0, z1], [x1, z0], [x1, z1]]
    if (same) points.sort((a, b) => Math.hypot(a[0] - desired.offsetX, a[1] - desired.offsetZ) - Math.hypot(b[0] - desired.offsetX, b[1] - desired.offsetZ))
    for (const [offsetX, offsetZ] of points) yield { ...base, offsetX, offsetZ, yawDeg: yaw }
  }
}
export function suggestRoomSurface(input: unknown, options: unknown, context: Context, control: Control = {}): SurfaceSuggestionOutcome {
  const result = surfaceSuggestionOutcome(), limits = testLimits(control), now = control.now ?? (() => performance.now()), start = now()
  result.kind = 'checked'; result.status = 'invalid-input'; result.search.limits = limits
  const expired = () => now() - start >= limits.milliseconds
  const tick = () => { if (expired()) throw Error('surface-time-limit') }
  const finish = (termination: string, truncated = false) => {
    result.search.termination = termination; result.search.truncated = truncated; result.search.elapsedMs = Math.max(0, now() - start)
    result.ok = result.suggestions.length > 0
    if (result.ok) result.status = 'suggested'
    return structuredClone(result)
  }
  let layout: JsonObject, desired: SurfacePlacement, surfaces: SurfaceInventoryItem[], asset: JsonObject, target: JsonObject, opts: JsonObject
  try {
    opts = roomJsonSnapshot(options, tick, limits)
    if (!string(opts.instanceId) || Object.keys(opts).some(k => !['instanceId', 'parentInstanceId', 'surfaceId'].includes(k)) || ('parentInstanceId' in opts && !string(opts.parentInstanceId)) || ('surfaceId' in opts && (!string(opts.surfaceId) || !string(opts.parentInstanceId)))) fail('SURFACE_OPTIONS', '需要instanceId，surfaceId过滤必须同时指定parentInstanceId；不接受预算覆盖', 'options')
    result.instanceId = opts.instanceId
    layout = inputLayout(input, limits, tick)
    if (!limits.checks) { result.status = 'unconfirmed'; return finish('check-limit', true) }
    tick(); result.search.checked++; result.search.resourceChecks++
    auditResources(layout, context)
    tick(); surfaces = inventory(layout, context, limits, tick)
    const targets = layout.instances.filter((i: JsonObject) => i.instanceId === opts.instanceId)
    if (targets.length !== 1) fail('SURFACE_TARGET_MISSING', '目标必须在完整instances中恰好出现一次', 'layout.instances')
    target = targets[0]; desired = target.placement
    if (desired.kind !== 'surface') fail('SURFACE_TARGET_REQUIRED', '本入口只接受surface目标，不转换floor身份', 'layout.instances')
    asset = context.catalog.assets.find((a: any) => a.assetId === target.assetId) as JsonObject
    if (opts.parentInstanceId && !layout.instances.some((i: JsonObject) => i.instanceId === opts.parentInstanceId && i.placement.kind === 'floor')) fail('SURFACE_FILTER_PARENT', '限定父项必须是当前房间合法floor实例', 'options.parentInstanceId')
    if (opts.surfaceId && !surfaces.some(s => s.parentInstanceId === opts.parentInstanceId && s.surfaceId === opts.surfaceId)) fail('SURFACE_FILTER_UNKNOWN', '限定面不属于限定父项', 'options.surfaceId')
    const original = surfaces.find(s => s.parentInstanceId === desired.parentInstanceId && s.surfaceId === desired.surfaceId)!
    if (!original.allowedCategories.includes(asset.category)) result.diagnostics.push({ stage: 'placement', code: 'CATEGORY_NOT_ALLOWED', message: '初始面不接受目标asset.category；仅在指定范围内寻找匹配面', instanceIds: [target.instanceId, desired.parentInstanceId], targetId: desired.surfaceId })
    surfaces = surfaces.filter(s => (!opts.parentInstanceId || s.parentInstanceId === opts.parentInstanceId) && (!opts.surfaceId || s.surfaceId === opts.surfaceId) && s.allowedCategories.includes(asset.category))
    surfaces.sort((a, b) => Number(b === original) - Number(a === original))
    result.search.matchedSurfaces = surfaces.length
    if (!surfaces.length) { result.status = 'not-found'; return finish('no-matching-surfaces') }
  } catch (error) {
    if (error instanceof Error && error.message === 'surface-time-limit') { result.status = 'unconfirmed'; return finish('time-limit', true) }
    result.diagnostics = errorDiagnostics(error).slice(0, limits.diagnostics)
    result.diagnosticsTruncated = errorDiagnostics(error).length > limits.diagnostics
    if (error instanceof SurfaceError && error.resource) { result.kind = 'failed'; result.status = 'failed'; return finish('resource-failure') }
    return finish(error instanceof SurfaceError && error.limit ? 'inventory-limit' : 'input-rejected')
  }
  const streams = surfaces.map(s => proposals(s, asset, desired, context.worldBox)), done = new Set<number>(), seen = new Set<string>(), visited = new Set<number>(), diagKeys = new Set(result.diagnostics.map(d => JSON.stringify(d)))
  let termination = 'finite-candidates-exhausted', truncated = false
  search: while (done.size < streams.length) {
    for (const [index, stream] of streams.entries()) {
      if (done.has(index)) continue
      if (expired() || result.search.generated >= limits.generated || result.search.candidates >= limits.candidates || result.search.checked >= limits.checks || result.suggestions.length >= limits.results) {
        termination = expired() ? 'time-limit' : result.suggestions.length >= limits.results ? 'result-limit' : result.search.checked >= limits.checks ? 'check-limit' : 'candidate-limit'; truncated = true; break search
      }
      const next = stream.next()
      if (next.done) { done.add(index); continue }
      result.search.generated++
      const p = next.value, key = JSON.stringify(p)
      if (seen.has(key)) continue
      seen.add(key); result.search.candidates++
      if (expired()) { termination = 'time-limit'; truncated = true; break search }
      target.placement = { ...p }
      const placed = context.check(layout)
      result.search.checked++; visited.add(index); result.search.visitedSurfaces = visited.size
      if (placed.kind === 'failed' || placed.diagnostics.some(d => /^(template|catalog)(?:\.|$)/.test(d.fieldPath ?? '') && ['STRUCT_INVALID', 'VERSION_UNSUPPORTED', 'ID_DUPLICATE', 'SURFACE_DUPLICATE'].includes(d.code))) {
        result.kind = 'failed'; result.status = 'failed'; result.suggestions = []
        result.diagnostics = placed.diagnostics.slice(0, limits.diagnostics).map(d => ({ ...d, stage: 'resources' })); result.diagnosticsTruncated = placed.diagnostics.length > limits.diagnostics
        return finish('resource-failure')
      }
      const state = placed.ok && placed.status === 'confirmed' ? 'confirmed' : placed.status === 'unconfirmed' ? 'unconfirmed' : 'hardRejected'
      result.search[state]++
      for (const d of placed.diagnostics) {
        const key = JSON.stringify(d)
        if (diagKeys.has(key)) continue
        if (result.diagnostics.length >= limits.diagnostics) { result.diagnosticsTruncated = true; break }
        diagKeys.add(key); result.diagnostics.push(structuredClone(d))
      }
      if (state === 'confirmed') {
        const s = surfaces[index], sameSurface = s.parentInstanceId === desired.parentInstanceId && s.surfaceId === desired.surfaceId
        result.suggestions.push({ placement: { ...p }, parentInstanceId: s.parentInstanceId, assetId: s.assetId, surfaceId: s.surfaceId, surfaceName: s.surfaceName, sameSurface,
          localDistance: sameSurface ? Math.hypot(p.offsetX - desired.offsetX, p.offsetZ - desired.offsetZ) : null, yawChanged: p.yawDeg !== desired.yawDeg, confirmation: placed })
      }
    }
  }
  const surfaceOrder = (p: SurfacePlacement) => surfaces.findIndex(s => s.parentInstanceId === p.parentInstanceId && s.surfaceId === p.surfaceId)
  result.suggestions.sort((a, b) => Number(b.sameSurface) - Number(a.sameSurface) || surfaceOrder(a.placement) - surfaceOrder(b.placement) || (a.localDistance ?? 0) - (b.localDistance ?? 0) || Number(a.yawChanged) - Number(b.yawChanged) || a.placement.yawDeg - b.placement.yawDeg)
  result.status = result.search.unconfirmed ? 'unconfirmed' : 'not-found'
  if (expired()) { termination = 'time-limit'; truncated = true }
  return finish(termination, truncated)
}

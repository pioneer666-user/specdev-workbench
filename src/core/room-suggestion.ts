// 单件推荐的私有实现：元数据只产生有限候选，是否可行始终由整屋正式check决定。
import type { RoomPlacementOutcome } from './room-placement.ts'
import type { RoomDiagnostic } from './room-resources.ts'
import { types } from 'node:util'
type JsonObject = Record<string, any>
export interface FloorPlacement { kind: 'floor'; zoneId: string; x: number; z: number; yawDeg: number }
export const SUGGEST_LIMITS = Object.freeze({ generated: 64, candidates: 48, checks: 48, milliseconds: 1500, results: 5, diagnostics: 8, inputNodes: 30000, inputStringUnits: 1048576, depth: 24 })
export interface SuggestionOutcome {
  schemaVersion: 1; scope: 'placement-suggestion'; kind: 'checked' | 'failed'; ok: boolean
  status: 'suggested' | 'not-found' | 'invalid-input' | 'unconfirmed' | 'failed'
  instanceId: string | null
  unchecked: string[]
  suggestions: { placement: FloorPlacement; distance: number; yawChanged: boolean; confirmation: RoomPlacementOutcome }[]
  diagnostics: (RoomDiagnostic & { stage: string })[]
  diagnosticsTruncated: boolean
  search: { generated: number; candidates: number; checked: number; confirmed: number; hardRejected: number; unconfirmed: number; truncated: boolean; termination: string; elapsedMs: number; coverage: string; limits: typeof SUGGEST_LIMITS }
}
export function suggestionOutcome(): SuggestionOutcome {
  return { schemaVersion: 1, scope: 'placement-suggestion', kind: 'failed', ok: false, status: 'failed', instanceId: null,
    unchecked: ['business-ownership', 'binding-validity', 'material-readability'], suggestions: [], diagnostics: [], diagnosticsTruncated: false,
    search: { generated: 0, candidates: 0, checked: 0, confirmed: 0, hardRejected: 0, unconfirmed: 0, truncated: false, termination: 'not-started', elapsedMs: 0,
      coverage: '期望位置、允许直角朝向、附近有限偏移及区域内少量分散/边界点；只排序已检查候选，不保证找全或全局最近。', limits: { ...SUGGEST_LIMITS } } }
}
interface Context {
  templates: JsonObject[]; catalog: { assets: unknown[] }; check(layout: unknown): RoomPlacementOutcome
  worldBox(local: any, position: { x: number; z: number }, yaw: number): any
}
// 仅源码测试可缩小界/提供受控时钟；该函数不从公开dist模块导出，checker不传调用方选项。
interface TestControl { now?: () => number; limits?: Partial<typeof SUGGEST_LIMITS> }
const object = (v: unknown): v is JsonObject => Boolean(v) && typeof v === 'object' && !Array.isArray(v)
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
/** 先有界检查JSON数据再复制；不执行getter/toJSON，不给巨型/循环输入制造无界副本。 */
function snapshot(input: unknown, limits: typeof SUGGEST_LIMITS, tick: () => void): JsonObject {
  const stack: [unknown, number, boolean][] = [[input, 0, false]], ancestors = new Set<object>()
  let nodes = 0, strings = 0, arraySlots = 0
  while (stack.length) {
    tick()
    const [value, depth, exit] = stack.pop()!
    if (exit) { ancestors.delete(value as object); continue }
    if (++nodes > limits.inputNodes || depth > limits.depth) throw Error('候选JSON节点数或深度超出推荐输入界')
    if (typeof value === 'string') strings += value.length
    if (strings > limits.inputStringUnits) throw Error('候选JSON字符串总量超出推荐输入界')
    if (value === null || typeof value === 'string' || typeof value === 'boolean' || finite(value)) continue
    if (typeof value !== 'object' || !value || types.isProxy(value) || (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value)))) throw Error('推荐只接受普通JSON数据，不接受脚本、代理、函数或特殊对象')
    if (Array.isArray(value)) {
      // length必须在复制/map之前受界；稀疏孔洞不是JSON数据，不能绕过节点计数。
      arraySlots += value.length
      if (arraySlots > limits.inputNodes) throw Error('候选数组槽位总量超出推荐输入界')
      for (let index = 0; index < value.length; index++) {
        tick()
        const item = Object.getOwnPropertyDescriptor(value, String(index))
        if (!item || !('value' in item) || !item.enumerable) throw Error('候选数组必须是稠密可枚举JSON数据，且不含访问器')
      }
    }
    if (ancestors.has(value)) throw Error('候选JSON不能有循环引用')
    ancestors.add(value); stack.push([value, depth, true])
    for (const key in value) {
      if (!Object.hasOwn(value, key)) continue
      strings += key.length
      if (strings > limits.inputStringUnits || nodes + stack.length >= limits.inputNodes) throw Error('候选JSON数据超出推荐输入界')
      const descriptor = Object.getOwnPropertyDescriptor(value, key)!
      if (!('value' in descriptor)) throw Error('候选JSON不能包含访问器')
      stack.push([descriptor.value, depth + 1, false])
    }
  }
  if (!object(input)) throw Error('候选room.json必须是完整对象')
  return structuredClone(input)
}
export function suggestRoomPlacement(input: unknown, options: unknown, context: Context, control: TestControl = {}): SuggestionOutcome {
  const limits = { ...SUGGEST_LIMITS }
  for (const [key, value] of Object.entries(control.limits ?? {})) {
    if (!Object.hasOwn(limits, key) || !Number.isSafeInteger(value) || value! < 0 || value! > limits[key as keyof typeof limits]) throw TypeError('私有测试界只能缩小')
    Object.assign(limits, { [key]: value })
  }
  const now = control.now ?? (() => performance.now()), started = now(), result = suggestionOutcome()
  result.kind = 'checked'; result.status = 'invalid-input'; result.search.limits = limits
  const finish = (termination: string, truncated = false) => {
    result.search.termination = termination; result.search.truncated = truncated; result.search.elapsedMs = Math.max(0, now() - started)
    result.ok = result.suggestions.length > 0
    if (result.ok) result.status = 'suggested'
    return structuredClone(result)
  }
  const reject = (code: string, message: string, fieldPath = 'layout') => { result.diagnostics.push({ stage: 'input', code, message, fieldPath }); return finish('input-rejected') }
  const expired = () => now() - started >= limits.milliseconds
  const tick = () => { if (expired()) throw Error('recommendation-time-limit') }
  if (!object(options) || types.isProxy(options)) return reject('SUGGEST_OPTIONS', '需要且只接受普通{ instanceId }数据')
  let keys = 0
  for (const key in options) if (Object.hasOwn(options, key) && (++keys > 1 || key !== 'instanceId')) return reject('SUGGEST_OPTIONS', '不接受限额、资源或其他推荐覆盖参数', 'options')
  const descriptor = Object.getOwnPropertyDescriptor(options, 'instanceId'), instanceId = descriptor?.value
  if (keys !== 1 || !descriptor || !('value' in descriptor) || typeof instanceId !== 'string' || !instanceId.trim() || instanceId.length > limits.inputStringUnits) return reject('SUGGEST_OPTIONS', 'instanceId必须是非空字符串数据', 'options.instanceId')
  result.instanceId = instanceId
  let layout: JsonObject
  try { layout = snapshot(input, limits, tick) }
  catch (error) {
    if (error instanceof Error && error.message === 'recommendation-time-limit') { result.status = 'unconfirmed'; return finish('time-limit', true) }
    return reject('SUGGEST_INPUT', error instanceof Error ? error.message : String(error))
  }
  if (!Array.isArray(layout.instances)) return reject('SUGGEST_INPUT', '完整候选需要instances数组', 'layout.instances')
  const targets = layout.instances.map((item: unknown, index: number) => ({ item, index })).filter(({ item }: { item: unknown }) => object(item) && item.instanceId === instanceId)
  if (targets.length !== 1) return reject(targets.length ? 'SUGGEST_TARGET_DUPLICATE' : 'SUGGEST_TARGET_MISSING', '目标instanceId必须在完整候选中恰好出现一次', 'layout.instances')
  const target = targets[0].item as JsonObject, targetIndex = targets[0].index, desired = target.placement
  if (!object(desired) || desired.kind !== 'floor') return reject('SUGGEST_FLOOR_REQUIRED', '本入口只推荐已有floor目标；surface子项不独立推荐', `layout.instances[${targetIndex}].placement`)
  if (!finite(desired.x) || !finite(desired.z) || !finite(Math.hypot(desired.x, desired.z)) || ![0, 90, 180, 270].includes(desired.yawDeg) || typeof desired.zoneId !== 'string') return reject('SUGGEST_TARGET_INPUT', '目标需要有限期望坐标/位移、区域ID和直角期望朝向', `layout.instances[${targetIndex}].placement`)
  const template = context.templates.find(t => t.templateId === layout.templateRef)
  const assets = context.catalog.assets.filter((a: any) => a?.assetId === target.assetId) as JsonObject[]
  const zones = Array.isArray(template?.zones) ? template.zones.filter((z: any) => z.zoneId === desired.zoneId && z.kind === 'floor') : []
  const candidates: FloorPlacement[] = [], seen = new Set<string>(), diagnosticKeys = new Set<string>()
  let generationTruncated = false
  const add = (x: number, z: number, yawDeg: number) => {
    if (expired() || result.search.generated >= limits.generated || candidates.length >= limits.candidates) { generationTruncated = true; return }
    result.search.generated++
    if (![x, z, yawDeg].every(finite)) return
    const key = JSON.stringify([x, z, yawDeg])
    if (seen.has(key)) return
    seen.add(key); candidates.push({ ...desired, x, z, yawDeg } as FloorPlacement); result.search.candidates = candidates.length
  }
  add(desired.x, desired.z, desired.yawDeg)
  const collect = (placed: RoomPlacementOutcome) => {
    const state = placed.status === 'confirmed' && placed.ok ? 'confirmed' : placed.status === 'unconfirmed' ? 'unconfirmed' : 'hardRejected'
    result.search[state]++
    for (const diagnostic of placed.diagnostics) {
      const key = JSON.stringify(diagnostic)
      if (diagnosticKeys.has(key)) continue
      if (result.diagnostics.length >= limits.diagnostics) { result.diagnosticsTruncated = true; break }
      diagnosticKeys.add(key)
      result.diagnostics.push(structuredClone(diagnostic))
    }
  }
  const accept = (p: FloorPlacement, placed: RoomPlacementOutcome) => {
    if (placed.ok && placed.status === 'confirmed' && result.suggestions.length < limits.results) result.suggestions.push({ placement: { ...p }, distance: Math.hypot(p.x - desired.x, p.z - desired.z), yawChanged: p.yawDeg !== desired.yawDeg, confirmation: placed })
  }
  // 期望位置先走同一完整check；此调用也计入总次数/计时，没有局部预筛通过。
  if (expired() || !limits.checks || !candidates.length) { result.status = 'unconfirmed'; return finish(expired() ? 'time-limit' : 'candidate-limit', true) }
  const initial = context.check(layout); result.search.checked++
  const resourceDiagnostic = (d: RoomDiagnostic) => /^(template|catalog)(?:\.|$)/.test(d.fieldPath ?? '') && (
    ['STRUCT_INVALID', 'VERSION_UNSUPPORTED', 'ID_DUPLICATE'].includes(d.code) ||
    (d.code === 'PLACEMENT_UNSUPPORTED' && /^template(?:\.|$)/.test(d.fieldPath ?? ''))
  )
  if (initial.kind === 'failed' || initial.diagnostics.some(resourceDiagnostic)) {
    // 正式核心明确定位到包资源；不把资源损坏当作候选硬冲突或继续搜索。
    result.kind = 'failed'; result.status = 'failed'
    result.diagnostics = initial.diagnostics.slice(0, limits.diagnostics).map(d => ({ ...d, stage: resourceDiagnostic(d) ? 'resources' : d.stage }))
    result.diagnosticsTruncated = initial.diagnostics.length > limits.diagnostics
    return finish('resource-failure')
  }
  collect(initial); accept(candidates[0], initial)
  if (!template || assets.length !== 1 || zones.length !== 1) return finish('input-rejected')
  if (initial.status === 'unconfirmed' && initial.reachability?.stage === 'input') { result.status = 'unconfirmed'; return finish('validation-input-limit', true) }
  const asset = assets[0], zone = zones[0]
  const yaws = Array.isArray(asset.placement?.allowedYawDeg) ? [...new Set<number>(asset.placement.allowedYawDeg.filter((y: unknown) => [0, 90, 180, 270].includes(y as number)))].sort((a, b) => Number(a !== desired.yawDeg) - Number(b !== desired.yawDeg) || a - b) : []
  if (!yaws.length || !asset.placement?.allowedKinds?.includes('floor') || !asset.bounds || !zone.bounds) return finish('input-rejected')
  const boxes = [asset.bounds, ...(asset.clearanceBoxes ?? []).map((c: any) => c.bounds)]
  if (boxes.some(b => !b || !['minX', 'maxX', 'minY', 'maxY', 'minZ', 'maxZ'].every(k => finite(b[k])))) return finish('input-rejected')
  const extent = (yaw: number) => {
    const transformed = boxes.map(b => context.worldBox(b, { x: 0, z: 0 }, yaw))
    return { minX: Math.min(...transformed.map(b => b.minX)), maxX: Math.max(...transformed.map(b => b.maxX)), minZ: Math.min(...transformed.map(b => b.minZ)), maxZ: Math.max(...transformed.map(b => b.maxZ)) }
  }
  const nearbyYaw = yaws.includes(desired.yawDeg) ? desired.yawDeg : yaws[0]
  const e = extent(nearbyYaw), step = Math.max(.35, Math.min(1, Math.min(e.maxX - e.minX, e.maxZ - e.minZ) / 2))
  for (const yaw of yaws) add(desired.x, desired.z, yaw)
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const yaw of yaws) add(desired.x + dx * step, desired.z + dz * step, yaw)
  for (const [dx, dz] of [[2, 0], [-2, 0], [0, 2], [0, -2], [1, 1], [1, -1], [-1, 1], [-1, -1]]) add(desired.x + dx * step, desired.z + dz * step, nearbyYaw)
  // 元数据旋转盒只用于取有限参考点，不能替代正式实体/操作/子项/可达性检查。
  for (const yaw of yaws) {
    const b = extent(yaw), x0 = zone.bounds.minX - b.minX, x1 = zone.bounds.maxX - b.maxX, z0 = zone.bounds.minZ - b.minZ, z1 = zone.bounds.maxZ - b.maxZ
    if (x0 > x1 || z0 > z1) continue
    for (const [x, z] of [[(x0 + x1) / 2, (z0 + z1) / 2], [x0, z0], [x0, z1], [x1, z0], [x1, z1]]) add(x, z, yaw)
  }
  result.search.candidates = candidates.length
  const compare = (a: FloorPlacement, b: FloorPlacement) => Math.hypot(a.x - desired.x, a.z - desired.z) - Math.hypot(b.x - desired.x, b.z - desired.z) || Number(a.yawDeg !== desired.yawDeg) - Number(b.yawDeg !== desired.yawDeg) || a.yawDeg - b.yawDeg || a.x - b.x || a.z - b.z
  const remaining = candidates.slice(1).sort(compare)
  let termination = 'finite-candidates-exhausted', truncated = false
  for (const p of remaining) {
    if (expired()) { termination = 'time-limit'; truncated = true; break }
    if (result.search.checked >= limits.checks) { termination = 'candidate-limit'; truncated = true; break }
    if (result.suggestions.length >= limits.results) { termination = 'result-limit'; truncated = true; break }
    // 替换目标placement对象，避免调用方共享引用使非目标也被修改；子项局部信息不变。
    target.placement = { ...p }
    const placed = context.check(layout); result.search.checked++; collect(placed); accept(p, placed)
  }
  if (termination === 'finite-candidates-exhausted' && expired()) { termination = 'time-limit'; truncated = true }
  if (termination === 'finite-candidates-exhausted' && generationTruncated) { termination = 'candidate-limit'; truncated = true }
  result.suggestions.sort((a, b) => compare(a.placement, b.placement))
  result.status = result.search.unconfirmed ? 'unconfirmed' : 'not-found'
  return finish(termination, truncated)
}

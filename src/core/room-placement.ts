// 官方试摆适配；完整业务、绑定与资料检查仍由 check-room 执行。
import { createRoomResourceReader, loadRoomTemplates, loadRoomPlacementResources, selectRoomTemplate, RoomResourceError, type RoomDiagnostic } from './room-resources.ts'
import { CoreError } from './errors.ts'
import { suggestRoomPlacement, type SuggestionOutcome } from './room-suggestion.ts'
import { inspectRoomSurfaces, suggestRoomSurface, type SurfaceInventoryOutcome, type SurfaceSuggestionOutcome } from './room-surface.ts'

export interface RoomPlacementOutcome {
  schemaVersion: 1; scope: 'placement'; kind: 'checked' | 'failed'; ok: boolean
  status: 'confirmed' | 'invalid' | 'unconfirmed' | 'failed'
  unchecked: readonly ['business-ownership', 'binding-validity', 'material-readability']
  diagnostics: (RoomDiagnostic & { stage: 'template' | 'resources' | 'placement' | 'input' })[]
  reachability?: { status: string; reason?: string; stage?: string }
}
export function placementOutcome(): RoomPlacementOutcome {
  return { schemaVersion: 1, scope: 'placement', kind: 'failed', ok: false, status: 'failed', unchecked: ['business-ownership', 'binding-validity', 'material-readability'], diagnostics: [] }
}
export function placementFailure(error: unknown): RoomPlacementOutcome {
  const initial = placementOutcome()
  if (error instanceof RoomResourceError) return { ...initial, diagnostics: structuredClone(error.diagnostics.map(d => ({ ...d, stage: error.stage }))) }
  return { ...initial, diagnostics: [{ stage: 'resources', code: error instanceof CoreError ? error.code : 'ROOM_RESOURCE_READ', message: error instanceof Error ? error.message : String(error) }] }
}
function freezeJson(value: unknown): void {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return
  for (const child of Object.values(value)) freezeJson(child)
  Object.freeze(value)
}
/** 异步加载当前包一次；无参数、无预算覆盖。check 同步检查完整候选，不写输入、不输出模型。 */
export async function createRoomPlacementChecker(): Promise<{
  check(layout: unknown): RoomPlacementOutcome
  suggest(layout: unknown, options: { instanceId: string }): SuggestionOutcome
  inspectSurfaces(layout: unknown): SurfaceInventoryOutcome
  suggestSurface(layout: unknown, options: { instanceId: string; parentInstanceId?: string; surfaceId?: string }): SurfaceSuggestionOutcome
}> {
  if (arguments.length) throw new TypeError('createRoomPlacementChecker 不接受资源路径或校验选项')
  try {
    const reader = await createRoomResourceReader()
    const templates = await loadRoomTemplates(reader)
    // 模板重复是运行包损坏，初始化即拒绝，不能让不同候选掩盖问题。
    for (const item of templates) selectRoomTemplate(templates, item.templateId)
    const { placement, catalog } = await loadRoomPlacementResources(reader)
    freezeJson(templates); freezeJson(catalog)
    const check = function(layout: unknown): RoomPlacementOutcome {
      if (arguments.length !== 1) throw new TypeError('check 只接受一个完整候选 room.json 对象')
      const templateRef = (layout as { templateRef?: unknown } | null)?.templateRef
      const template = selectRoomTemplate(templates, templateRef)
      if (!template) return { ...placementOutcome(), kind: 'checked', status: 'invalid', diagnostics: [{ stage: 'template', code: 'TEMPLATE_UNKNOWN', message: `房间模板未登记：${String(templateRef)}`, fieldPath: 'layout.templateRef' }] }
      // 不传 options：原 T29 每次创建独立预算，失败/未判定不会留存状态。
      const result = placement.validatePlacement(template, catalog, layout)
      const reachability = result.reachability && { status: result.reachability.status, ...(result.reachability.reason ? { reason: result.reachability.reason } : {}), ...(result.reachability.stage ? { stage: result.reachability.stage } : {}) }
      return structuredClone({ ...placementOutcome(), kind: 'checked', ok: result.ok, status: result.status, diagnostics: result.diagnostics.map(d => ({ ...d, stage: 'placement' as const })), ...(reachability ? { reachability } : {}) })
    }
    const surfaceContext = { templates, catalog, check, worldBox: placement.worldBox }
    return Object.freeze({ check,
      inspectSurfaces(layout: unknown): SurfaceInventoryOutcome {
        if (arguments.length !== 1) throw new TypeError('inspectSurfaces只接受完整候选')
        return inspectRoomSurfaces(layout, surfaceContext)
      },
      suggestSurface(layout: unknown, options: { instanceId: string; parentInstanceId?: string; surfaceId?: string }): SurfaceSuggestionOutcome {
        if (arguments.length !== 2) throw new TypeError('suggestSurface只接受完整候选及目标/过滤数据')
        if (typeof placement.worldBox !== 'function') throw new RoomResourceError([{ code: 'ROOM_RESOURCE_READ', message: '运行包缺少推荐所需worldBox导出' }])
        return suggestRoomSurface(layout, options, surfaceContext)
      }, suggest(layout: unknown, options: { instanceId: string }): SuggestionOutcome {
      if (arguments.length !== 2) throw new TypeError('suggest只接受完整候选及{ instanceId }')
      if (typeof placement.worldBox !== 'function') throw new RoomResourceError([{ code: 'ROOM_RESOURCE_READ', message: '运行包缺少推荐所需worldBox导出' }])
      return suggestRoomPlacement(layout, options, { templates, catalog, check, worldBox: placement.worldBox })
    } })
  } catch (error) {
    if (error instanceof RoomResourceError) throw error
    throw new RoomResourceError(placementFailure(error).diagnostics)
  }
}

// 仅供同包 Node 入口使用：不接收外部路径，不加载模型，不访问业务资料。
import path from 'node:path'
import { readFile, realpath } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { CoreError } from './errors.ts'

export interface RoomDiagnostic {
  code: string; message: string; fieldPath?: string; instanceIds?: string[]; targetId?: string | null; sourcePath?: string
}
export interface RoomCatalog { assets: unknown[] }
export interface PlacementValidation {
  ok: boolean; status: 'invalid' | 'unconfirmed' | 'confirmed'; diagnostics: RoomDiagnostic[]
  reachability?: { status: string; reason?: string; stage?: string }
}
interface PlacementModule {
  validatePlacement: (template: unknown, catalog: RoomCatalog, layout: unknown) => PlacementValidation
  worldBox: (local: any, position: { x: number; z: number }, yaw: number) => any
}
interface CatalogModule {
  loadFurnitureCatalog: (options: { fetchJson: (url: string) => Promise<unknown> }) => Promise<{
    ok: boolean; diagnostics: RoomDiagnostic[]; catalog: RoomCatalog | null
  }>
}
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const reasonOf = (error: unknown) => error instanceof Error ? error.message : String(error)
// 所有入口构建在 dist/ 下；无源码或旧安装目录兜底。
const PACKAGE_ROOT = fileURLToPath(new URL('../', import.meta.url))
export class RoomResourceError extends CoreError {
  readonly diagnostics: RoomDiagnostic[]
  readonly stage: 'template' | 'resources'
  constructor(diagnostics: RoomDiagnostic[], stage: 'template' | 'resources' = 'resources') {
    super(diagnostics[0]?.code ?? 'ROOM_RESOURCE_READ', diagnostics.map(d => d.message).join('；'), 500)
    this.diagnostics = diagnostics
    this.stage = stage
  }
}
/** 保留原 check-room 的真实路径限制及家具 URL 白名单。 */
export async function createRoomResourceReader() {
  const packageReal = await realpath(PACKAGE_ROOT)
  const webRoot = path.join(packageReal, 'web')
  const resourcePath = async (relative: string): Promise<string> => {
    try {
      const absolute = await realpath(path.join(webRoot, relative))
      const fromWeb = path.relative(webRoot, absolute)
      if (fromWeb === '..' || fromWeb.startsWith('..' + path.sep) || path.isAbsolute(fromWeb)) throw new Error('资源路径越出运行包的 web 目录')
      return absolute
    } catch (error) {
      throw new CoreError('ROOM_RESOURCE_READ', `无法读取运行包资源 web/${relative}：${reasonOf(error)}`, 500)
    }
  }
  const readJson = async (relative: string): Promise<unknown> => {
    try { return JSON.parse(await readFile(await resourcePath(relative), 'utf8')) as unknown }
    catch (error) {
      if (error instanceof CoreError) throw error
      throw new CoreError('ROOM_RESOURCE_READ', `无法解析运行包资源 web/${relative}：${reasonOf(error)}`, 500)
    }
  }
  const importResource = async (relative: string): Promise<unknown> => {
    try { return await import(pathToFileURL(await resourcePath(relative)).href) }
    catch (error) {
      if (error instanceof CoreError) throw error
      throw new CoreError('ROOM_RESOURCE_READ', `无法导入运行包模块 web/${relative}：${reasonOf(error)}`, 500)
    }
  }
  return { readJson, importResource }
}
type Reader = Awaited<ReturnType<typeof createRoomResourceReader>>
export async function loadRoomTemplates(reader: Reader): Promise<Record<string, unknown>[]> {
  const input = await reader.readJson('assets/rooms/templates.json')
  if (!isObject(input) || input.schemaVersion !== 1 || !Array.isArray(input.templates)) {
    throw new RoomResourceError([{ code: 'TEMPLATE_INPUT', message: '运行包 templates.json 必须是 schemaVersion=1 且 templates 为数组的对象', fieldPath: 'templates', sourcePath: 'web/assets/rooms/templates.json' }], 'template')
  }
  if (input.templates.some(item => !isObject(item))) throw new RoomResourceError([{ code: 'TEMPLATE_INPUT', message: '运行包 templates 数组每项必须是对象，不能忽略损坏项', fieldPath: 'templates', sourcePath: 'web/assets/rooms/templates.json' }], 'template')
  return input.templates as Record<string, unknown>[]
}
export function selectRoomTemplate(templates: Record<string, unknown>[], templateRef: unknown) {
  const matches = templates.filter(item => item.templateId === templateRef)
  if (matches.length > 1) throw new RoomResourceError([{ code: 'TEMPLATE_INPUT', message: `运行包模板 ${String(templateRef)} 重复登记，必须恰好一项`, fieldPath: 'templates', sourcePath: 'web/assets/rooms/templates.json' }], 'template')
  return matches[0]
}
export async function loadRoomPlacementResources(reader: Reader) {
  const placeholder = await reader.readJson('assets/rooms/placeholder-catalog.json')
  if (!isObject(placeholder) || !Array.isArray(placeholder.assets)) throw new RoomResourceError([{ code: 'CATALOG_INPUT', message: '运行包 placeholder-catalog.json 必须是 assets 为数组的非 null、非数组对象', fieldPath: 'catalog', sourcePath: 'web/assets/rooms/placeholder-catalog.json' }])
  const placement = await reader.importResource('assets/rooms/placement.js') as PlacementModule
  const library = await reader.importResource('assets/furniture/catalog.js') as CatalogModule
  if (typeof placement.validatePlacement !== 'function' || typeof library.loadFurnitureCatalog !== 'function') throw new CoreError('ROOM_RESOURCE_READ', '运行包校验模块缺少所需导出函数', 500)
  const loaded = await library.loadFurnitureCatalog({ fetchJson: async url => {
    const prefix = '/specdev-workbench/assets/furniture/'
    if (url === prefix + 'index.json') return reader.readJson('assets/furniture/index.json')
    const match = /^\/specdev-workbench\/assets\/furniture\/assets\/([a-z][a-z0-9]*(?:-[a-z0-9]+)*)\/asset\.json$/.exec(url)
    if (!match) throw new Error(`家具资源地址不在固定包内白名单：${url}`)
    return reader.readJson(`assets/furniture/assets/${match[1]}/asset.json`)
  } })
  if (!loaded.ok) throw new RoomResourceError(loaded.diagnostics)
  if (!loaded.catalog) throw new CoreError('ROOM_RESOURCE_READ', '家具目录读取成功却未返回目录', 500)
  return { placement, catalog: { schemaVersion: 1, assets: [...placeholder.assets, ...loaded.catalog.assets] } }
}

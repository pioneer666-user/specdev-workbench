// 独立房间只读校验：Core 读取工作树，页面同款模块校验，不加载模型或启动宿主。
// E9c 起资料分两类检查：文档按登记路径读工作树，流程图经真实 readChartPage 读取并
// 做 workflow.json 的 JSON 解析与顶层对象检查——这是读取层校验，不是 Archify 编译
// 或可视渲染验证；图语义、节点详情与源码证据的完整性仍由既有阅读页处理。
import path from 'node:path'
import { readFile, realpath } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { CoreError } from '../core/errors.ts'
import { assertRepoUsable, assertRepoTopLevel, readWorktreeFileOptional } from '../core/git.ts'
import { readRoomLayout, roomLayoutRel } from '../core/room.ts'
import { readChartPage } from '../core/chart.ts'

type Stage = 'input' | 'repo' | 'read' | 'resources' | 'template' | 'placement' | 'bindings' | 'documents' | 'charts'
interface Diagnostic {
  stage: Stage
  code: string
  message: string
  fieldPath?: string
  instanceIds?: string[]
  targetId?: string
  sourcePath?: string
  causeCode?: string
}
type ModuleDiagnostic = Omit<Diagnostic, 'stage'>
interface Catalog { assets: unknown[] }
interface Validation { ok: boolean; diagnostics: ModuleDiagnostic[] }
interface PlacementModule { validatePlacement: (template: unknown, catalog: Catalog, layout: unknown) => Validation }
/** 目录条目按 kind 区分（E9c）：文档＝登记路径，流程图＝业务与 chartId；不共用裸字符串键。 */
interface DocumentDirectoryEntry { kind: 'document'; businessId: string; path: string }
interface ChartDirectoryEntry { kind: 'workflow'; businessId: string; chartId: string; title: string; unavailableReason?: string }
type DirectoryEntry = DocumentDirectoryEntry | ChartDirectoryEntry
interface BindingsModule {
  resolveRoomBindings: (input: { business: unknown; layout: unknown; catalog: Catalog }) => Validation & {
    directory: DirectoryEntry[]
  }
}
interface CatalogModule {
  loadFurnitureCatalog: (options: { fetchJson: (url: string) => Promise<unknown> }) => Promise<Validation & { catalog: Catalog | null }>
}
export interface RoomCheckOutcome {
  schemaVersion: 1
  kind: 'checked' | 'failed'
  ok: boolean
  repoRoot: string | null
  businessId: string | null
  sourcePath: string | null
  diagnostics: Diagnostic[]
}
export interface CliIo { out: (text: string) => void; err: (text: string) => void }

const USAGE = '用法：node <插件包根>/dist/check-room.js <项目仓库根> <业务ID> [--json]'
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
// 只支持 dist 产物；从实际运行入口定位包根，不受 cwd 影响，也不接受外部包根参数。
const PACKAGE_ROOT = fileURLToPath(new URL('../', import.meta.url))
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const reasonOf = (error: unknown): string => error instanceof Error ? error.message : String(error)

function initialOutcome(): RoomCheckOutcome {
  return { schemaVersion: 1, kind: 'failed', ok: false, repoRoot: null, businessId: null, sourcePath: null, diagnostics: [] }
}
function withProblems(outcome: RoomCheckOutcome, kind: 'checked' | 'failed', diagnostics: Diagnostic[]): RoomCheckOutcome {
  return { ...outcome, kind, ok: false, diagnostics }
}
function atStage(diagnostics: ModuleDiagnostic[], stage: Stage): Diagnostic[] {
  return diagnostics.map((diagnostic) => ({ ...diagnostic, stage }))
}

/** 每次读取当前工作树及包内 JSON；失败停止依赖阶段，保留原诊断，不改写任何文件。 */
export async function runRoomCheck(input: string, businessId: string): Promise<RoomCheckOutcome> {
  let outcome = initialOutcome()
  let stage: Stage = 'input'
  try {
    if (!input || !ID_PATTERN.test(businessId)) {
      throw new CoreError('bad-request', '需要非空项目仓库根和合法业务 ID（字母数字开头，可含 . _ -）', 400)
    }
    outcome = { ...outcome, repoRoot: path.resolve(input), businessId, sourcePath: roomLayoutRel(businessId) }
    const repoRoot = outcome.repoRoot!
    stage = 'repo'
    await assertRepoUsable(repoRoot)
    await assertRepoTopLevel(repoRoot)
    stage = 'read'
    const { business, layout } = await readRoomLayout(repoRoot, businessId)

    stage = 'resources'
    // 固定资源与注入的家具 URL 都只能落到当前包 web 中；不回退源码，不发 HTTP。
    const packageReal = await realpath(PACKAGE_ROOT)
    const webRoot = path.join(packageReal, 'web')
    const resourcePath = async (relative: string): Promise<string> => {
      try {
        const absolute = await realpath(path.join(webRoot, relative))
        const fromWeb = path.relative(webRoot, absolute)
        if (fromWeb === '..' || fromWeb.startsWith('..' + path.sep) || path.isAbsolute(fromWeb)) {
          throw new Error('资源路径越出运行包的 web 目录')
        }
        return absolute
      } catch (error) {
        throw new CoreError('ROOM_RESOURCE_READ', `无法读取运行包资源 web/${relative}：${reasonOf(error)}`, 500)
      }
    }
    const readJson = async (relative: string): Promise<unknown> => {
      try {
        return JSON.parse(await readFile(await resourcePath(relative), 'utf8')) as unknown
      } catch (error) {
        if (error instanceof CoreError) throw error
        throw new CoreError('ROOM_RESOURCE_READ', `无法解析运行包资源 web/${relative}：${reasonOf(error)}`, 500)
      }
    }
    const importResource = async (relative: string): Promise<unknown> => {
      try {
        // 使用运行时 URL，避免 esbuild 将 registry 的模型及 Three 追入 CLI。
        const url = pathToFileURL(await resourcePath(relative)).href
        return await import(url)
      } catch (error) {
        if (error instanceof CoreError) throw error
        throw new CoreError('ROOM_RESOURCE_READ', `无法导入运行包模块 web/${relative}：${reasonOf(error)}`, 500)
      }
    }
    const templates = await readJson('assets/rooms/templates.json')
    if (!isObject(templates) || templates.schemaVersion !== 1 || !Array.isArray(templates.templates)) {
      return withProblems(outcome, 'failed', [{ stage: 'template', code: 'TEMPLATE_INPUT', message: '运行包 templates.json 必须是 schemaVersion=1 且 templates 为数组的对象', fieldPath: 'templates', sourcePath: 'web/assets/rooms/templates.json' }])
    }
    const matches = templates.templates.filter((item: unknown) => isObject(item) && item.templateId === layout.templateRef)
    if (matches.length === 0) {
      return withProblems(outcome, 'checked', [{ stage: 'template', code: 'TEMPLATE_UNKNOWN', message: `房间模板未登记：${layout.templateRef}`, fieldPath: 'layout.templateRef', sourcePath: outcome.sourcePath! }])
    }
    if (matches.length !== 1) {
      return withProblems(outcome, 'failed', [{ stage: 'template', code: 'TEMPLATE_INPUT', message: `运行包模板 ${layout.templateRef} 重复登记，必须恰好一项`, fieldPath: 'templates', sourcePath: 'web/assets/rooms/templates.json' }])
    }
    const placeholder = await readJson('assets/rooms/placeholder-catalog.json')
    if (!isObject(placeholder) || !Array.isArray(placeholder.assets)) {
      return withProblems(outcome, 'failed', [{ stage: 'resources', code: 'CATALOG_INPUT', message: '运行包 placeholder-catalog.json 必须是 assets 为数组的非 null、非数组对象', fieldPath: 'catalog', sourcePath: 'web/assets/rooms/placeholder-catalog.json' }])
    }
    const placement = await importResource('assets/rooms/placement.js') as PlacementModule
    const bindings = await importResource('assets/rooms/bindings.js') as BindingsModule
    const library = await importResource('assets/furniture/catalog.js') as CatalogModule
    if (typeof placement.validatePlacement !== 'function' || typeof bindings.resolveRoomBindings !== 'function' || typeof library.loadFurnitureCatalog !== 'function') {
      throw new CoreError('ROOM_RESOURCE_READ', '运行包校验模块缺少所需导出函数', 500)
    }
    const loaded = await library.loadFurnitureCatalog({ fetchJson: async (url) => {
      const prefix = '/specdev-workbench/assets/furniture/'
      if (url === prefix + 'index.json') return readJson('assets/furniture/index.json')
      const match = /^\/specdev-workbench\/assets\/furniture\/assets\/([a-z][a-z0-9]*(?:-[a-z0-9]+)*)\/asset\.json$/.exec(url)
      if (!match) throw new Error(`家具资源地址不在固定包内白名单：${url}`)
      return readJson(`assets/furniture/assets/${match[1]}/asset.json`)
    } })
    if (!loaded.ok) return withProblems(outcome, 'failed', atStage(loaded.diagnostics, 'resources'))
    if (!loaded.catalog) throw new CoreError('ROOM_RESOURCE_READ', '家具目录读取成功却未返回目录', 500)
    // 数组拼接，不能覆盖去重；重复 ID 交真实 placement 诊断。
    const catalog = { schemaVersion: 1, assets: [...placeholder.assets, ...loaded.catalog.assets] }
    stage = 'placement'
    const placed = placement.validatePlacement(matches[0], catalog, layout)
    if (!placed.ok) return withProblems(outcome, 'checked', atStage(placed.diagnostics, stage))
    stage = 'bindings'
    const resolved = bindings.resolveRoomBindings({ business, layout, catalog })
    if (!resolved.ok) return withProblems(outcome, 'checked', atStage(resolved.diagnostics, stage))
    stage = 'documents'
    const diagnostics: Diagnostic[] = []
    const seenDocs = new Set<string>()
    const seenCharts = new Set<string>()
    // 绑定通过后串行检查当前业务全部登记资料（含未绑家具的图）；目录条目按 kind 分派，
    // 文档按路径去重、图按 chartId 去重，两者不共用裸字符串键。
    for (const entry of resolved.directory) {
      if (entry.businessId !== businessId) continue
      if (entry.kind === 'workflow') {
        if (seenCharts.has(entry.chartId)) continue
        seenCharts.add(entry.chartId)
        if (entry.unavailableReason) {
          // 坏说明/重名冲突的登记图：保留身份并报告真实原因（BINDING 层同源）。
          diagnostics.push({ stage: 'charts', code: 'CHART_UNAVAILABLE', targetId: entry.chartId, message: `业务 ${businessId} 登记的流程图 ${entry.chartId}（${entry.title}）当前不可用：${entry.unavailableReason}` })
          continue
        }
        // 复用既有读取层（定位、跨业务/重名、文件大小与路径规则保留），不拼磁盘文件绕过。
        let page: Awaited<ReturnType<typeof readChartPage>>
        try {
          page = await readChartPage(repoRoot, businessId, entry.chartId, 'current')
        } catch (error) {
          const causeCode = error instanceof CoreError ? error.code : (error as NodeJS.ErrnoException)?.code
          diagnostics.push({ stage: 'charts', code: 'CHART_UNREADABLE', targetId: entry.chartId, message: `流程图 ${entry.chartId} 读取失败：${reasonOf(error)}`, ...(causeCode ? { causeCode } : {}) })
          continue
        }
        // workflowError/缺失可能是返回体错误（不一定抛异常）；有 workflow 文本才做解析检查。
        if (page.version.workflowError || page.version.files.workflow == null) {
          diagnostics.push({ stage: 'charts', code: 'CHART_UNREADABLE', targetId: entry.chartId, message: `流程图 ${entry.chartId} 的 workflow.json 缺失或读不开：${page.version.workflowError ?? 'readChartPage 未返回 workflow 内容'}` })
          continue
        }
        let workflow: unknown
        try {
          workflow = JSON.parse(page.version.files.workflow)
        } catch (error) {
          diagnostics.push({ stage: 'charts', code: 'CHART_JSON_INVALID', targetId: entry.chartId, message: `流程图 ${entry.chartId} 的 workflow.json 不是合法 JSON：${reasonOf(error)}` })
          continue
        }
        if (!isObject(workflow)) {
          diagnostics.push({ stage: 'charts', code: 'CHART_JSON_INVALID', targetId: entry.chartId, message: `流程图 ${entry.chartId} 的 workflow.json 顶层必须是 JSON 对象（实际是 ${Array.isArray(workflow) ? '数组' : typeof workflow}）` })
          continue
        }
        // details/evidence 缺失或既有读取降级不改成必填（完整性由既有阅读页处理）；
        // 语法有效的 workflow 也不代表图已编译或可渲染。
        continue
      }
      if (seenDocs.has(entry.path)) continue
      seenDocs.add(entry.path)
      try {
        if (await readWorktreeFileOptional(repoRoot, entry.path) === null) {
          diagnostics.push({ stage, code: 'DOCUMENT_UNREADABLE', sourcePath: entry.path, message: `business.json 登记的资料不存在或不是文件：${entry.path}` })
        }
      } catch (error) {
        const causeCode = error instanceof CoreError ? error.code : (error as NodeJS.ErrnoException)?.code
        diagnostics.push({ stage, code: 'DOCUMENT_UNREADABLE', sourcePath: entry.path, message: `business.json 登记的资料无法读取：${entry.path}（${reasonOf(error)}）`, ...(causeCode ? { causeCode } : {}) })
      }
    }
    return { ...outcome, kind: 'checked', ok: diagnostics.length === 0, diagnostics }
  } catch (error) {
    return withProblems(outcome, 'failed', [{ stage, code: error instanceof CoreError ? error.code : 'internal', message: reasonOf(error) }])
  }
}

export function exitCodeOf(outcome: RoomCheckOutcome): number {
  return outcome.kind === 'failed' ? 2 : outcome.ok ? 0 : 1
}

/** 中文报告不输出资料正文、几何或模型；问题按来源指向清单/资料或运行包。 */
export function formatReport(outcome: RoomCheckOutcome): string {
  const lines = [`房间校验：${outcome.businessId ?? '（业务未解析）'}`, `仓库：${outcome.repoRoot ?? '（未解析）'}`, `配置：${outcome.sourcePath ?? '（未解析）'}`]
  lines.push(outcome.ok ? '房间配置与登记资料检查通过' : outcome.kind === 'failed' ? '未通过：无法完成正常检查' : '未通过：配置或登记资料有问题')
  for (const diagnostic of outcome.diagnostics) {
    lines.push(`[${diagnostic.stage}/${diagnostic.code}] ${diagnostic.message}`)
    if (diagnostic.fieldPath) lines.push(`  字段：${diagnostic.fieldPath}`)
    if (diagnostic.instanceIds?.length) lines.push(`  实例：${diagnostic.instanceIds.join('、')}`)
    if (diagnostic.targetId) lines.push(`  目标：${diagnostic.targetId}`)
    if (diagnostic.sourcePath) lines.push(`  文件：${diagnostic.sourcePath}`)
    if (diagnostic.causeCode) lines.push(`  底层原因码：${diagnostic.causeCode}`)
    if (diagnostic.stage === 'documents' || diagnostic.stage === 'bindings') lines.push('  核对当前业务 business.json 的资料登记、资料文件及 room.json 绑定。')
    if (diagnostic.stage === 'charts') lines.push('  核对当前业务图目录的 chart.json、workflow.json 及 room.json 绑定；图的新建、修改与节点详情归 specdev-business，不在本检查内。')
    if (diagnostic.stage === 'resources' || diagnostic.code === 'TEMPLATE_INPUT') lines.push('  核对插件运行包资源；不要用改用户 room.json 掩盖包资源问题。')
  }
  return lines.join('\n')
}

/** 只认两个位置参数和至多一次 --json；JSON 模式包括用法错误也只输出一个对象。 */
export async function main(argv: readonly string[], io: CliIo): Promise<number> {
  const jsonCount = argv.filter((arg) => arg === '--json').length
  const inputs = argv.filter((arg) => arg !== '--json')
  const unknown = inputs.filter((arg) => arg.startsWith('-'))
  let outcome: RoomCheckOutcome
  if (jsonCount > 1 || inputs.length !== 2 || unknown.length > 0 || inputs.some((arg) => arg === '')) {
    const message = `需要两个位置参数（项目仓库根、业务 ID）和至多一次 --json。${unknown.length ? `未知参数：${unknown.join('、')}` : ''}`
    outcome = withProblems(initialOutcome(), 'failed', [{ stage: 'input', code: 'bad-request', message }])
    io.err(`${message}\n${USAGE}\n`)
  } else {
    outcome = await runRoomCheck(inputs[0], inputs[1])
  }
  io.out(`${jsonCount > 0 ? JSON.stringify(outcome, null, 2) : formatReport(outcome)}\n`)
  return exitCodeOf(outcome)
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.exitCode = await main(process.argv.slice(2), { out: (text) => process.stdout.write(text), err: (text) => process.stderr.write(text) })
}

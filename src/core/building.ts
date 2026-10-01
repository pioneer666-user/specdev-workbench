// 建筑蓝图绑定核对与模型生成（迁移第一期）：项目清单是内容依据，建筑 JSON 是空间安排。
// 本层读清单（复用 readInventory）与蓝图，核对"有没有漏掉业务或资料"，
// 并装配每间业务房的资料目录（文档＝登记路径，流程图＝业务 id＋图 id）；
// 绑定与资料全过后调 house.ts 的纯生成器产出建筑模型（清单身份经 sources 注入）。
// 不掺 workspace / DSH 接口——阅读链接产出裸路径，workspace 参数由页面侧补，与本插件既有口径一致。
import { readWorktreeFileOptional } from './git.ts'
import { CoreError } from './errors.ts'
import { readInventory } from './inventory.ts'
import { generateBuilding } from './house.ts'
import {
  BUILDING_BLUEPRINT_REL,
  BUILDING_FORMAT,
  BUILDING_SCHEMA,
  CONVENTION_ROOT,
  type BuildingBinding,
  type BuildingBindingProblem,
  type BuildingRoomBinding,
  type BuildingSpaceInput,
  type BusinessCatalog,
  type BusinessSummary,
  type CatalogEntry,
  type HouseModel,
  type HouseSources,
  type Inventory,
} from './types.ts'

/** 读业务仓库里的建筑蓝图。缺文件＝还没有蓝图（404，页面给空状态）；
 *  坏 JSON / 格式头不对＝蓝图本身坏了（500，明确报问题），两个状态不糊。 */
export async function readBuildingBlueprint(repoRoot: string): Promise<unknown> {
  const text = await readWorktreeFileOptional(repoRoot, BUILDING_BLUEPRINT_REL)
  if (text === null) {
    throw new CoreError(
      'no-building-blueprint',
      `该项目还没有建筑蓝图：未找到 ${BUILDING_BLUEPRINT_REL}。不会自动创建；蓝图描述空间安排，业务与资料内容以项目清单为准。`,
      404,
    )
  }
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (error) {
    throw new CoreError('bad-blueprint', `${BUILDING_BLUEPRINT_REL} 不是合法 JSON：${(error as Error).message}`, 500)
  }
  if (
    typeof data !== 'object' || data === null || Array.isArray(data)
    || (data as { format?: unknown }).format !== BUILDING_FORMAT
    || (data as { schema?: unknown }).schema !== BUILDING_SCHEMA
  ) {
    throw new CoreError(
      'bad-blueprint',
      `${BUILDING_BLUEPRINT_REL} 的格式头必须是 format=${BUILDING_FORMAT}、schema=${BUILDING_SCHEMA}`,
      500,
    )
  }
  return data
}

/** 从蓝图原始 JSON 里取 spaces（形状不对时报 BLUEPRINT_SHAPE，不炸整个核对）。 */
function extractSpaces(blueprint: unknown, problems: BuildingBindingProblem[]): BuildingSpaceInput[] {
  const rawSpaces = (blueprint as { spaces?: unknown }).spaces
  if (!Array.isArray(rawSpaces)) {
    problems.push({
      code: 'BLUEPRINT_SHAPE',
      severity: 'error',
      message: `${BUILDING_BLUEPRINT_REL} 缺少 spaces 数组（空间安排无法核对绑定）。`,
      subject: { path: '/spaces', ids: [] },
    })
    return []
  }
  const spaces: BuildingSpaceInput[] = []
  // id 重复会让"指出具体 ID 和蓝图字段"失去指向：报重复并只保留首个。
  const seen = new Map<string, number>()
  rawSpaces.forEach((raw, index) => {
    if (typeof raw !== 'object' || raw === null || typeof (raw as { id?: unknown }).id !== 'string' || (raw as { id: string }).id === '') {
      problems.push({
        code: 'BLUEPRINT_SHAPE',
        severity: 'error',
        message: `spaces/${index} 不是带非空 id 的对象，无法参与绑定核对。`,
        subject: { path: `/spaces/${index}`, ids: [] },
      })
      return
    }
    const space = raw as BuildingSpaceInput
    const first = seen.get(space.id)
    if (first !== undefined) {
      problems.push({
        code: 'BLUEPRINT_SHAPE',
        severity: 'error',
        message: `空间 id ${space.id} 在蓝图内重复。`,
        subject: { path: `/spaces/${index}/id`, ids: [space.id] },
        evidence: { firstAt: `/spaces/${first}/id` },
      })
      return
    }
    seen.set(space.id, index)
    spaces.push(space)
  })
  return spaces
}

/** 业务绑定核对（纯函数）：第一期一项目一栋建筑、一业务一房间。
 *  检查 room 缺 businessId、非 room 带 businessId、引用不存在的业务、重复绑定、清单业务无房。 */
export function checkBusinessBinding(
  inventory: Inventory,
  blueprint: unknown,
): { problems: BuildingBindingProblem[]; rooms: BuildingRoomBinding[] } {
  const problems: BuildingBindingProblem[] = []
  const spaces = extractSpaces(blueprint, problems)
  // directory 是绑定层的开关字段，类型必须严格：只认布尔或缺省（缺省＝开启）；
  // "false"/0/null 这类写法静默当作开启会让作者以为关掉了目录，核对却显示通过。
  for (const space of spaces) {
    if (space.directory !== undefined && typeof space.directory !== 'boolean') {
      problems.push({
        code: 'BLUEPRINT_SHAPE',
        severity: 'error',
        message: `空间 ${space.id} 的 directory 必须是布尔值（缺省视为开启）；收到 ${JSON.stringify(space.directory)}。`,
        subject: { path: `/spaces/${space.id}/directory`, ids: [space.id] },
        evidence: { got: JSON.stringify(space.directory) },
      })
    }
  }
  const businessById = new Map(inventory.businesses.map((b) => [b.id, b]))
  const rooms: BuildingRoomBinding[] = []
  const boundSpaces = new Map<string, string>() // businessId -> spaceId（首个绑定）
  for (const space of spaces) {
    const kind = typeof space.kind === 'string' ? space.kind : ''
    const hasBusiness = typeof space.businessId === 'string' && space.businessId !== ''
    if (kind !== 'room') {
      if (hasBusiness) {
        problems.push({
          code: 'BUSINESS_NOT_ROOM',
          severity: 'error',
          message: `空间 ${space.id} 不是 room，不能携带 businessId（第一期业务身份只落在房间上）。`,
          subject: { path: `/spaces/${space.id}/businessId`, ids: [space.id, space.businessId as string] },
        })
      }
      continue
    }
    if (!hasBusiness) {
      problems.push({
        code: 'BUSINESS_REQUIRED',
        severity: 'error',
        message: `房间 ${space.id} 缺少 businessId；第一期一业务一房间，每间业务房都要绑定清单里的业务。`,
        subject: { path: `/spaces/${space.id}/businessId`, ids: [space.id] },
      })
      continue
    }
    const businessId = space.businessId as string
    const business = businessById.get(businessId)
    if (!business) {
      problems.push({
        code: 'BUSINESS_UNKNOWN',
        severity: 'error',
        message: `房间 ${space.id} 绑定的业务 ${businessId} 不在项目清单（docs/specdev/ 的业务目录）里。`,
        subject: { path: `/spaces/${space.id}/businessId`, ids: [businessId, space.id] },
      })
      continue
    }
    const firstSpace = boundSpaces.get(businessId)
    if (firstSpace !== undefined) {
      problems.push({
        code: 'BUSINESS_DUPLICATE',
        severity: 'error',
        message: `业务 ${businessId} 被房间 ${firstSpace} 与 ${space.id} 重复绑定；第一期一业务一房间。`,
        subject: { path: `/spaces/${space.id}/businessId`, ids: [businessId, firstSpace, space.id] },
        evidence: { firstAt: `/spaces/${firstSpace}/businessId` },
      })
      continue
    }
    boundSpaces.set(businessId, space.id)
    rooms.push({
      spaceId: space.id,
      spaceName: space.name,
      floorId: space.floorId,
      businessId,
      businessName: business.name,
      directory: space.directory !== false,
    })
  }
  // 项目清单是内容依据：每个登记在清单里的业务（含说明文件有问题的业务）都必须有房间。
  for (const business of inventory.businesses) {
    if (!boundSpaces.has(business.id)) {
      problems.push({
        code: 'BUSINESS_MISSING',
        severity: 'error',
        message: `清单业务 ${business.id}（${business.name}）在蓝图里没有对应房间；换布局不能删减项目业务。`,
        subject: { path: '/spaces', ids: [business.id] },
        evidence: { businessName: business.name },
      })
    }
  }
  return { problems, rooms }
}

/** 资料目录条目的稳定身份（文档＝路径，流程图＝业务＋图），用于覆盖核对，不依赖标题或序号。 */
function materialKey(entry: { kind: string; businessId: string; path?: string; chartId?: string }): string {
  return entry.kind === 'document'
    ? `doc:${entry.businessId}:${entry.path ?? ''}`
    : `chart:${entry.businessId}:${entry.chartId ?? ''}`
}

/** 装配资料目录并核对资料可读性：每间业务房（directory 打开时）持有本业务全部文档与流程图的阅读入口。
 *  可读性按**实际阅读接口的同款读取约束**核（readWorktreeFileOptional：路径防逃逸＋2 MiB 上限＋读权限），
 *  存在但读不开（超限、权限）同样报错——文件在不代表点开能读。资料读取失败（文档不在或读不开、
 *  图说明坏、图无 workflow 或读不开、编号冲突、业务说明坏）明确报错，不当成空项目继续。 */
export async function buildReadingCatalog(
  repoRoot: string,
  inventory: Inventory,
  rooms: readonly BuildingRoomBinding[],
): Promise<{ problems: BuildingBindingProblem[]; catalog: BuildingBinding['catalog'] }> {
  const problems: BuildingBindingProblem[] = []
  const businesses: BusinessCatalog[] = []
  const roomByBusiness = new Map(rooms.map((room) => [room.businessId, room]))
  const reportUnreadable = (businessId: string, evidence: Record<string, unknown>, reason: string) => {
    problems.push({
      code: 'MATERIAL_UNREADABLE',
      severity: 'error',
      message: `业务 ${businessId} 的资料无法阅读：${reason}`,
      subject: { path: '', ids: [businessId] },
      evidence: { ...evidence, reason },
    })
  }
  for (const business of inventory.businesses) {
    const room = roomByBusiness.get(business.id)
    if (!room) continue // 未绑房间已由 BUSINESS_MISSING 报过，这里不重复
    const entries: CatalogEntry[] = []
    if (business.descriptorError) {
      reportUnreadable(business.id, { businessId: business.id },
        `业务说明文件有问题（${business.descriptorError}），资料清单不可信；不能当作没有资料继续生成`)
    }
    if (room.directory) {
      for (const docPath of business.docs) {
        let reason: string | null = null
        try {
          // 与 /api/doc 同一个读取函数：null＝不存在，抛错＝超限或读不开。
          const text = await readWorktreeFileOptional(repoRoot, docPath)
          if (text === null) reason = `登记的文档不存在（工作区）：${docPath}`
        } catch (error) {
          reason = error instanceof CoreError ? error.message : `读取文档 ${docPath} 失败：${String(error)}`
        }
        if (reason) reportUnreadable(business.id, { kind: 'document', businessId: business.id, path: docPath }, reason)
        entries.push({
          kind: 'document',
          businessId: business.id,
          path: docPath,
          title: docPath,
          href: `/specdev-workbench/api/doc?business=${encodeURIComponent(business.id)}&path=${encodeURIComponent(docPath)}`,
        })
      }
      for (const chart of business.charts) {
        const workflowRel = `${CONVENTION_ROOT}/${business.id}/${chart.id}/workflow.json`
        let reason: string | null = chart.descriptorError
          ? `图说明文件有问题（${chart.descriptorError}）`
          : chart.idConflict
            ? `图编号冲突：${chart.idConflict}`
            : null
        if (!reason) {
          try {
            // 与阅读页读 workflow.json 同一个函数：workflow 是图可读的必要文件，读不开图就打不开。
            const text = await readWorktreeFileOptional(repoRoot, workflowRel)
            if (text === null) reason = '图目录缺少 workflow.json，无法阅读'
          } catch (error) {
            reason = error instanceof CoreError ? error.message : `读取 ${workflowRel} 失败：${String(error)}`
          }
        }
        if (reason) reportUnreadable(business.id, { kind: 'workflow', businessId: business.id, chartId: chart.id }, reason)
        entries.push({
          kind: 'workflow',
          businessId: business.id,
          chartId: chart.id,
          title: chart.descriptorError ? chart.id : chart.name,
          href: `/specdev-workbench/read/${encodeURIComponent(business.id)}/${encodeURIComponent(chart.id)}`,
        })
      }
    }
    businesses.push({ businessId: business.id, businessName: business.name, spaceId: room.spaceId, entries })
  }
  return { problems, catalog: { mode: 'room-directory', businesses } }
}

/** 覆盖核对（纯函数）：已绑房间的业务，其每份资料（每条文档与每张图）都必须至少有一个阅读入口。
 *  目录入口由 buildReadingCatalog 默认全量装配；核对独立存在，装配逻辑漂移或入口被关闭时在这里现形。
 *  没绑到房间的业务不在这里重复报——那是 BUSINESS_MISSING 的事，不叠资料噪音。 */
export function checkCatalogCoverage(
  inventory: Inventory,
  catalog: BuildingBinding['catalog'],
  boundBusinessIds: ReadonlySet<string> = new Set(catalog.businesses.map((b) => b.businessId)),
): BuildingBindingProblem[] {
  const problems: BuildingBindingProblem[] = []
  const covered = new Set<string>()
  for (const business of catalog.businesses) {
    for (const entry of business.entries) covered.add(materialKey(entry))
  }
  for (const business of inventory.businesses) {
    if (!boundBusinessIds.has(business.id)) continue
    for (const docPath of business.docs) {
      const key = `doc:${business.id}:${docPath}`
      if (!covered.has(key)) {
        problems.push({
          code: 'MATERIAL_NO_ENTRY',
          severity: 'error',
          message: `业务 ${business.id} 的文档 ${docPath} 没有任何阅读入口；每个业务的文档与流程图都必须可以从房内资料目录访问。`,
          subject: { path: '/spaces', ids: [business.id] },
          evidence: { kind: 'document', businessId: business.id, path: docPath },
        })
      }
    }
    for (const chart of business.charts) {
      const key = `chart:${business.id}:${chart.id}`
      if (!covered.has(key)) {
        problems.push({
          code: 'MATERIAL_NO_ENTRY',
          severity: 'error',
          message: `业务 ${business.id} 的图 ${chart.id} 没有任何阅读入口；每个业务的文档与流程图都必须可以从房内资料目录访问。`,
          subject: { path: '/spaces', ids: [business.id] },
          evidence: { kind: 'workflow', businessId: business.id, chartId: chart.id },
        })
      }
    }
  }
  return problems
}

/** 一次完整核对与生成：读清单与蓝图 → 业务绑定核对 → 装配资料目录 → 覆盖核对 →
 *  （绑定与资料全过后）几何生成。清单/蓝图读不了（缺约定根、坏 JSON 等）抛 CoreError；
 *  核对不通过不抛，返回 problems（ok=false）。项目与业务身份、介绍来自清单（sources
 *  注入生成器）；几何有 error 级诊断时同样 ok=false 且 model=null，不交付不完整模型；
 *  warning 级诊断（楼梯舒适度、无屋顶建议）并入 problems 只作提示。 */
export async function readBuildingBinding(repoRoot: string): Promise<BuildingBinding> {
  const inventory = await readInventory(repoRoot)
  const blueprint = await readBuildingBlueprint(repoRoot)
  const binding = checkBusinessBinding(inventory, blueprint)
  const built = await buildReadingCatalog(repoRoot, inventory, binding.rooms)
  const coverage = checkCatalogCoverage(inventory, built.catalog)
  const problems: BuildingBindingProblem[] = [...binding.problems, ...built.problems, ...coverage]
  let model: HouseModel | null = null
  if (problems.every((p) => p.severity !== 'error')) {
    const sources: HouseSources = {
      project: { name: inventory.project.name, description: inventory.project.description },
      businesses: inventory.businesses.map((b) => ({ id: b.id, name: b.name, intro: b.intro })),
    }
    const generation = generateBuilding(blueprint, sources)
    problems.push(
      ...generation.diagnostics.map(
        (d): BuildingBindingProblem => ({
          code: d.code,
          severity: d.severity,
          message: d.message,
          subject: d.subject,
          evidence: d.evidence ?? {},
        }),
      ),
    )
    if (generation.ok) model = generation.model
  }
  return {
    ok: problems.every((p) => p.severity !== 'error'),
    blueprintPath: BUILDING_BLUEPRINT_REL,
    rooms: binding.rooms,
    catalog: built.catalog,
    problems,
    model,
  }
}

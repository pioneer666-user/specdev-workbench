// 领域类型（第一批：目录与阅读）。

/** 约定根（D2 裁定：第一版只认这一种组织方式）。 */
export const CONVENTION_ROOT = 'docs/specdev'

/** 说明文件 schema 取值（首批均为 /1，统一 specdev 前缀）。 */
export const SCHEMA = {
  project: 'specdev/project/1',
  business: 'specdev/business/1',
  chart: 'specdev/chart/1',
  evidence: 'specdev/evidence/1',
  snapshot: 'specdev/snapshot/1',
} as const
/** 新类型单独命名空间，原SCHEMA五键公开对象保持不变。 */
export const TYPED_SCHEMA = { chart: 'specdev/chart/2', snapshot: 'specdev/snapshot/2' } as const

export type SnapshotStage = 'design' | 'implemented'

export interface ProjectInfo {
  schema: string
  name: string
  description?: string
}

export interface BusinessInfo {
  schema: string
  id: string
  name: string
  intro?: string
  /** 业务文档的仓库相对路径数组；文档留在原位，只引用不复制。 */
  docs?: string[]
}

export interface ChartInfo {
  schema: string
  id: string
  name: string
  summary?: string
  diagramType?: 'workflow' | 'lifecycle'
}

/** 校验通过的快照（附注标签剥壳后的登记记录）。 */
export interface SnapshotEntry {
  /** 标签全名，形如 specdev/<图编号>/<版本标识>。 */
  tag: string
  /** 版本标识（标签名第三段起）。 */
  version: string
  /** 图稳定编号（= 标签名第二段 = 图目录名）。 */
  chart: string
  /** 标签剥壳后指向的提交号（40 位十六进制）。 */
  commit: string
  /** 标签创建时间（for-each-ref 的 iso8601-strict）。 */
  createdDate: string
  /** 标签 message 里的元数据（已通过 §2.4 五项校验）。 */
  meta: SnapshotMeta
}

interface SnapshotMetaBase {
  chart: string
  name: string
  stage: SnapshotStage
  note?: string
  dir: string
  savedAt?: string
}
export type SnapshotMeta = SnapshotMetaBase & (
  { schema: 'specdev/snapshot/1' } |
  { schema: 'specdev/snapshot/2'; diagramType: 'lifecycle'; sourceFile: 'lifecycle.json'; fingerprintScheme: typeof import('./chart-files.ts').LIFECYCLE_FINGERPRINT_SCHEME }
)

/** 一张图的快照清单（无效标签跳过并计数，绝不当作快照）。 */
export interface ChartSnapshots {
  snapshots: SnapshotEntry[]
  invalidCount: number
  /** 无效标签名样本（最多 5 条），页面提示用。 */
  invalidSamples: string[]
}

/** 保存前检查结果（保存功能 (a)）：ok = 三个数据文件与最近一次提交逐文件一致（换行归一后比）。 */
export interface SaveCheck {
  /** HEAD 提交号；null = 仓库还没有任何提交。 */
  head: string | null
  ok: boolean
  /** ok=false 的原因（逐文件，直接上页面）。 */
  problems: string[]
  /** HEAD 上三个文件（换行归一后）的内容摘要；页面拿它核对"我正看的就是将要保存的"；读不开时为 null。 */
  fingerprint: string | null
}

/** 保存请求的登记信息（核心层校验后使用：名称必填 ≤200 字、阶段二选一、说明可选 ≤1000 字）。 */
export interface SaveChartInput {
  name: string
  stage: SnapshotStage
  note?: string
}

/** 保存结果：新存的快照，或重复识别命中的已有那份（alreadySaved=true，未新增标签）。 */
export interface SaveChartResult {
  snapshot: SnapshotEntry
  alreadySaved: boolean
}

/**
 * 'compare-failed'：工作区与最新快照的比较本身失败（如文件超过读取上限）——
 * 不是没有快照，也不是已改动；单独成态，逐图隔离，不拖累清单里其他图。
 */
export type ChartCurrentStatus = 'no-snapshot' | 'identical' | 'changed' | 'compare-failed'

export interface ChartSummary {
  id: string
  name: string
  summary?: string
  /** 说明文件缺失/不合法时的问题描述；存在则页面标记"说明文件缺失"并跳过展开。 */
  descriptorError?: string
  /** 图编号在多个业务下重复（评审 #1）：快照标签按编号归组、无法区分归属，该图阅读已停用。 */
  idConflict?: string
  /** 工作区是否有 workflow.json（没有则该图明确报错，不给空白页）。 */
  hasWorkflow: boolean
  diagramType?: 'workflow' | 'lifecycle'
  hasSource?: boolean
  readingUnavailable?: string
  snapshotCount: number
  invalidTagCount: number
  currentStatus: ChartCurrentStatus
  /** currentStatus='compare-failed' 时的原因（页面悬停可见）。 */
  compareError?: string
  latestSnapshot?: {
    tag: string
    name: string
    stage: SnapshotStage
    savedAt?: string
    createdDate: string
  }
}

export interface BusinessSummary {
  id: string
  name: string
  intro?: string
  docs: string[]
  descriptorError?: string
  charts: ChartSummary[]
}

export interface Inventory {
  project: ProjectInfo
  businesses: BusinessSummary[]
}

/** 图目录下的三个数据文件（缺哪个由调用方按 §3.5 降级）。 */
export interface ChartFiles {
  workflow: string | null
  details: string | null
  evidence: string | null
  /** 仅 typed lifecycle 使用；旧公开三文件结构不增伪 workflow 内容。 */
  descriptor?: string | null
  lifecycle?: string | null
}

/** 阅读页一屏所需的全部数据（API /specdev-workbench/api/chart 的返回体）。 */
export interface ChartPageData {
  diagramType?: 'workflow' | 'lifecycle'
  readingUnavailable?: string
  renderer?: 'legacy' | '3.0.1' | null
  rendererError?: string
  business: { id: string; name: string }
  chart: { id: string; name: string; summary?: string }
  snapshots: ChartSnapshots
  /** 当前工作区与最新快照的比较结果（服务端算）。 */
  currentStatus: ChartCurrentStatus
  /** currentStatus='compare-failed' 时的原因（页面悬停可见）。 */
  compareError?: string
  /**
   * v=current 时本次读出来的工作区内容摘要（与保存检查同一个规则算）。
   * 保存弹层打开时拿它与检查结果里的摘要一比，就知道页面是不是已经旧了；
   * 快照版本、或任一文件读不开时为 null（没有可比对的一份内容，页面据此不给自查）。
   */
  currentFingerprint?: string | null
  version: {
    kind: 'current' | 'snapshot'
    /** kind=snapshot 时的标签名。 */
    tag?: string
    /** kind=snapshot 时标签指向的提交号。 */
    commit?: string
    /** 快照登记的显示名/阶段（来自标签元数据）。 */
    label?: string
    stage?: SnapshotStage
    /** 快照登记的保存说明与保存时间（§3.2 要求展示）。 */
    note?: string
    savedAt?: string
    files: ChartFiles
    diagramType?: 'workflow' | 'lifecycle'
    sourceFile?: 'workflow.json' | 'lifecycle.json'
    sourceError?: string
    /** workflow.json 不可读的明确错误（图不可读，不是空白页）；kind 区分"缺失"与"读不开"。 */
    workflowError?: string
    workflowErrorKind?: 'missing' | 'unreadable'
    /** details.md / evidence.json 读不开的原因（与"没有该文件"区分，页面如实说明）。 */
    detailsError?: string
    evidenceError?: string
  }
}

// ── 建筑蓝图绑定（迁移第一期：项目清单与蓝图的完整性核对）──────────────
// 项目清单是内容依据（业务、文档、图都来自 docs/specdev/ 的登记），
// 建筑 JSON 是空间安排；换布局不能删减项目业务。几何字段归后续生成器，本层只管绑定。

/** 蓝图在业务仓库中的位置（约定根，与 project.json 平级；inventory 扫描只看目录，不受影响）。 */
export const BUILDING_BLUEPRINT_REL = `${CONVENTION_ROOT}/building.json`

/** 插件版蓝图格式头（沿用实验的 archify-house 房形，schema 换插件契约号）。 */
export const BUILDING_FORMAT = 'specdev-building'
export const BUILDING_SCHEMA = 'specdev/building/1'

/** 蓝图里的一个空间（绑定核对只读这几个字段，几何字段原样透传）。 */
export interface BuildingSpaceInput {
  id: string
  name?: string
  kind?: string
  floorId?: string
  /** 仅 room 有意义：绑定项目清单里的业务 id。 */
  businessId?: string
  /** 房内资料目录入口开关；缺省视为 true（该房间提供本业务全部资料的阅读入口）。 */
  directory?: boolean
}

/** 核对通过后的一间业务房：清单身份与蓝图身份的对应。 */
export interface BuildingRoomBinding {
  spaceId: string
  spaceName?: string
  floorId?: string
  businessId: string
  businessName: string
  /** 资料目录入口是否开在本房间。 */
  directory: boolean
}

/** 资料目录条目：身份明确（文档＝登记过的仓库相对路径，流程图＝业务 id＋图 id），不依赖标题或序号。 */
export interface CatalogEntry {
  kind: 'document' | 'workflow' | 'chart'
  diagramType?: 'workflow' | 'lifecycle'
  businessId: string
  /** kind=document：business.json 的 docs 里登记的仓库相对路径。 */
  path?: string
  /** kind=workflow：图稳定编号（= 图目录名）。 */
  chartId?: string
  /** 显示名（文档取路径、图取登记名），仅供展示，不参与身份。 */
  title: string
  /** 阅读链接（不含 workspace 参数，由页面侧 wsUrl 补，与本插件既有口径一致）。 */
  href: string
}

/** 一个业务的资料目录（挂在它的房间里）。 */
export interface BusinessCatalog {
  businessId: string
  businessName: string
  spaceId: string
  entries: CatalogEntry[]
}

/** 生成器问题码（输入形状与几何检查，自实验迁入）。warning 级（楼梯舒适度、无屋顶建议）
 *  只提示不阻塞模型交付；本联合与绑定层 code 合并为 BuildingProblemCode。 */
export type HouseProblemCode =
  | 'INPUT_TYPE'
  | 'INPUT_ENUM'
  | 'INPUT_PATTERN'
  | 'INPUT_EMPTY'
  | 'INPUT_UNKNOWN_FIELD'
  | 'INPUT_REQUIRED'
  | 'DEFAULT_RANGE'
  | 'EMPTY_BUILDING'
  | 'INPUT_LIMIT'
  | 'ID_DUPLICATE'
  | 'STATE_EVIDENCE_REQUIRED'
  | 'STATE_CONTRADICTION'
  | 'FLOOR_REF'
  | 'FLOOR_RANGE'
  | 'SPACE_DIMENSION'
  | 'SPACE_HEIGHT'
  | 'SPACE_OVERLAP'
  | 'FLOOR_CLEARANCE'
  | 'SPACE_UNREACHABLE'
  | 'ENTRY_POSITION'
  | 'SHARED_WALL_CONFLICT'
  | 'ACCEPTANCE_INCOMPLETE'
  | 'BUSINESS_REQUIRED'
  | 'OPENING_ROOM'
  | 'OPENING_SIZE'
  | 'DOOR_CONNECTION'
  | 'WINDOW_CONNECTION'
  | 'OPENING_PARTITION'
  | 'OPENING_OVERLAP'
  | 'STAIR_FLOORS'
  | 'STAIR_ENDPOINT_KIND'
  | 'STAIR_GEOMETRY'
  | 'STAIR_LANDING'
  | 'STAIR_SPACE_INTERSECTION'
  | 'STAIR_INTERSECTION'
  | 'STAIR_COMFORT'
  | 'ROOF_REFS'
  | 'ROOF_RECTANGLE'
  | 'ROOF_SIZE'
  | 'ROOF_UPPER_FLOOR'
  | 'ROOF_INTERSECTION'
  | 'ROOF_MISSING'

/** 绑定核对问题：code 稳定、message 可直接上页面；path 按空间 id 定位蓝图字段
 *  （如 /spaces/<空间id>/businessId，比数组序号稳定——换布局增删房间后指针仍有指向）。 */
export interface BuildingBindingProblem {
  code: BuildingProblemCode
  /** warning 只提示（如楼梯舒适度、无屋顶建议），不让核对失败。 */
  severity: 'error' | 'warning'
  message: string
  subject: { path: string; ids: string[] }
  evidence?: Record<string, unknown>
}

/** 核对问题码全集：绑定层（清单 ↔ 蓝图）＋生成器（输入形状与几何）。 */
export type BuildingProblemCode =
  | 'BLUEPRINT_SHAPE'
  | 'BUSINESS_REQUIRED'
  | 'BUSINESS_NOT_ROOM'
  | 'BUSINESS_UNKNOWN'
  | 'BUSINESS_DUPLICATE'
  | 'BUSINESS_MISSING'
  | 'MATERIAL_NO_ENTRY'
  | 'MATERIAL_UNREADABLE'
  | HouseProblemCode

/** 蓝图绑定核对结果（readBuildingBinding 的返回体核心）。 */
export interface BuildingBinding {
  ok: boolean
  blueprintPath: string
  rooms: BuildingRoomBinding[]
  catalog: { mode: 'room-directory'; businesses: BusinessCatalog[] }
  problems: BuildingBindingProblem[]
  /** 绑定与几何全部通过（无 error 级问题）时才有：可直接渲染的建筑模型；否则为 null，
   *  不交付不完整模型。 */
  model: HouseModel | null
}

// ── 建筑模型（纯生成器，自实验 2026-09-23-json房子生成器 迁入）──────────────
// generateBuilding 是不读文件、不使用随机数的纯函数：蓝图（空间安排）＋清单内容
// （sources 注入项目与业务身份、介绍）→ 可序列化模型。与实验版 experiment-1 的差异：
// 蓝图不再携带 project / materials / displays / intro——资料目录由绑定层按清单装配，
// 项目与业务介绍也来自清单（几何字段两版同构）。

/** 建造阶段词汇表（construction.phase）：记录作者决定的展示进度，
 *  不因格式检查通过而自动推进。 */
export type HousePhase = 'design' | 'foundation' | 'structure' | 'enclosure' | 'services' | 'interior' | 'accepted'

export interface HouseBuildStatus {
  design: 'concept' | 'detailed'
  approval: 'pending' | 'approved'
  implementation: 'absent' | 'unknown' | 'present'
  tests: 'pending' | 'passed'
  acceptance: 'pending' | 'passed'
  evidence: { implementation?: string; tests?: string; acceptance?: string }
}

export interface HousePoint {
  x: number
  y: number
  z: number
}

export interface HouseFootprint {
  x0: number
  x1: number
  z0: number
  z1: number
}

export interface HouseFloor {
  id: string
  name: string
  /** 楼板上表面标高（elevation 的别名，模型统一用 y）。 */
  elevation: number
  /** 本层默认墙高（空间可用 height 覆盖）。 */
  height: number
  y: number
}

/** 模型里的空间：蓝图空间经标高、墙高、默认色与清单身份解析后的产物。
 *  room 的 name/intro 来自清单（sources 注入）；其余空间的 name 来自蓝图。 */
export interface HouseSpace {
  id: string
  name: string
  kind: 'room' | 'corridor' | 'terrace' | 'yard'
  floorId: string
  rect: { x: number; z: number; width: number; depth: number }
  businessId?: string
  /** 房内资料目录开关（绑定层语义，透传给页面）。 */
  directory?: boolean
  /** 业务介绍（清单 intro 注入；门牌副标题用）。 */
  intro?: string
  y: number
  height: number
  bounds: HouseFootprint
  prototype: string
  wallType: string
  accent: string
  status: HouseBuildStatus
}

export interface HouseOpening {
  id: string
  kind: 'door' | 'window'
  spaceId: string
  side: 'north' | 'south' | 'east' | 'west'
  offset: number
  width: number
  height: number
  sill: number
  to?: string
  axis: 'x' | 'z'
  at: number
  lo: number
  hi: number
  center: number
  y: number
  floorId: string
  wallId: string
  position: { x: number; y: number; z: number }
  /** 墙面朝向（sideOf 派生；门牌摆放用）。 */
  normal: { x: number; y: number; z: number }
}

export interface HouseWallSegment {
  id: string
  position: HousePoint
  size: { x: number; y: number; z: number }
}

/** 一段墙（可能由多个房间共墙归并而来）：按洞口剖分后的实体段在 segments。 */
export interface HouseWall {
  id: string
  axis: 'x' | 'z'
  at: number
  lo: number
  hi: number
  y: number
  height: number
  floorId: string
  wallType: string
  spaceIds: string[]
  openings: HouseOpening[]
  segments: HouseWallSegment[]
}

export interface HouseStair {
  id: string
  from: { spaceId: string; x: number; y: number; z: number }
  to: { spaceId: string; x: number; y: number; z: number }
  width: number
  steps: number
  bounds: HouseFootprint
  length: number
  rise: number
  ux: number
  uz: number
}

export interface HouseRoof {
  id: string
  spaceIds: string[]
  type: 'flat' | 'gable'
  rise: number
  overhang: number
  bounds: HouseFootprint
  base: number
  floorId: string
}

/** 层间结构区域：下层墙顶到紧邻上层楼板底之间真实重叠的投影区（修复贯通缝；
 *  不跨空层、不补没有上层空间的天空、不封梯井）。 */
export interface HouseFloorJoint {
  id: string
  lowerSpaceId: string
  upperSpaceId: string
  lowerFloorId: string
  upperFloorId: string
  y0: number
  y1: number
  upperY: number
  bounds: HouseFootprint
}

/** 门牌与项目牌（从模型数据派生，渲染器直接摆放）。 */
export interface HouseSign {
  id: string
  title: string
  subtitle?: string
  position: HousePoint
  normal: { x: number; y: number; z: number }
  spaceId?: string
  floorId?: string
}

/** 建筑模型（generateBuilding 的产物，可序列化；Three.js 页面只消费它，核心不依赖它）。 */
export interface HouseModel {
  format: 'specdev-building-model'
  generator: string
  project: { name: string; description?: string }
  style: string
  defaults: { wallThickness: number; slabThickness: number; doorHeight: number }
  construction: { phase: HousePhase; status: HouseBuildStatus }
  floors: HouseFloor[]
  spaces: HouseSpace[]
  rooms: HouseSpace[]
  walls: HouseWall[]
  doors: HouseOpening[]
  openings: HouseOpening[]
  stairs: HouseStair[]
  roofs: HouseRoof[]
  floorJoints: HouseFloorJoint[]
  signs: HouseSign[]
  entry: { spaceId: string; x: number; y: number; z: number }
  bounds: HouseFootprint & { y0: number; y1: number }
  navigation: {
    nodes: { id: string; x: number; y: number; z: number }[]
    edges: { from: string; to: string; kind: 'open' | 'door' | 'stair'; via: string | null }[]
  }
  diagnostics: HouseDiagnostic[]
}

export interface HouseDiagnostic {
  code: HouseProblemCode
  severity: 'error' | 'warning'
  message: string
  subject: { path: string; ids: string[] }
  evidence?: Record<string, unknown>
}

/** presentBuilding 的一个构件：轴对齐方盒（旋转仅屋顶坡板），渲染器不另算几何。 */
export interface HousePart {
  id: string
  kind: string
  position: HousePoint
  size: { x: number; y: number; z: number }
  color: string
  opacity: number
  solid: boolean
  spaceIds: string[]
  rotation?: { x: number; y: number; z: number }
}

/** 建造表现：parts 按当前阶段（construction.phase）生成"设计框架"，
 *  preview=true 时无视阶段给"完整外观预览"；colliders 为实心盒 AABB，surfaces 为行走面。 */
export interface HousePresentation {
  parts: HousePart[]
  colliders: { id: string; x0: number; x1: number; y0: number; y1: number; z0: number; z1: number }[]
  surfaces: (
    | { id: string; kind: 'flat'; bounds: HouseFootprint; y: number; spaceId: string }
    | {
        id: string
        kind: 'stair'
        bounds: HouseFootprint
        from: HousePoint
        to: HousePoint
        ux: number
        uz: number
        length: number
        rise: number
        width: number
      }
  )[]
}

/** 清单内容注入（building.ts 从项目清单组装）：项目与业务身份、介绍来自清单，
 *  蓝图只管空间安排——同一蓝图换项目清单，模型里的名字与介绍随之换。 */
export interface HouseSourceBusiness {
  id: string
  name: string
  intro?: string
}

export interface HouseSources {
  project: { name: string; description?: string }
  businesses: readonly HouseSourceBusiness[]
}

/** generateBuilding 的返回：有 error 级诊断时 ok=false 且不产出模型。 */
export type HouseGeneration =
  | { ok: true; model: HouseModel; diagnostics: HouseDiagnostic[] }
  | { ok: false; model: null; diagnostics: HouseDiagnostic[] }

/** evidence.json 一条引用的解析结果：要么切片成功，要么明确报错。 */
export type EvidenceRefResult =
  | {
      ok: true
      id: string
      label: string
      repo: string
      commit: string
      path: string
      fromLine: number
      toLine: number
      lineCount: number
      text: string
    }
  | {
      ok: false
      id: string
      label: string
      error: string
    }

export interface EvidenceResult {
  /** evidence.json 文件本身缺失（→"尚未配置证据文件"）。 */
  missing: boolean
  /** 文件存在但不是合法 JSON / refs 不是数组（→整文件级错误）。 */
  parseError?: string
  refs: EvidenceRefResult[]
}

// ── 独立业务房间（P1b-1：配置读取与身份绑定）────────────────────────
// room.json 固定放在 <项目根>/<CONVENTION_ROOT>/<businessId>/room.json；根目录由
// 工作区绑定解析，不由请求传路径。读取层只管"读得到、归属对、顶层结构对"；
// 实例内部结构、模板与家具边界仍归 web/assets/rooms/placement.js（页面先校验再渲染）。

/** room.json 顶层：五个必填字段（读取层逐项核对；空 instances＝空房间）＋可选 bindings。 */
export interface RoomLayoutFile {
  schemaVersion: number
  /** 房间 ID，符合插件 ID 规则；由配置作者分配，业务改显示名或挪家具时保持。 */
  roomId: string
  /** 归属业务 ID，必须与请求的业务一致（读取层核对，不静默改成请求值）。 */
  businessId: string
  /** 模板引用（非空字符串；是否存在由 placement 模块校验）。 */
  templateRef: string
  /** 家具实例数组，原样透传给 validatePlacement；本层不校验内部、不假称已校验。 */
  instances: unknown[]
  /** 家具资料绑定（E3a 可选）：读取层只确认它是数组并原样透传，条目合法性由
   *  web/assets/rooms/bindings.js 在页面侧校验——unknown[] 表示内部尚待校验。 */
  bindings?: unknown[]
}

/** readRoomLayout 返回的 business.charts 单图投影（E9c）：只带房间资料链需要的字段，
 *  不含快照计数等清单页专用数据；来自既有 inventory 扫描结果，不新开扫描器或 API。
 *  business.json 没有 charts 登记数组——图由业务目录内 chart.json/workflow.json 等
 *  按既有规则扫描；hasWorkflow=false 仅表示文件不存在，绑定仍允许，缺图由阅读页/CLI 说明。 */
export interface RoomChartSummary {
  diagramType?: 'workflow' | 'lifecycle'
  readingUnavailable?: string
  id: string
  name: string
  summary?: string
  /** 说明文件缺失/不合法时的既有问题描述（保留图身份，页面/CLI 显示原因）。 */
  descriptorError?: string
  /** 图编号在多个业务下重复（既有清单规则，不放宽）。 */
  idConflict?: string
  hasWorkflow: boolean
}

/** readRoomLayout 的返回（/api/room 响应的核心部分）。
 *  读取成功只代表配置已读取且归属/顶层结构有效，不代表家具布置通过校验。 */
export interface RoomLayoutRead {
  business: { id: string; name: string; intro?: string; docs: string[]; charts: RoomChartSummary[] }
  /** room.json 解析出的原始对象（五个字段）。 */
  layout: RoomLayoutFile
  source: { path: string }
}

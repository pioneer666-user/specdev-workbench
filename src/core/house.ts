// 纯数据生成器（自实验 experiments/2026-09-23-json房子生成器/generator.mjs 迁入并对齐插件契约）：
// 蓝图（空间安排）＋清单内容（sources）→ 可序列化建筑模型。不读文件、不用 DOM、
// 不使用随机数、不依赖 Three.js / DSH / 浏览器——插件运行与正式测试不依赖实验目录。
// 与实验版 experiment-1 的契约差异：schema 换 specdev/building/1；蓝图不再携带
// project / materials / displays / intro——项目与业务身份、介绍由绑定层从项目清单注入
// （sources），资料目录由绑定层装配；诊断 path 按对象 id 定位（/spaces/<id>/rect），
// 换布局增删条目后指针仍有指向。几何字段与几何行为两版同构（门共边、共墙归并、
// 层间连接、屋顶包络、楼梯净空、可达性），均已由实验验证。
import {
  BUILDING_FORMAT,
  BUILDING_SCHEMA,
  type HouseBuildStatus,
  type HouseDiagnostic,
  type HouseFootprint,
  type HouseGeneration,
  type HouseModel,
  type HouseOpening,
  type HousePart,
  type HousePhase,
  type HousePoint,
  type HousePresentation,
  type HouseProblemCode,
  type HouseRoof,
  type HouseSign,
  type HouseSources,
  type HouseSpace,
  type HouseStair,
  type HouseWall,
} from './types.ts'

/** 建造阶段顺序（construction.phase 的词汇表）。 */
export const PHASES: readonly HousePhase[] = [
  'design',
  'foundation',
  'structure',
  'enclosure',
  'services',
  'interior',
  'accepted',
]

/** 空间原型与默认色（只影响色调与页面类型标签，不生成家具、不决定房间数）。 */
export const PROTOTYPES: Readonly<Record<string, string>> = {
  foyer: '#708c79',
  studio: '#4e8586',
  archive: '#9a8963',
  review: '#ab7966',
  observatory: '#728ba9',
}

const EPS = 1e-6
/** 门牌离墙面留的余量（米）：洞口边框（门楣／门柱）比墙面还要外扩 0.045／2＝0.0225，
 *  牌子得整块落在它外面再留一点缝，否则完整外观下射线先命中边框或墙面、牌子点不开。 */
const SIGN_CLEARANCE = 0.07
const round = (n: number): number => Math.round(n * 1e6) / 1e6
const eq = (a: number, b: number): boolean => Math.abs(a - b) < EPS
const positiveOverlap = (a: number, b: number, c: number, d: number): boolean => Math.min(b, d) - Math.max(a, c) > EPS
const overlap = (a: HouseFootprint, b: HouseFootprint): boolean =>
  positiveOverlap(a.x0, a.x1, b.x0, b.x1) && positiveOverlap(a.z0, a.z1, b.z0, b.z1)
const inside = (b: HouseFootprint, p: { x: number; z: number }, margin = 0): boolean =>
  p.x >= b.x0 + margin - EPS && p.x <= b.x1 - margin + EPS && p.z >= b.z0 + margin - EPS && p.z <= b.z1 - margin + EPS
/** 按 id 稳定排序：相同输入产生相同模型（输出顺序不依赖蓝图里的书写顺序）。 */
const sorted = <T extends { id: string }>(xs: readonly T[]): T[] =>
  [...xs].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
const sides = ['north', 'south', 'east', 'west'] as const
type Side = (typeof sides)[number]

const boxRect = (r: { x: number; z: number; width: number; depth: number }): HouseFootprint => ({
  x0: round(r.x - r.width / 2),
  x1: round(r.x + r.width / 2),
  z0: round(r.z - r.depth / 2),
  z1: round(r.z + r.depth / 2),
})
const boundsOf = (bs: readonly HouseFootprint[]): HouseFootprint => ({
  x0: Math.min(...bs.map((b) => b.x0)),
  x1: Math.max(...bs.map((b) => b.x1)),
  z0: Math.min(...bs.map((b) => b.z0)),
  z1: Math.max(...bs.map((b) => b.z1)),
})

const DEFAULT_STATUS: HouseBuildStatus = {
  design: 'detailed',
  approval: 'pending',
  implementation: 'unknown',
  tests: 'pending',
  acceptance: 'pending',
  evidence: {},
}

// ── 输入形状规则（未知字段、非法值报错，不静默忽略拼错的字段）──────────────────

type ShapeRule =
  | { type: 'string'; enum?: readonly string[]; pattern?: RegExp }
  | { type: 'number' }
  | { type: 'boolean' }
  | { type: 'object'; props: Record<string, ShapeRule>; required: readonly string[] }
  | { type: 'array'; item: ShapeRule }

const S: ShapeRule = { type: 'string' }
const N: ShapeRule = { type: 'number' }
const B: ShapeRule = { type: 'boolean' }
const enumeration = (values: readonly string[]): ShapeRule => ({ type: 'string', enum: values })
const object = (props: Record<string, ShapeRule>, required: readonly string[] = Object.keys(props)): ShapeRule => ({
  type: 'object',
  props,
  required,
})
const array = (item: ShapeRule): ShapeRule => ({ type: 'array', item })
/** 建筑自身编号（楼层、空间、开口、楼梯、屋顶）：小写字母开头，小写字母/数字/连字符。 */
const idRule: ShapeRule = { type: 'string', pattern: /^[a-z][a-z0-9-]*$/ }
/** 业务编号引用对齐插件阅读接口的既有 ID 规则（src/dsh/index.ts 的 ID_PATTERN：
 *  字母或数字开头，后续为字母/数字/点/下划线/连字符）——清单虽能扫描到中文等目录名，
 *  但文档与流程图阅读接口会拒绝它们；"建筑能生成、资料点不开"的状态在生成器这里拦下。 */
const businessIdRule: ShapeRule = { type: 'string', pattern: /^[A-Za-z0-9][A-Za-z0-9._-]*$/ }

const statusRule: ShapeRule = object({
  design: enumeration(['concept', 'detailed']),
  approval: enumeration(['pending', 'approved']),
  implementation: enumeration(['absent', 'unknown', 'present']),
  tests: enumeration(['pending', 'passed']),
  acceptance: enumeration(['pending', 'passed']),
  evidence: object({ implementation: S, tests: S, acceptance: S }, []),
})
const endpointRule: ShapeRule = object({ spaceId: idRule, x: N, z: N })

const blueprintRule: ShapeRule = object(
  {
    format: enumeration([BUILDING_FORMAT]),
    schema: enumeration([BUILDING_SCHEMA]),
    units: enumeration(['m']),
    style: enumeration(['warm-modern', 'chinese-timber']),
    defaults: object({ wallThickness: N, slabThickness: N, doorHeight: N }, []),
    floors: array(object({ id: idRule, name: S, elevation: N, height: N })),
    spaces: array(
      object(
        {
          id: idRule,
          name: S,
          kind: enumeration(['room', 'corridor', 'terrace', 'yard']),
          floorId: idRule,
          rect: object({ x: N, z: N, width: N, depth: N }),
          businessId: businessIdRule,
          directory: B,
          prototype: enumeration(Object.keys(PROTOTYPES)),
          height: N,
          accent: { type: 'string', pattern: /^#[a-fA-F0-9]{6}$/ },
          wallType: enumeration(['plaster', 'brick', 'timber']),
          status: statusRule,
        },
        ['id', 'kind', 'floorId', 'rect'],
      ),
    ),
    openings: array(
      object(
        {
          id: idRule,
          kind: enumeration(['door', 'window']),
          spaceId: idRule,
          side: enumeration(sides),
          offset: N,
          width: N,
          height: N,
          sill: N,
          to: idRule,
        },
        ['id', 'kind', 'spaceId', 'side', 'offset', 'width'],
      ),
    ),
    stairs: array(object({ id: idRule, from: endpointRule, to: endpointRule, width: N, steps: N })),
    roofs: array(
      object({ id: idRule, spaceIds: array(idRule), type: enumeration(['flat', 'gable']), rise: N, overhang: N }, [
        'id',
        'spaceIds',
        'type',
      ]),
    ),
    construction: object({ phase: enumeration(PHASES), status: statusRule }),
    entry: endpointRule,
  },
  ['format', 'schema', 'units', 'style', 'floors', 'spaces', 'entry'],
)

/** 校验后可信的蓝图形状（generateBuilding 内部使用）。 */
interface RawBlueprint {
  style: string
  defaults?: { wallThickness?: number; slabThickness?: number; doorHeight?: number }
  floors: { id: string; name: string; elevation: number; height: number }[]
  spaces: {
    id: string
    name?: string
    kind: 'room' | 'corridor' | 'terrace' | 'yard'
    floorId: string
    rect: { x: number; z: number; width: number; depth: number }
    businessId?: string
    directory?: boolean
    prototype?: string
    height?: number
    accent?: string
    wallType?: string
    status?: HouseBuildStatus
  }[]
  openings?: {
    id: string
    kind: 'door' | 'window'
    spaceId: string
    side: Side
    offset: number
    width: number
    height?: number
    sill?: number
    to?: string
  }[]
  stairs?: { id: string; from: { spaceId: string; x: number; z: number }; to: { spaceId: string; x: number; z: number }; width: number; steps: number }[]
  roofs?: { id: string; spaceIds: string[]; type: 'flat' | 'gable'; rise?: number; overhang?: number }[]
  construction?: { phase: HousePhase; status: HouseBuildStatus }
  entry: { spaceId: string; x: number; z: number }
}

function validateShape(value: unknown, rule: ShapeRule, path: string, report: Report): void {
  const type = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value
  if (type !== rule.type || (type === 'number' && !Number.isFinite(value as number))) {
    report('INPUT_TYPE', path, `需要 ${rule.type} 类型${rule.type === 'number' ? '的有限数值' : ''}。`)
    return
  }
  if (rule.type === 'string') {
    const text = value as string
    if (rule.enum && !rule.enum.includes(text)) report('INPUT_ENUM', path, `允许值：${rule.enum.join('、')}。`)
    if (rule.pattern && !rule.pattern.test(text)) report('INPUT_PATTERN', path, '格式不合法。')
    if (!text.trim()) report('INPUT_EMPTY', path, '内容不能为空。')
    return
  }
  if (rule.type === 'object') {
    const record = value as Record<string, unknown>
    for (const key of Object.keys(record)) {
      if (!Object.hasOwn(rule.props, key)) {
        report('INPUT_UNKNOWN_FIELD', `${path}/${key}`, '未定义的字段，请检查拼写或查阅契约。')
      } else {
        validateShape(record[key], rule.props[key], `${path}/${key}`, report)
      }
    }
    for (const key of rule.required) if (!Object.hasOwn(record, key)) report('INPUT_REQUIRED', `${path}/${key}`, '缺少必填字段。')
    return
  }
  if (rule.type === 'array') (value as unknown[]).forEach((item, i) => validateShape(item, rule.item, `${path}/${i}`, report))
}

type Report = (
  code: HouseProblemCode,
  path: string,
  message: string,
  ids?: readonly string[],
  evidence?: Record<string, unknown>,
  severity?: 'error' | 'warning',
) => void

/** 一面墙的几何参数（sideOf 的返回）。 */
export interface SideEdge {
  axis: 'x' | 'z'
  at: number
  lo: number
  hi: number
  center: number
  normal: { x: number; y: number; z: number }
}

export function sideOf(space: HouseSpace, side: Side): SideEdge {
  const b = space.bounds
  const alongX = side === 'north' || side === 'south'
  return {
    axis: alongX ? 'x' : 'z',
    at: side === 'north' ? b.z0 : side === 'south' ? b.z1 : side === 'west' ? b.x0 : b.x1,
    lo: alongX ? b.x0 : b.z0,
    hi: alongX ? b.x1 : b.z1,
    center: alongX ? space.rect.x : space.rect.z,
    normal: { x: side === 'west' ? 1 : side === 'east' ? -1 : 0, y: 0, z: side === 'north' ? 1 : side === 'south' ? -1 : 0 },
  }
}

function sharedEdge(a: HouseFootprint, b: HouseFootprint): { axis: 'x' | 'z'; at: number; lo: number; hi: number } | null {
  const x = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)
  const z = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0)
  if (x > EPS && (eq(a.z1, b.z0) || eq(a.z0, b.z1))) {
    return { axis: 'x', at: eq(a.z1, b.z0) ? a.z1 : a.z0, lo: Math.max(a.x0, b.x0), hi: Math.min(a.x1, b.x1) }
  }
  if (z > EPS && (eq(a.x1, b.x0) || eq(a.x0, b.x1))) {
    return { axis: 'z', at: eq(a.x1, b.x0) ? a.x1 : a.x0, lo: Math.max(a.z0, b.z0), hi: Math.min(a.z1, b.z1) }
  }
  return null
}

function inWallRange(edge: { lo: number; hi: number }, lo: number, hi: number): boolean {
  return lo >= edge.lo - EPS && hi <= edge.hi + EPS
}

function planeBox(
  axis: 'x' | 'z',
  at: number,
  lo: number,
  hi: number,
  y0: number,
  y1: number,
  thickness: number,
): { position: HousePoint; size: { x: number; y: number; z: number } } {
  return {
    position: { x: axis === 'x' ? (lo + hi) / 2 : at, y: (y0 + y1) / 2, z: axis === 'z' ? (lo + hi) / 2 : at },
    size: { x: axis === 'x' ? hi - lo : thickness, y: y1 - y0, z: axis === 'z' ? hi - lo : thickness },
  }
}

/**
 * 蓝图 → 建筑模型（纯函数）。相同输入与同版程序产生相同模型；输入不会被修改。
 * sources 注入项目与业务的清单身份（名字、介绍）；room 的显示名与介绍以清单为准。
 * 有 error 级诊断时 ok=false 且 model=null——不交付不完整模型。
 */
export function generateBuilding(input: unknown, sources: HouseSources): HouseGeneration {
  const diagnostics: HouseDiagnostic[] = []
  const report: Report = (code, path, message, ids = [], evidence = {}, severity = 'error') => {
    diagnostics.push({ code, severity, message, subject: { path, ids: [...ids] }, evidence })
  }
  const fail = (): HouseGeneration => ({ ok: false, model: null, diagnostics })
  const errors = (): boolean => diagnostics.some((d) => d.severity === 'error')

  // 形状校验只能按数组序号定位（此刻 id 还没注册）；这里按输入里的 id 只读改写，
  // 让诊断 path 与绑定层同口径。只探测不修改输入；顶层不是对象（null/数组等）时
  // 无从改写，保持序号。
  const rewriteIndexPaths = (source: unknown): void => {
    if (typeof source !== 'object' || source === null) return
    const record = source as Record<string, unknown>
    const idAt = (key: string, index: number): string | null => {
      const list = record[key]
      if (!Array.isArray(list)) return null
      const item = list[index]
      if (typeof item !== 'object' || item === null) return null
      const id = (item as { id?: unknown }).id
      return typeof id === 'string' ? id : null
    }
    for (const d of diagnostics) {
      d.subject.path = d.subject.path.replace(
        /^\/(floors|spaces|openings|stairs|roofs)\/(\d+)(?=\/|$)/,
        (full, key: string, index: string) => {
          const id = idAt(key, Number(index))
          return id !== null ? `/${key}/${id}` : full
        },
      )
    }
  }

  validateShape(input, blueprintRule, '', report)
  // 形状不过：立即安全返回约定的诊断（ok:false、model:null）——非法根值（null、
  // undefined、非对象）在 JSON 克隆或属性访问时会直接抛异常，必须在这里早退。
  // 数组序号路径按输入里的 id 只读改写（与绑定层同口径；元素缺 id 时保持序号）。
  if (errors()) {
    rewriteIndexPaths(input)
    return fail()
  }
  // JSON 克隆既防止修改调用者数据，也让输出没有输入对象共享引用。
  const data = JSON.parse(JSON.stringify(input)) as RawBlueprint
  const defaults = { wallThickness: 0.18, slabThickness: 0.18, doorHeight: 2.5, ...(data.defaults ?? {}) }
  const construction = data.construction ?? { phase: 'design' as HousePhase, status: structuredClone(DEFAULT_STATUS) }
  for (const [key, value] of Object.entries(defaults)) {
    if (!(value > 0 && value <= (key === 'doorHeight' ? 8 : 0.6))) {
      report('DEFAULT_RANGE', `/defaults/${key}`, '厚度应在 (0, 0.6] 米，门高应在 (0, 8] 米。')
    }
  }
  if (!data.floors.length || !data.spaces.length) report('EMPTY_BUILDING', '/spaces', '至少需要一层、一个空间。')
  // 规模边界防止意外输入占满资源；不是房型常量。
  if (data.spaces.length > 240 || data.floors.length > 24 || (data.openings ?? []).length > 2000) {
    report('INPUT_LIMIT', '/spaces', '本版支持最多 240 空间、24 层、2000 个开口。')
  }
  if ((data.stairs ?? []).length > 96 || (data.roofs ?? []).length > 240) {
    report('INPUT_LIMIT', '', '本版最多支持 96 跑楼梯和 240 个屋顶。')
  }
  if (errors()) return fail()

  // id 注册：诊断 path 按对象 id 定位（/spaces/<id>），比数组序号稳定。
  const paths = new Map<string, string>()
  const identities = new Map<string, string>()
  const register = (item: { id: string }, container: string): void => {
    const path = `${container}/${item.id}`
    if (identities.has(item.id)) {
      report('ID_DUPLICATE', `${path}/id`, 'id 在蓝图内重复。', [item.id], { duplicateOf: identities.get(item.id) })
    } else {
      identities.set(item.id, path)
      paths.set(item.id, path)
    }
  }
  for (const key of ['floors', 'spaces', 'openings', 'stairs', 'roofs'] as const) {
    for (const item of (data[key] ?? []) as { id: string }[]) register(item, `/${key}`)
  }
  const pathOf = (id: string): string => paths.get(id) ?? ''

  const checkStatus = (status: HouseBuildStatus, path: string, ids: readonly string[] = []): void => {
    for (const key of ['implementation', 'tests', 'acceptance'] as const) {
      if (status[key] === (key === 'implementation' ? 'present' : 'passed') && !(status.evidence[key] ?? '').trim()) {
        report('STATE_EVIDENCE_REQUIRED', `${path}/evidence/${key}`, '此声明必须有对应的证据出处。', ids)
      }
    }
    if ((status.tests === 'passed' || status.acceptance === 'passed') && status.implementation !== 'present') {
      report('STATE_CONTRADICTION', path, '未声明有实现，不能声称实现测试或作者验收已通过。', ids)
    }
    if (status.approval === 'approved' && status.design !== 'detailed') {
      report('STATE_CONTRADICTION', path, '本版只有详细设计才能登记批准。', ids)
    }
  }
  checkStatus(construction.status, '/construction/status')

  const floors = sorted(data.floors).map((f) => ({ ...f, y: f.elevation }))
  const floorMap = new Map(floors.map((f) => [f.id, f]))
  for (const f of floors) {
    if (f.height < 2.6 || f.height > 12 || Math.abs(f.y) > 500) {
      report('FLOOR_RANGE', pathOf(f.id), '楼层净高应在 2.6—12 米之间，标高绝对值不超过 500 米。', [f.id])
    }
  }

  // 清单身份注入：room 的显示名与介绍以清单为准（业务介绍来自项目清单）；
  // 清单里没有的业务 id 回落到蓝图 name / 业务 id（绑定核对另行报告未知业务）。
  const businessById = new Map(sources.businesses.map((b) => [b.id, b]))
  const spaces: HouseSpace[] = sorted(data.spaces).map((s) => {
    const path = pathOf(s.id)
    const f = floorMap.get(s.floorId)
    if (!f) report('FLOOR_REF', `${path}/floorId`, '楼层不存在。', [s.id, s.floorId])
    if (
      s.rect.width < 1.6 ||
      s.rect.depth < 1.6 ||
      s.rect.width > 200 ||
      s.rect.depth > 200 ||
      Math.abs(s.rect.x) > 1000 ||
      Math.abs(s.rect.z) > 1000
    ) {
      report('SPACE_DIMENSION', `${path}/rect`, '空间边长应为 1.6—200 米，坐标绝对值不超过 1000 米。', [s.id])
    }
    if (s.kind === 'room' && !s.businessId) report('BUSINESS_REQUIRED', `${path}/businessId`, '业务房需要稳定的业务 id。', [s.id])
    const height = s.height ?? f?.height ?? 3.4
    if (height < 2.6 || height > 12) report('SPACE_HEIGHT', `${path}/height`, '空间墙高应在 2.6—12 米之间。', [s.id])
    const status = s.status ?? structuredClone(construction.status)
    if (s.status) checkStatus(status, `${path}/status`, [s.id])
    if (
      construction.phase === 'accepted' &&
      s.kind === 'room' &&
      !(status.approval === 'approved' && status.implementation === 'present' && status.tests === 'passed' && status.acceptance === 'passed')
    ) {
      report('ACCEPTANCE_INCOMPLETE', `${path}/status`, '验收入住需要设计批准、实现、测试和作者验收记录齐备。', [s.id])
    }
    const source = s.businessId !== undefined ? businessById.get(s.businessId) : undefined
    const name =
      s.kind === 'room' ? (source?.name ?? s.name ?? s.businessId ?? s.id) : (s.name ?? s.id)
    return {
      ...s,
      name,
      intro: source?.intro,
      y: f?.y ?? 0,
      height,
      bounds: boxRect(s.rect),
      prototype: s.prototype ?? 'studio',
      wallType: s.wallType ?? 'plaster',
      accent: s.accent ?? PROTOTYPES[s.prototype ?? 'studio'],
      status,
    }
  })
  if (errors()) return fail()

  const spaceMap = new Map(spaces.map((s) => [s.id, s]))
  const rooms = spaces.filter((s) => s.kind === 'room')
  for (let i = 0; i < spaces.length; i++) {
    for (let j = i + 1; j < spaces.length; j++) {
      const a = spaces[i]
      const b = spaces[j]
      if (a.floorId === b.floorId && overlap(a.bounds, b.bounds)) {
        report('SPACE_OVERLAP', `${pathOf(b.id)}/rect`, '同层空间内部相交；共边可用，重叠不可用。', [a.id, b.id], {
          first: a.bounds,
          second: b.bounds,
        })
      }
      if (
        a.floorId !== b.floorId &&
        overlap(a.bounds, b.bounds) &&
        positiveOverlap(a.y, a.y + a.height + defaults.slabThickness, b.y, b.y + b.height + defaults.slabThickness)
      ) {
        report('FLOOR_CLEARANCE', pathOf(b.id), '上下空间净空或楼板相交，请调整标高或墙高。', [a.id, b.id])
      }
    }
  }
  const entrySpace = spaceMap.get(data.entry.spaceId)
  if (!entrySpace || !inside(entrySpace.bounds, data.entry, 0.35)) {
    report('ENTRY_POSITION', '/entry', '入口起点需位于已登记空间内，并与边缘保留 0.35 米。', [data.entry.spaceId])
  }
  const entry = { ...data.entry, y: entrySpace?.y ?? 0 }

  // 墙归并：同层同轴同坐标的墙线合并成段；共墙只生成一份，两侧高度与墙材必须一致。
  const lines = new Map<string, { axis: 'x' | 'z'; at: number; lo: number; hi: number; room: HouseSpace }[]>()
  for (const room of rooms) {
    for (const side of sides) {
      const edge = sideOf(room, side)
      const key = `${room.floorId}|${edge.axis}|${edge.at}`
      if (!lines.has(key)) lines.set(key, [])
      lines.get(key)!.push({ ...edge, room })
    }
  }
  const walls: HouseWall[] = []
  for (const [key, entries] of [...lines].sort(([a], [b]) => a.localeCompare(b, 'en'))) {
    const cuts = [...new Set(entries.flatMap((e) => [e.lo, e.hi]))].sort((a, b) => a - b)
    for (let i = 0; i < cuts.length - 1; i++) {
      const lo = cuts[i]
      const hi = cuts[i + 1]
      const owners = entries.filter((e) => e.lo < hi - EPS && e.hi > lo + EPS)
      if (!owners.length) continue
      const room = owners[0].room
      if (owners.some((e) => !eq(e.room.height, room.height) || e.room.wallType !== room.wallType)) {
        report('SHARED_WALL_CONFLICT', pathOf(room.id), '共墙房间必须使用相同墙高与墙材类型。', owners.map((e) => e.room.id))
      }
      walls.push({
        id: `wall:${key}:${lo}:${hi}`,
        axis: owners[0].axis,
        at: owners[0].at,
        lo,
        hi,
        y: room.y,
        height: room.height,
        floorId: room.floorId,
        wallType: room.wallType,
        spaceIds: owners.map((e) => e.room.id).sort(),
        openings: [],
        segments: [],
      })
    }
  }

  const openings: HouseOpening[] = []
  for (const o of sorted(data.openings ?? [])) {
    const room = spaceMap.get(o.spaceId)
    const path = pathOf(o.id)
    if (!room || room.kind !== 'room') {
      report('OPENING_ROOM', `${path}/spaceId`, '开口必须引用业务房。', [o.id, o.spaceId])
      continue
    }
    const edge = sideOf(room, o.side)
    const center = edge.center + o.offset
    const lo = center - o.width / 2
    const hi = center + o.width / 2
    const height = o.height ?? (o.kind === 'door' ? defaults.doorHeight : 1.2)
    const sill = o.sill ?? (o.kind === 'door' ? 0 : 1)
    if (
      o.width < (o.kind === 'door' ? 0.95 : 0.2) ||
      height < 0.2 ||
      (o.kind === 'door' && height < 2.2) ||
      sill < 0 ||
      sill + height > room.height - 0.12 ||
      !inWallRange({ lo: edge.lo + 0.2, hi: edge.hi - 0.2 }, lo, hi)
    ) {
      report('OPENING_SIZE', path, '开口尺寸或位置越界，门需至少宽 0.95、高 2.2 米，墙角至少留 0.2 米。', [o.id])
    }
    if (o.kind === 'door') {
      const target = o.to !== undefined ? spaceMap.get(o.to) : undefined
      const shared = target ? sharedEdge(room.bounds, target.bounds) : null
      if (
        sill !== 0 ||
        !target ||
        target.floorId !== room.floorId ||
        !shared ||
        shared.axis !== edge.axis ||
        !eq(shared.at, edge.at) ||
        !inWallRange(shared, lo, hi)
      ) {
        report('DOOR_CONNECTION', path, '门必须落在来源房间与 to 空间同层的共边上，且没有门槛。', [o.id, room.id, o.to ?? ''].filter(Boolean))
      }
    } else if (o.to !== undefined) {
      report('WINDOW_CONNECTION', `${path}/to`, '窗不能声明为可通行连接。', [o.id])
    }
    const wall = walls.find((w) => w.floorId === room.floorId && w.axis === edge.axis && eq(w.at, edge.at) && inWallRange(w, lo, hi))
    if (!wall) {
      report('OPENING_PARTITION', path, '开口跨越了共墙分区端点，请调整位置。', [o.id])
      continue
    }
    const value: HouseOpening = {
      ...o,
      axis: edge.axis,
      at: edge.at,
      lo,
      hi,
      center,
      height,
      sill,
      y: room.y,
      floorId: room.floorId,
      wallId: wall.id,
      position: { x: edge.axis === 'x' ? center : edge.at, y: room.y, z: edge.axis === 'z' ? center : edge.at },
      normal: edge.normal,
    }
    wall.openings.push(value)
    openings.push(value)
  }
  for (const wall of walls) {
    for (let i = 0; i < wall.openings.length; i++) {
      for (let j = i + 1; j < wall.openings.length; j++) {
        const a = wall.openings[i]
        const b = wall.openings[j]
        if (positiveOverlap(a.lo, a.hi, b.lo, b.hi) && positiveOverlap(a.sill, a.sill + a.height, b.sill, b.sill + b.height)) {
          report('OPENING_OVERLAP', pathOf(b.id), '同一墙面开口重叠；共墙的门只登记一次。', [a.id, b.id])
        }
      }
    }
    // 按洞口左右边界剖分，扣掉所有高度区间；门楣与窗台均来自同一算法。
    const cuts = [...new Set([wall.lo, wall.hi, ...wall.openings.flatMap((o) => [o.lo, o.hi])])].sort((a, b) => a - b)
    for (let i = 0; i < cuts.length - 1; i++) {
      const lo = cuts[i]
      const hi = cuts[i + 1]
      const active = wall.openings.filter((o) => positiveOverlap(lo, hi, o.lo, o.hi)).sort((a, b) => a.sill - b.sill)
      let bottom = 0
      for (const o of [...active, { sill: wall.height, height: 0 }]) {
        if (o.sill > bottom + EPS) {
          wall.segments.push({
            id: `${wall.id}:piece:${wall.segments.length}`,
            ...planeBox(wall.axis, wall.at, lo, hi, wall.y + bottom, wall.y + o.sill, defaults.wallThickness),
          })
        }
        bottom = Math.max(bottom, o.sill + o.height)
      }
    }
  }

  const stairs: HouseStair[] = []
  for (const s of sorted(data.stairs ?? [])) {
    const a = spaceMap.get(s.from.spaceId)
    const b = spaceMap.get(s.to.spaceId)
    const path = pathOf(s.id)
    if (!a || !b || a.floorId === b.floorId || b.y <= a.y) {
      report('STAIR_FLOORS', path, '楼梯需从低层空间连到高层空间。', [s.id])
      continue
    }
    if (a.kind === 'room' || b.kind === 'room') {
      report('STAIR_ENDPOINT_KIND', path, '楼梯端点需连接走廊、平台或庭院；不能穿过未开洞的房间边界。', [s.id, a.id, b.id])
      continue
    }
    const dx = s.to.x - s.from.x
    const dz = s.to.z - s.from.z
    const length = Math.hypot(dx, dz)
    const rise = b.y - a.y
    if (
      (!eq(dx, 0) && !eq(dz, 0)) ||
      length < rise ||
      length < EPS ||
      s.width < 1.2 ||
      s.width > 8 ||
      !Number.isInteger(s.steps) ||
      s.steps < 2 ||
      s.steps > 120
    ) {
      report('STAIR_GEOMETRY', path, '本版支持宽 1.2—8 米、坡度不超过 45°、2—120 级的轴向直跑梯。', [s.id])
      continue
    }
    const ux = dx / length
    const uz = dz / length
    const rect: HouseFootprint = {
      x0: Math.min(s.from.x, s.to.x) - Math.abs(uz) * s.width / 2,
      x1: Math.max(s.from.x, s.to.x) + Math.abs(uz) * s.width / 2,
      z0: Math.min(s.from.z, s.to.z) - Math.abs(ux) * s.width / 2,
      z1: Math.max(s.from.z, s.to.z) + Math.abs(ux) * s.width / 2,
    }
    let landed = true
    for (const [space, p, sign] of [
      [a, s.from, -1],
      [b, s.to, 1],
    ] as const) {
      for (const lateral of [-s.width / 2, s.width / 2]) {
        for (const longitudinal of [0, 0.6]) {
          const q = { x: p.x + ux * sign * longitudinal - uz * lateral, z: p.z + uz * sign * longitudinal + ux * lateral }
          if (!inside(space.bounds, q)) landed = false
        }
      }
      if (inside(space.bounds, { x: p.x - ux * sign * 0.1, z: p.z - uz * sign * 0.1 }, 0.01)) landed = false
    }
    if (!landed) {
      report('STAIR_LANDING', path, '楼梯端点必须接在平台边界，平台要容纳梯宽并向外延伸至少 0.6 米。', [s.id, a.id, b.id])
    }
    for (const space of spaces) {
      if (overlap(rect, space.bounds) && space.y + space.height > a.y + EPS && space.y - defaults.slabThickness < b.y + 2.2) {
        report('STAIR_SPACE_INTERSECTION', path, '楼梯投影与本版要求留空的梯井相交；请分割楼板空间避开梯井。', [s.id, space.id])
      }
    }
    const value: HouseStair = {
      ...s,
      from: { ...s.from, y: a.y },
      to: { ...s.to, y: b.y },
      bounds: rect,
      length,
      rise,
      ux,
      uz,
    }
    for (const other of stairs) {
      if (overlap(rect, other.bounds)) {
        const intersection = {
          x0: Math.max(rect.x0, other.bounds.x0),
          x1: Math.min(rect.x1, other.bounds.x1),
          z0: Math.max(rect.z0, other.bounds.z0),
          z1: Math.min(rect.z1, other.bounds.z1),
        }
        const yAt = (stair: HouseStair, x: number, z: number): number =>
          stair.from.y + (((x - stair.from.x) * stair.ux + (z - stair.from.z) * stair.uz) / stair.length) * stair.rise
        const gaps = [intersection.x0, intersection.x1].flatMap((x) =>
          [intersection.z0, intersection.z1].map((z) => yAt(value, x, z) - yAt(other, x, z)),
        )
        // 斜坡高度差在线性区域角点取极值，同井上下平行梯可以合法叠放。
        if (Math.min(...gaps) < 2.2 && Math.max(...gaps) > -2.2) {
          report('STAIR_INTERSECTION', path, '楼梯之间不足 2.2 米头部净空。', [s.id, other.id])
        }
      }
    }
    stairs.push(value)
    if (rise / s.steps > 0.22 || length / s.steps < 0.24) {
      report('STAIR_COMFORT', path, '踏步偏陡或偏窄，建议调整步数和水平长度以改善观感。', [s.id], {
        risePerStep: rise / s.steps,
        runPerStep: length / s.steps,
      }, 'warning')
    }
  }

  // 通路图：相邻非房间空间自动连通；房间的连接只通过门；楼梯连接明确上下平台。
  const navigation = {
    nodes: spaces.map((s) => ({ id: s.id, x: s.rect.x, y: s.y, z: s.rect.z })),
    edges: [] as { from: string; to: string; kind: 'open' | 'door' | 'stair'; via: string | null }[],
  }
  const connect = (a: string, b: string, kind: 'open' | 'door' | 'stair', via: string | null): void => {
    navigation.edges.push({ from: a, to: b, kind, via })
  }
  for (let i = 0; i < spaces.length; i++) {
    for (let j = i + 1; j < spaces.length; j++) {
      const a = spaces[i]
      const b = spaces[j]
      const edge = sharedEdge(a.bounds, b.bounds)
      if (a.kind !== 'room' && b.kind !== 'room' && a.floorId === b.floorId && edge && edge.hi - edge.lo >= 0.9) {
        connect(a.id, b.id, 'open', null)
      }
    }
  }
  for (const door of openings) {
    if (door.kind === 'door' && door.to !== undefined && spaceMap.has(door.to)) connect(door.spaceId, door.to, 'door', door.id)
  }
  for (const stair of stairs) connect(stair.from.spaceId, stair.to.spaceId, 'stair', stair.id)
  const seen = new Set(entrySpace ? [entrySpace.id] : [])
  const queue = [...seen]
  for (let i = 0; i < queue.length; i++) {
    for (const edge of navigation.edges) {
      const neighbor = edge.from === queue[i] ? edge.to : edge.to === queue[i] ? edge.from : null
      if (neighbor && !seen.has(neighbor)) {
        seen.add(neighbor)
        queue.push(neighbor)
      }
    }
  }
  for (const space of spaces) {
    if (!seen.has(space.id)) report('SPACE_UNREACHABLE', pathOf(space.id), '按门和楼梯连接从入口无法到达此空间。', [space.id])
  }

  const roofs: HouseRoof[] = []
  for (const r of sorted(data.roofs ?? [])) {
    const path = pathOf(r.id)
    const selected = r.spaceIds.map((id) => spaceMap.get(id))
    if (!selected.length || selected.some((s) => !s) || new Set(r.spaceIds).size !== r.spaceIds.length) {
      report('ROOF_REFS', `${path}/spaceIds`, '屋顶需引用不重复的现有空间。', [r.id])
      continue
    }
    const picked = selected as HouseSpace[]
    const bounds = boundsOf(picked.map((s) => s.bounds))
    const first = picked[0]
    const base = first.y + first.height
    const area = picked.reduce((sum, s) => sum + s.rect.width * s.rect.depth, 0)
    const enclosingArea = (bounds.x1 - bounds.x0) * (bounds.z1 - bounds.z0)
    if (picked.some((s) => s.floorId !== first.floorId || !eq(s.y + s.height, base)) || Math.abs(area - enclosingArea) > EPS) {
      report('ROOF_RECTANGLE', path, '本版屋顶覆盖必须是同层、同墙高且无空洞的完整矩形。', [r.id])
    }
    const overhang = r.overhang ?? 0.35
    const rise = r.type === 'gable' ? r.rise ?? 1.8 : 0
    if (overhang < 0 || overhang > 2 || (r.type === 'gable' && (rise <= 0 || rise > 8)) || (r.type === 'flat' && r.rise !== undefined && r.rise !== 0)) {
      report('ROOF_SIZE', path, '挑檐范围为 0—2 米，坡顶升高为 (0, 8] 米，平顶不设置 rise。', [r.id])
    }
    const expanded: HouseFootprint = {
      x0: bounds.x0 - overhang,
      x1: bounds.x1 + overhang,
      z0: bounds.z0 - overhang,
      z1: bounds.z1 + overhang,
    }
    for (const s of spaces) {
      if (s.y > first.y + EPS && overlap(expanded, s.bounds) && s.y - defaults.slabThickness < base + rise + 0.2) {
        report('ROOF_UPPER_FLOOR', path, '屋顶穿入上方楼层，请改为顶层屋顶或调整范围。', [r.id, s.id])
      }
    }
    for (const other of roofs) {
      if (
        overlap(expanded, other.bounds) &&
        positiveOverlap(base - 0.1, base + rise + 0.2, other.base - 0.1, other.base + other.rise + 0.2)
      ) {
        report('ROOF_INTERSECTION', path, '屋顶包络相交；本版不自动处理交接屋脊。', [r.id, other.id])
      }
    }
    roofs.push({ ...r, rise, overhang, bounds: expanded, base, floorId: first.floorId })
  }
  for (const room of rooms) {
    if (
      !roofs.some(
        (r) =>
          inside(r.bounds, { x: room.bounds.x0, z: room.bounds.z0 }) &&
          inside(r.bounds, { x: room.bounds.x1, z: room.bounds.z1 }) &&
          r.base >= room.y + room.height - EPS,
      )
    ) {
      report('ROOF_MISSING', pathOf(room.id), '此房间上方未登记完整覆盖的屋顶，仍可生成设计框架。', [room.id], {}, 'warning')
    }
  }
  if (errors()) return fail()

  // 墙高是室内净高。墙顶到上一层楼板底之间还需要层间结构，不能留成贯通缝。
  // 只连接紧邻上一层、上下真实重叠的区域，不跨层填中庭，也不盖住梯井。
  const floorJoints: HouseModel['floorJoints'] = []
  const elevations = [...new Set(floors.map((f) => f.y))].sort((a, b) => a - b)
  for (const lower of rooms) {
    const nextY = elevations.find((y) => y > lower.y + EPS)
    if (nextY === undefined) continue
    const y0 = round(lower.y + lower.height)
    const y1 = round(nextY - defaults.slabThickness)
    if (y1 - y0 <= EPS) continue
    for (const upper of spaces) {
      if (!eq(upper.y, nextY) || !overlap(lower.bounds, upper.bounds)) continue
      floorJoints.push({
        id: `floor-joint:${lower.id}:${upper.id}`,
        lowerSpaceId: lower.id,
        upperSpaceId: upper.id,
        lowerFloorId: lower.floorId,
        upperFloorId: upper.floorId,
        y0,
        y1,
        upperY: nextY,
        bounds: {
          x0: Math.max(lower.bounds.x0, upper.bounds.x0),
          x1: Math.min(lower.bounds.x1, upper.bounds.x1),
          z0: Math.max(lower.bounds.z0, upper.bounds.z0),
          z1: Math.min(lower.bounds.z1, upper.bounds.z1),
        },
      })
    }
  }

  // 门牌与项目牌：从模型数据派生（业务名与介绍来自清单注入）。
  const signs: HouseSign[] = [
    {
      id: 'project-sign',
      title: sources.project.name,
      subtitle: sources.project.description || '项目入口',
      position: { x: entry.x, y: entry.y + 2.6, z: entry.z },
      normal: { x: 0, y: 0, z: 1 },
    },
  ]
  for (const room of rooms) {
    const door = openings.find((o) => o.kind === 'door' && (o.spaceId === room.id || o.to === room.id))
    if (!door) continue
    const normal = door.spaceId === room.id ? { x: -door.normal.x, y: 0, z: -door.normal.z } : door.normal
    // 牌子从墙中线往房间里挪：墙厚由蓝图给（合法值可到 0.6 米，半厚就是 0.3），
    // 固定的小偏移会把牌子埋进墙里——完整外观下墙面先于牌子被射线命中，正常点击打不开资料。
    // 偏移＝墙半厚＋门牌余量（余量已盖过洞口边框的外扩，见 SIGN_CLEARANCE）。
    const signGap = defaults.wallThickness / 2 + SIGN_CLEARANCE
    signs.push({
      id: `sign:${room.id}`,
      spaceId: room.id,
      floorId: room.floorId,
      title: room.name,
      subtitle: room.intro ?? room.businessId,
      position: { x: door.position.x + normal.x * signGap, y: room.y + door.height + 0.27, z: door.position.z + normal.z * signGap },
      normal,
    })
  }

  const bounds = {
    ...boundsOf([...spaces.map((s) => s.bounds), ...roofs.map((r) => r.bounds), ...stairs.map((s) => s.bounds)]),
    y0: Math.min(...spaces.map((s) => s.y)) - defaults.slabThickness,
    y1: Math.max(...spaces.map((s) => s.y + s.height), ...roofs.map((r) => r.base + r.rise + 0.2)),
  }
  const model: HouseModel = {
    format: 'specdev-building-model',
    generator: BUILDING_SCHEMA,
    project: { name: sources.project.name, description: sources.project.description },
    style: data.style,
    defaults,
    construction,
    floors,
    spaces,
    rooms,
    walls,
    doors: openings.filter((o) => o.kind === 'door'),
    openings,
    stairs,
    roofs,
    floorJoints,
    signs,
    entry,
    bounds,
    navigation,
    diagnostics,
  }
  return { ok: true, model, diagnostics }
}

/**
 * 模型 → 建造表现（纯函数，不修改模型）。按 construction.phase 给当前阶段的构件
 * （design 只有规划框线与薄设计地面）；preview=true 时无视阶段给完整外观预览。
 * parts 是轴对齐方盒（旋转仅屋顶坡板），colliders 为实心盒 AABB，surfaces 为行走面。
 */
export function presentBuilding(model: HouseModel, { preview = false }: { preview?: boolean } = {}): HousePresentation {
  const parts: HousePart[] = []
  const colliders: HousePresentation['colliders'] = []
  const surfaces: HousePresentation['surfaces'] = []
  const phase = PHASES.indexOf(model.construction.phase)
  const timber = model.style === 'chinese-timber'
  const palette = timber
    ? { frame: '#74503b', slab: '#b2a18b', wall: '#dfd6c4', roof: '#4b5550' }
    : { frame: '#a88059', slab: '#d8c9b5', wall: '#ece1cd', roof: '#69756f' }
  const roomMap = new Map(model.rooms.map((r) => [r.id, r]))
  const groundY = Math.min(...model.spaces.map((s) => s.y))

  const part = (
    id: string,
    kind: string,
    position: HousePoint,
    size: { x: number; y: number; z: number },
    color: string,
    { opacity = 1, solid = false, rotation, spaceIds = [] }: { opacity?: number; solid?: boolean; rotation?: { x: number; y: number; z: number }; spaceIds?: string[] } = {},
  ): void => {
    if (Math.min(size.x, size.y, size.z) <= 0) return
    const value: HousePart = { id, kind, position, size, color, opacity, solid, spaceIds }
    if (rotation) value.rotation = rotation
    parts.push(value)
    if (solid && !rotation) {
      colliders.push({
        id,
        x0: position.x - size.x / 2,
        x1: position.x + size.x / 2,
        y0: position.y - size.y / 2,
        y1: position.y + size.y / 2,
        z0: position.z - size.z / 2,
        z1: position.z + size.z / 2,
      })
    }
  }

  for (const space of model.spaces) {
    const { rect, y, bounds } = space
    const builtFloor = preview || phase >= 2 || (phase === 1 && eq(y, groundY))
    const depth = builtFloor ? model.defaults.slabThickness : 0.035
    const kind = !builtFloor ? 'plan-floor' : phase === 1 && !preview ? 'foundation' : 'floor'
    part(
      `floor:${space.id}`,
      kind,
      { x: rect.x, y: y - depth / 2, z: rect.z },
      { x: rect.width, y: depth, z: rect.depth },
      space.kind === 'room' ? space.accent : palette.slab,
      { opacity: builtFloor ? 1 : 0.35, spaceIds: [space.id] },
    )
    surfaces.push({ id: space.id, kind: 'flat', bounds, y, spaceId: space.id })
  }

  const jointFrameKeys = new Set<string>()
  for (const joint of model.floorJoints) {
    const b = joint.bounds
    const spaceIds = [joint.upperSpaceId]
    if (preview || phase >= 2) {
      part(
        joint.id,
        'floor-joint',
        { x: (b.x0 + b.x1) / 2, y: (joint.y0 + joint.y1) / 2, z: (b.z0 + b.z1) / 2 },
        { x: b.x1 - b.x0, y: joint.y1 - joint.y0, z: b.z1 - b.z0 },
        palette.slab,
        { solid: true, spaceIds },
      )
    } else {
      // 设计/基础阶段只标出到上层地坪的连接线，不能借修缝生成实体楼板。
      for (const x of [b.x0, b.x1]) {
        for (const z of [b.z0, b.z1]) {
          const key = `${x}:${z}:${joint.y0}:${joint.upperY}`
          if (jointFrameKeys.has(key)) continue
          jointFrameKeys.add(key)
          part(
            `joint-frame:${key}`,
            'floor-joint-frame',
            { x, y: (joint.y0 + joint.upperY) / 2, z },
            { x: 0.045, y: joint.upperY - joint.y0, z: 0.045 },
            palette.frame,
            { opacity: 0.55, spaceIds },
          )
        }
      }
    }
  }

  const frameKeys = new Set<string>()
  for (const wall of model.walls) {
    const owners = wall.spaceIds.map((id) => roomMap.get(id))
    const implemented = owners.every((r) => r?.status.implementation === 'present')
    const complete = owners.every((r) => r?.status.tests === 'passed' && r?.status.acceptance === 'passed')
    const showSkin = preview || phase >= 3
    if (showSkin) {
      for (const segment of wall.segments) {
        const color =
          preview || (implemented && complete)
            ? wall.wallType === 'brick'
              ? '#938777'
              : wall.wallType === 'timber'
                ? '#a08060'
                : palette.wall
            : implemented
              ? '#e4b84e'
              : '#a1c9d0'
        part(segment.id, 'wall', segment.position, segment.size, color, {
          opacity: preview || implemented ? 1 : 0.22,
          solid: preview || implemented,
          spaceIds: wall.spaceIds,
        })
      }
    }
    const width = phase >= 2 || preview ? 0.14 : 0.055
    for (const at of [wall.lo, wall.hi]) {
      const x = wall.axis === 'x' ? at : wall.at
      const z = wall.axis === 'z' ? at : wall.at
      const key = `${wall.floorId}:${x}:${z}:${wall.height}`
      if (frameKeys.has(key)) continue
      frameKeys.add(key)
      // 设计框线不算实体柱，实体阶段柱也不单独挡住紧贴门的路线。
      part(
        `post:${key}`,
        'frame',
        { x, y: wall.y + wall.height / 2, z },
        { x: width, y: wall.height, z: width },
        palette.frame,
        { opacity: phase === 0 && !preview ? 0.65 : 1, spaceIds: wall.spaceIds },
      )
    }
    const beam = planeBox(wall.axis, wall.at, wall.lo, wall.hi, wall.y + wall.height - width, wall.y + wall.height, width)
    part(`beam:${wall.id}`, 'frame', beam.position, beam.size, palette.frame, { spaceIds: wall.spaceIds })
    for (const o of wall.openings) {
      for (const at of [o.lo, o.hi]) {
        const jamb = planeBox(wall.axis, wall.at, at - 0.045, at + 0.045, wall.y + o.sill, wall.y + o.sill + o.height, model.defaults.wallThickness + 0.045)
        part(`jamb:${o.id}:${at}`, 'opening-frame', jamb.position, jamb.size, palette.frame, {
          opacity: preview || phase >= 2 ? 1 : 0.35,
          spaceIds: wall.spaceIds,
        })
      }
      const lintel = planeBox(wall.axis, wall.at, o.lo, o.hi, wall.y + o.sill + o.height, wall.y + o.sill + o.height + 0.07, model.defaults.wallThickness + 0.045)
      part(`lintel:${o.id}`, 'opening-frame', lintel.position, lintel.size, palette.frame, {
        opacity: preview || phase >= 2 ? 1 : 0.35,
        spaceIds: wall.spaceIds,
      })
      if (o.kind === 'window' && showSkin) {
        const glass = planeBox(wall.axis, wall.at, o.lo, o.hi, wall.y + o.sill, wall.y + o.sill + o.height, 0.035)
        part(`glass:${o.id}`, 'glass', glass.position, glass.size, '#afcbd0', {
          opacity: 0.28,
          solid: preview || implemented,
          spaceIds: wall.spaceIds,
        })
      }
    }
  }

  for (const stair of model.stairs) {
    surfaces.push({
      id: stair.id,
      kind: 'stair',
      bounds: stair.bounds,
      from: stair.from,
      to: stair.to,
      ux: stair.ux,
      uz: stair.uz,
      length: stair.length,
      rise: stair.rise,
      width: stair.width,
    })
    for (let i = 0; i < stair.steps; i++) {
      const t = (i + 0.5) / stair.steps
      const h = ((i + 1) / stair.steps) * stair.rise
      part(
        `step:${stair.id}:${i}`,
        'stair',
        { x: stair.from.x + stair.ux * stair.length * t, y: stair.from.y + h - 0.065, z: stair.from.z + stair.uz * stair.length * t },
        {
          x: Math.abs(stair.ux) > 0.5 ? stair.length / stair.steps : stair.width,
          y: 0.13,
          z: Math.abs(stair.uz) > 0.5 ? stair.length / stair.steps : stair.width,
        },
        palette.frame,
        { opacity: preview || phase >= 2 ? 1 : 0.28, spaceIds: [stair.from.spaceId, stair.to.spaceId] },
      )
    }
  }

  for (const roof of model.roofs) {
    const b = roof.bounds
    const width = b.x1 - b.x0
    const depth = b.z1 - b.z0
    const x = (b.x0 + b.x1) / 2
    const z = (b.z0 + b.z1) / 2
    if (preview || phase >= 3) {
      if (roof.type === 'flat') {
        part(`roof:${roof.id}`, 'roof', { x, y: roof.base + 0.09, z }, { x: width, y: 0.18, z: depth }, palette.roof, {
          spaceIds: roof.spaceIds,
        })
      } else {
        for (const sign of [-1, 1]) {
          part(
            `roof:${roof.id}:${sign}`,
            'roof',
            { x, y: roof.base + roof.rise / 2, z: z + (sign * depth) / 4 },
            { x: width, y: 0.16, z: Math.hypot(depth / 2, roof.rise) },
            palette.roof,
            { rotation: { x: sign * Math.atan2(roof.rise, depth / 2), y: 0, z: 0 }, spaceIds: roof.spaceIds },
          )
        }
      }
    } else {
      if (roof.type === 'gable') {
        part(`ridge:${roof.id}`, 'roof-frame', { x, y: roof.base + roof.rise, z }, { x: width, y: 0.045, z: 0.045 }, palette.frame, {
          opacity: 0.55,
          spaceIds: roof.spaceIds,
        })
        for (const end of [b.x0, b.x1]) {
          for (const sign of [-1, 1]) {
            part(
              `rafter:${roof.id}:${end}:${sign}`,
              'roof-frame',
              { x: end, y: roof.base + roof.rise / 2, z: z + (sign * depth) / 4 },
              { x: 0.045, y: 0.045, z: Math.hypot(depth / 2, roof.rise) },
              palette.frame,
              { rotation: { x: sign * Math.atan2(roof.rise, depth / 2), y: 0, z: 0 }, opacity: 0.55, spaceIds: roof.spaceIds },
            )
          }
        }
      }
    }
  }
  return { parts, colliders, surfaces }
}

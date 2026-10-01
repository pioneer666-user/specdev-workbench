// 诊断码 → 修复对象：给命令行（以及建房 Skill 的参考资料）一份机器可读的分类。
// 为什么需要：不是所有 error 都能靠改蓝图解决——MATERIAL_UNREADABLE 是清单或资料的问题，
// 把 AI 指向"回蓝图改"只会白改一轮；而 BUSINESS_MISSING 要看证据才知道该加房间还是该动清单。
// 分类口径必须与 Skill 的 references/diagnostics.md 一致（house-skill 单档逐码核对）。
import type { BuildingProblemCode } from './types.ts'

/**
 * 修复对象：
 *  - blueprint：改 docs/specdev/building.json（按诊断的 subject.path 定位）；
 *  - inventory：清单或资料的问题，改蓝图改不好——报告作者，或先修清单/资料（specdev-business）；
 *  - evidence：两种都可能，按诊断 evidence 里的 id 与归属判，别猜。
 */
export type FixTarget = 'blueprint' | 'inventory' | 'evidence'

export const FIX_TARGET_LABELS: Readonly<Record<FixTarget, string>> = {
  blueprint: '改蓝图',
  inventory: '改清单或资料',
  evidence: '按证据判',
}

/**
 * 全部 49 个诊断码的分类（内容源：src/core/house.ts 与 src/core/building.ts 实际报码处）。
 * 新增诊断码时必须同时在这里与 Skill 的 diagnostics.md 补上——两处都有回归钉住。
 */
export const FIX_TARGETS: Readonly<Record<BuildingProblemCode, FixTarget>> = {
  // 输入形状（拼写、取值、必填）——蓝图自己写错了
  INPUT_TYPE: 'blueprint',
  INPUT_ENUM: 'blueprint',
  INPUT_PATTERN: 'blueprint',
  INPUT_EMPTY: 'blueprint',
  INPUT_UNKNOWN_FIELD: 'blueprint',
  INPUT_REQUIRED: 'blueprint',
  DEFAULT_RANGE: 'blueprint',
  EMPTY_BUILDING: 'blueprint',
  INPUT_LIMIT: 'blueprint',
  ID_DUPLICATE: 'blueprint',
  // 状态声明——不许凭空声称已实现/已验收，改法在蓝图（去掉声明或补出处）
  STATE_EVIDENCE_REQUIRED: 'blueprint',
  STATE_CONTRADICTION: 'blueprint',
  ACCEPTANCE_INCOMPLETE: 'blueprint',
  // 楼层、空间、尺寸、排布
  FLOOR_REF: 'blueprint',
  FLOOR_RANGE: 'blueprint',
  SPACE_DIMENSION: 'blueprint',
  SPACE_HEIGHT: 'blueprint',
  SPACE_OVERLAP: 'blueprint',
  FLOOR_CLEARANCE: 'blueprint',
  SPACE_UNREACHABLE: 'blueprint',
  ENTRY_POSITION: 'blueprint',
  SHARED_WALL_CONFLICT: 'blueprint',
  // 开口（门、窗）与楼梯
  OPENING_ROOM: 'blueprint',
  OPENING_SIZE: 'blueprint',
  DOOR_CONNECTION: 'blueprint',
  WINDOW_CONNECTION: 'blueprint',
  OPENING_PARTITION: 'blueprint',
  OPENING_OVERLAP: 'blueprint',
  STAIR_FLOORS: 'blueprint',
  STAIR_ENDPOINT_KIND: 'blueprint',
  STAIR_GEOMETRY: 'blueprint',
  STAIR_LANDING: 'blueprint',
  STAIR_SPACE_INTERSECTION: 'blueprint',
  STAIR_INTERSECTION: 'blueprint',
  STAIR_COMFORT: 'blueprint',
  // 屋顶
  ROOF_REFS: 'blueprint',
  ROOF_RECTANGLE: 'blueprint',
  ROOF_SIZE: 'blueprint',
  ROOF_UPPER_FLOOR: 'blueprint',
  ROOF_INTERSECTION: 'blueprint',
  ROOF_MISSING: 'blueprint',
  // 绑定层：业务与蓝图之间的对账
  BLUEPRINT_SHAPE: 'blueprint',
  BUSINESS_REQUIRED: 'blueprint',
  BUSINESS_NOT_ROOM: 'blueprint',
  BUSINESS_DUPLICATE: 'blueprint',
  // 清单里有没有这个业务、业务该不该留，是作者的取舍，按证据判
  BUSINESS_MISSING: 'evidence',
  BUSINESS_UNKNOWN: 'evidence',
  // 有绑定但没入口：装配被 directory:false 关掉，或（未来）装配漂移——改蓝图
  MATERIAL_NO_ENTRY: 'blueprint',
  // 资料本身读不了（文档不在/读不开、workflow.json 缺失或读不开、业务/图说明文件坏、图编号冲突）
  MATERIAL_UNREADABLE: 'inventory',
}

/**
 * 少数诊断的 `subject.path` 不足以定位：例如 BUSINESS_MISSING／MATERIAL_NO_ENTRY 的 path 只到 `/spaces`，
 * 而真正的指针在 `subject.ids` 或 `evidence.businessId` 里。这里给出这几条的定位口径；
 * 完整修法在 Skill 的 `references/diagnostics.md`（两处由回归钉住一致性）。
 * 注意：不许写"看 evidence 里的 id"——BUSINESS_UNKNOWN 根本没有 evidence，BUSINESS_MISSING 的 evidence
 * 只有 businessName，id 都在 subject.ids。
 */
export const LOCATE_HINTS: Readonly<Partial<Record<BuildingProblemCode, string>>> = {
  MATERIAL_NO_ENTRY: '用 evidence.businessId 找到对应房间，检查它的 directory 是否被关掉（关掉就没有资料入口）。',
  BUSINESS_MISSING: 'subject.ids 里是"没有房间的业务 id"：默认在蓝图里给它加一间；这个业务该不该留在清单里由作者决定。',
  BUSINESS_UNKNOWN: '对照 subject.ids（业务 id 与空间 id）与项目清单：多数是蓝图把业务 id 写错了，先改蓝图指向清单里的真实 id。',
  MATERIAL_UNREADABLE: '按 evidence 里的 path／chartId／reason 核对资料文件本身：这类改蓝图解决不了。',
}

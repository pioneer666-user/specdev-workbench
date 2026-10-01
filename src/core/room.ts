// 独立业务房间 · 配置读取与身份绑定（P1b-1）。
// room.json 固定放在 <项目根>/docs/specdev/<businessId>/room.json——根目录由现有工作区
// 绑定解析，本层不接收调用方传入的文件路径。业务存在性、名称与介绍以项目清单
// （inventory）为准，room.json 不重复保存；资料绑定的文档清单来自清单登记的 docs，
// 绑定条目（bindings）只透传，合法性归页面侧 web/assets/rooms/bindings.js（E3a）。
// 本层只做三件事：读得到、归属对、顶层结构对；实例内部结构、模板是否存在、家具
// 边界与依附仍归 P1a 的 web/assets/rooms/placement.js——页面拿 layout 先校验再渲染。
import { readWorktreeFileOptional } from './git.ts'
import { CoreError } from './errors.ts'
import { readInventory } from './inventory.ts'
import { isPlainObject } from './descriptor.ts'
import { CONVENTION_ROOT, type RoomLayoutFile, type RoomLayoutRead } from './types.ts'

/** room.json 顶层必填字段（原五项，全部必填）。 */
const ROOM_REQUIRED_FIELDS = ['schemaVersion', 'roomId', 'businessId', 'templateRef', 'instances'] as const
/** 顶层允许字段＝必填五项＋可选 bindings（E3a：家具资料绑定，只确认是数组，条目归页面侧校验）。
 *  必填与允许分开维护：不因新增可选字段把它误设为必填，也不放开其他未知顶层字段。 */
const ROOM_ALLOWED_FIELDS = [...ROOM_REQUIRED_FIELDS, 'bindings'] as const

/** 业务/房间 ID 规则，对齐 src/dsh/index.ts 的 ID_PATTERN（core 不 import dsh，改规则须两处同步）。 */
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

/** room.json 在业务仓库中的固定位置（仓库相对路径，不由请求指定）。 */
export function roomLayoutRel(businessId: string): string {
  return `${CONVENTION_ROOT}/${businessId}/room.json`
}

/**
 * 读取一个业务的房间配置（P1b-1）。失败语义（code → HTTP）：
 *   bad-request             business 不是合法 ID（核心层自查，不只信任 HTTP 层）→ 400
 *   not-found               项目清单里没有该业务 → 404（磁盘上有同名 room.json 也不能绕过）
 *   bad-business            业务存在但说明文件有问题（descriptorError）→ 422
 *   no-room-layout          room.json 不存在 → 404（不自动生成、不回退样例）
 *   bad-room-layout         非法 JSON／顶层非对象／字段缺失/多余/类型错/版本非数字 1 → 422
 *   room-business-mismatch  合法 businessId 与请求业务不一致 → 422（不静默改成请求值）
 * 清单、工作区与文件读取的其余失败沿用既有 code/status（bad-inventory 500、file-too-large 413 等），
 * 不统一吞成"未配置房间"。
 */
export async function readRoomLayout(repoRoot: string, businessId: string): Promise<RoomLayoutRead> {
  if (!ID_PATTERN.test(businessId)) {
    throw new CoreError('bad-request', `参数 business 不合法：${businessId}`, 400)
  }
  // 业务存在性与可用性以清单为准（名称/介绍也来自这里），先查清单再读固定路径。
  const inventory = await readInventory(repoRoot)
  const business = inventory.businesses.find((item) => item.id === businessId)
  if (!business) {
    throw new CoreError('not-found', `业务 ${businessId} 不存在（项目清单里没有这个业务）`, 404)
  }
  if (business.descriptorError) {
    throw new CoreError(
      'bad-business',
      `业务 ${businessId} 的说明文件有问题，不能当作可用业务：${business.descriptorError}`,
      422,
    )
  }

  const relPath = roomLayoutRel(businessId)
  const text = await readWorktreeFileOptional(repoRoot, relPath)
  if (text === null) {
    throw new CoreError(
      'no-room-layout',
      `业务 ${businessId} 还没有房间配置：未找到 ${relPath}。不会自动生成，也不回退到样例。`,
      404,
    )
  }
  let layout: RoomLayoutFile
  try {
    layout = JSON.parse(text) as RoomLayoutFile
  } catch (error) {
    throw new CoreError('bad-room-layout', `${relPath} 不是合法 JSON：${(error as Error).message}`, 422)
  }
  if (!isPlainObject(layout)) {
    throw new CoreError(
      'bad-room-layout',
      `${relPath} 顶层必须是 JSON 对象，实际是 ${Array.isArray(layout) ? '数组' : typeof layout}`,
      422,
    )
  }
  // 字段白名单：多出的键拒绝（指名），缺的必填键拒绝（列全）——都不能静默忽略。
  const unknownFields = Object.keys(layout).filter((key) => !(ROOM_ALLOWED_FIELDS as readonly string[]).includes(key))
  if (unknownFields.length > 0) {
    throw new CoreError(
      'bad-room-layout',
      `${relPath} 只允许字段 ${ROOM_ALLOWED_FIELDS.join('、')}，多出：${unknownFields.join('、')}`,
      422,
    )
  }
  const missingFields = ROOM_REQUIRED_FIELDS.filter((field) => !(field in layout))
  if (missingFields.length > 0) {
    throw new CoreError('bad-room-layout', `${relPath} 缺必填字段：${missingFields.join('、')}`, 422)
  }
  if (typeof layout.schemaVersion !== 'number' || layout.schemaVersion !== 1) {
    throw new CoreError(
      'bad-room-layout',
      `${relPath} 的 schemaVersion 必须是数字 1（实际是 ${JSON.stringify(layout.schemaVersion)}）`,
      422,
    )
  }
  if (typeof layout.roomId !== 'string' || !ID_PATTERN.test(layout.roomId)) {
    throw new CoreError(
      'bad-room-layout',
      `${relPath} 的 roomId 必须是符合 ID 规则（字母数字开头，可含 . _ -）的非空字符串（实际是 ${JSON.stringify(layout.roomId)}）`,
      422,
    )
  }
  if (typeof layout.businessId !== 'string' || !ID_PATTERN.test(layout.businessId)) {
    throw new CoreError(
      'bad-room-layout',
      `${relPath} 的 businessId 必须是符合 ID 规则的非空字符串（实际是 ${JSON.stringify(layout.businessId)}）`,
      422,
    )
  }
  if (typeof layout.templateRef !== 'string' || !layout.templateRef.trim()) {
    throw new CoreError(
      'bad-room-layout',
      `${relPath} 的 templateRef 必须是非空字符串（实际是 ${JSON.stringify(layout.templateRef)}）`,
      422,
    )
  }
  if (!Array.isArray(layout.instances)) {
    throw new CoreError(
      'bad-room-layout',
      `${relPath} 的 instances 必须是数组（空数组＝空房间；实际是 ${typeof layout.instances}）`,
      422,
    )
  }
  // bindings 可选（省略或空数组＝没有家具资料绑定）；显式存在就必须是数组，条目原样透传，
  // 合法性由 web/assets/rooms/bindings.js 在页面侧校验——200 不代表资料绑定有效。
  if ('bindings' in layout && !Array.isArray(layout.bindings)) {
    throw new CoreError(
      'bad-room-layout',
      `${relPath} 的 bindings 必须是数组（省略或空数组＝没有家具资料绑定；实际是 ${layout.bindings === null ? 'null' : typeof layout.bindings}）`,
      422,
    )
  }
  // 归属核对放最后：字段类型错归结构错误，合法字符串身份不一致才归这里，且不改写、不返回候选。
  if (layout.businessId !== businessId) {
    throw new CoreError(
      'room-business-mismatch',
      `${relPath} 的 businessId（${layout.businessId}）与请求的业务（${businessId}）不一致：房间配置只归属它登记的业务。`,
      422,
    )
  }
  return {
    // docs 来自该业务清单登记（business.json 的 docs），charts 是本业务图目录的投影
    // （E9c，既有 inventory 扫描结果：目录内 chart.json/workflow.json 等按既有规则扫描，
    // 不新开扫描器，也不在 business.json 里加 charts 登记数组）；页面拿一次房间响应即可
    // 校验文档与图的资料绑定——不从 room.json 接受 docs/charts，也不混入其他业务（E3a/E9c）。
    business: {
      id: business.id,
      name: business.name,
      intro: business.intro,
      docs: business.docs,
      charts: business.charts.map((chart) => ({
        id: chart.id,
        name: chart.name,
        ...(chart.summary === undefined ? {} : { summary: chart.summary }),
        hasWorkflow: chart.hasWorkflow,
        ...(chart.descriptorError === undefined ? {} : { descriptorError: chart.descriptorError }),
        ...(chart.idConflict === undefined ? {} : { idConflict: chart.idConflict }),
      })),
    },
    layout,
    source: { path: relPath },
  }
}

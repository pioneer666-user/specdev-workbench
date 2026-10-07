// 独立房间 · 行走数据适配（P1c-1 室内版／P1c-2b 室外版）：把已通过产品
// validatePlacement 的 template 与 assembly 翻译成原版建筑导航 building-walk.js
// 能消费的 model/presentation。本模块只做数据翻译，导航算法原样复用 createNavigator，
// 不复制、不改造，也不重新计算家具尺寸或承载关系；调用前置条件是产品校验成功，
// API 读取成功不能直接调用。
// 边界语义：zones 是摆放区、reservedVolumes 是禁放区，二者都不是人物唯一可走范围、
// 入口／通路也不是碰撞障碍；fixture 仅按实际固定构件盒参与避障。室内版整个室内空地都能走，房间边界由行走面
// 的支撑检查约束（人物保留约 0.26 米支撑半径，门洞处停在房内），不伪造墙厚或外部
// 碰撞盒，适用范围不随室外版收紧。室外版（buildRoomOutdoorWalkData）另加封闭墙壳、
// 真实门盒与外围隐形墙碰撞，人物可绕屋与经门进出。
// 人物尺寸必须与原导航一致（半径 0.26、躯干净高 1.9）：模板 walkProfile 偏离时明确
// 报错，不静默换尺寸，也不改原导航去支持可变参数。

const NAVIGATOR_RADIUS = 0.26
const NAVIGATOR_EYE_CLEARANCE = 1.9
const EPS = 1e-9

/** 室内／室外两个入口共用的身份检查：装配结果必须与模板同源，错误消息保持 P1c-1 原文。 */
function assertRoomIdentity(template, assembly) {
  if (assembly.templateId !== template.templateId) {
    throw new Error(`房间行走适配失败：装配结果的 templateId 是「${assembly.templateId}」，与模板「${template.templateId}」不一致，不能跨房间误接导航数据。`)
  }
  if (assembly.styleId !== template.styleId) {
    throw new Error(`房间行走适配失败：装配结果的 styleId 是「${assembly.styleId}」，与模板风格「${template.styleId}」不一致，导航数据必须来自同一模板的校验结果。`)
  }
}

/** 家具 collider 转换（两个入口共用）：id=instanceId，世界 solid 已含承载面高度（台灯 y0 即桌面高度）。 */
function toFurnitureColliders(assembly) {
  return assembly.instances.map((instance) => ({
    id: instance.instanceId,
    x0: instance.solid.minX, x1: instance.solid.maxX,
    y0: instance.solid.minY, y1: instance.solid.maxY,
    z0: instance.solid.minZ, z1: instance.solid.maxZ,
  }))
}

/** 仅实体 fixture 转为高度保真的碰撞盒，入口/通路仍只是摆放与可达性约束。 */
function toFixtureColliders(template) {
  return template.reservedVolumes.filter((volume) => volume.purpose === 'fixture').map(({ id, bounds: b }) => ({
    id: `fixture:${id}`, x0: b.minX, x1: b.maxX, y0: b.minY, y1: b.maxY, z0: b.minZ, z1: b.maxZ,
  }))
}

/**
 * template＋assembly → { model, presentation }（可直接交给 createNavigator／entryPoint）。
 * 纯函数：不缓存上一次房间，不改写输入；输出范围对象全部重新构造，不与输入共用引用。
 */
export function buildRoomWalkData(template, assembly) {
  assertRoomIdentity(template, assembly)
  const { radius, eyeClearance } = template.walkProfile ?? {}
  if (Math.abs((radius ?? NaN) - NAVIGATOR_RADIUS) > EPS || Math.abs((eyeClearance ?? NaN) - NAVIGATOR_EYE_CLEARANCE) > EPS) {
    throw new Error(`房间行走适配失败：模板 walkProfile（radius=${radius}，eyeClearance=${eyeClearance}）与现有导航支持的 radius=0.26／eyeClearance=1.9 不一致；不改导航支持可变人物尺寸，请修正模板。`)
  }
  const { minX, maxX, minY, maxY, minZ, maxZ } = template.interiorBounds
  // 出生点 x/z 来自装配结果的 spawn（模板 entry.spawn 的同一份解析值），y 用室内地坪。
  return {
    model: {
      spaces: [{ id: assembly.roomId, y: minY, height: maxY - minY, bounds: { x0: minX, x1: maxX, z0: minZ, z1: maxZ } }],
      entry: { spaceId: assembly.roomId, x: assembly.spawn.x, y: minY, z: assembly.spawn.z },
    },
    presentation: {
      surfaces: [{ kind: 'flat', y: minY, bounds: { x0: minX, x1: maxX, z0: minZ, z1: maxZ } }],
      // 家具一一对应实例，另有实际 fixture；室内 collider 仍不带 kind。
      colliders: [...toFurnitureColliders(assembly), ...toFixtureColliders(template)],
    },
  }
}

// ── 室外行走与隐形边界（P1c-2b）─────────────────────────────────────────────
// 本阶段已决定的场地尺寸（任务单定死，不交选型）：隐形墙内侧 16×14 米，支撑面向外
// 多 0.5 米——把“没有地面支撑”与“隐形墙在挡人”区分开；后续可见地面可继续延伸，
// 不能用地板断口或围栏标记隐形墙。墙壳是通行用的简化结构碰撞，不宣称等于全部装饰
// 的逐顶点碰撞；窗户按墙体封闭，门洞空出、过梁从门高 2.55 起。

const ROOM_FLOOR_Y = 0
const ROOM_HEIGHT = 3.4
// 北门中心 (2.25,-3)、宽 1.4、高 2.55：门洞 X[1.55,2.95]，与两套底座 meta.door 一致。
const DOOR_OPENING_X0 = 1.55
const DOOR_OPENING_X1 = 2.95
const DOOR_LINTEL_Y = 2.55
// 墙厚来自现有墙体（ceramic=0.18，fairy=0.26）；未知风格没有登记墙厚，直接报错。
const OUTDOOR_WALL_THICKNESS = { ceramic: 0.18, fairy: 0.26 }
const OUTDOOR_SITE = {
  floorY: ROOM_FLOOR_Y,
  walkBounds: { minX: -8, maxX: 8, minZ: -7, maxZ: 7 },
  supportBounds: { minX: -8.5, maxX: 8.5, minZ: -7.5, maxZ: 7.5 },
  spawn: { x: 2.25, y: 0, z: -5.2 },
}
const OUTDOOR_INNER_X0 = -4
const OUTDOOR_INNER_X1 = 4
const OUTDOOR_INNER_Z0 = -3
const OUTDOOR_INNER_Z1 = 3

/**
 * 风格墙厚查表（只认登记的自有键）：`constructor`、`toString`、`__proto__` 等原型键
 * 不是已登记风格，必须落进“尚未登记”报错，不能取到继承属性后参与运算。
 */
function outdoorWallThickness(styleId) {
  if (!Object.hasOwn(OUTDOOR_WALL_THICKNESS, styleId)) {
    throw new Error(`房间室外行走适配失败：模板风格「${String(styleId)}」尚未登记室外墙厚与场地数据（当前仅 ceramic／fairy），不能套用本轮隐形墙参数，请为新底座单独登记后再开放室外行走。`)
  }
  const thickness = OUTDOOR_WALL_THICKNESS[styleId]
  if (typeof thickness !== 'number' || !Number.isFinite(thickness) || thickness <= 0) {
    throw new Error(`房间室外行走适配失败：风格「${String(styleId)}」登记的墙厚 ${String(thickness)} 不是有限正数，登记表本身有误，拒绝生成导航数据。`)
  }
  return thickness
}

/**
 * 固定门洞前提校验：墙壳把北墙 X[1.55,2.95] 当门洞、Y2.55 当过梁底，因此模板的
 * 门位置、宽高与朝向必须逐项等于本轮固定值。上游 placement 只保证门中心为有限数、
 * 宽高为正数，不保证等于固定值——该校验不能由上游替代。
 */
function assertOutdoorDoorGeometry(template) {
  const entry = template?.entry
  if (!entry || typeof entry !== 'object') {
    throw new Error('房间室外行走适配失败：模板缺少 entry 声明，室外场地无从核对门洞（要求 north 墙、+Z 向内、向外开、中心 (2.25,-3)、宽 1.4、高 2.55），不能默认套用北门碰撞。')
  }
  const door = entry.door
  if (!door || typeof door !== 'object') {
    throw new Error('房间室外行走适配失败：模板 entry 缺少 door 声明（要求 north 墙、+Z 向内、向外开、中心 (2.25,-3)、宽 1.4、高 2.55），不能默认套用北门碰撞。')
  }
  const problems = []
  const fixed = [
    ['entry.wall', entry.wall, 'north'],
    ['entry.inward', entry.inward, '+Z'],
    ['entry.door.opens', door.opens, 'outward'],
  ]
  for (const [name, actual, expected] of fixed) {
    if (actual !== expected) problems.push(`${name}=${JSON.stringify(actual)}（要求 ${JSON.stringify(expected)}）`)
  }
  const numbers = [
    ['entry.door.centerX', door.centerX, 2.25],
    ['entry.door.centerZ', door.centerZ, -3],
    ['entry.door.width', door.width, 1.4],
    ['entry.door.height', door.height, 2.55],
  ]
  for (const [name, actual, expected] of numbers) {
    if (typeof actual !== 'number' || !Number.isFinite(actual) || Math.abs(actual - expected) > EPS) {
      problems.push(`${name}=${String(actual)}（要求有限数 ${expected}）`)
    }
  }
  if (problems.length > 0) {
    throw new Error(`房间室外行走适配失败：${problems.join('；')}。本轮墙壳把北墙 X[1.55,2.95] 当门洞、Y2.55 当过梁底，门位置、宽高或朝向变更后必须重新登记场地数据，不能套用旧碰撞。`)
  }
}

/** 室外场地的房间前提：室内范围与门洞参数只对当前两套未做根变换的房间成立。 */
function assertOutdoorRoomGeometry(template) {
  const thickness = outdoorWallThickness(template.styleId)
  const b = template.interiorBounds
  const expected = { minX: OUTDOOR_INNER_X0, maxX: OUTDOOR_INNER_X1, minY: ROOM_FLOOR_Y, maxY: ROOM_HEIGHT, minZ: OUTDOOR_INNER_Z0, maxZ: OUTDOOR_INNER_Z1 }
  for (const [key, value] of Object.entries(expected)) {
    if (!Number.isFinite(b[key]) || Math.abs(b[key] - value) > EPS) {
      throw new Error(`房间室外行走适配失败：模板 interiorBounds 的 ${key}=${b[key]} 与室外场地前提（X[-4,4]·Z[-3,3]·Y[0,3.4]、北门中心 (2.25,-3) 宽 1.4）不符；本轮墙壳与门洞参数只对当前两套房间成立，请先核对底座实际几何。`)
    }
  }
  assertOutdoorDoorGeometry(template)
  return thickness
}

/**
 * 门盒校验与碰撞映射。doorBounds 必须是真实 room.door.getBounds() 的当前值
 * （开门、关门时各取一次）：六个字段有限数且各轴 min<max；不收 Three.js 对象或
 * 门句柄——它们没有这六个数字字段，会在这里被明确拒绝。
 */
function toDoorCollider(options) {
  const source = options?.doorBounds
  if (!source || typeof source !== 'object') {
    throw new Error(`房间室外行走适配失败：缺少 doorBounds——门碰撞必须来自真实 room.door.getBounds() 的当前值（开门与关门各取一次），不收门句柄或 Three.js 对象。`)
  }
  const bounds = {}
  for (const axis of ['X', 'Y', 'Z']) {
    for (const edge of ['min', 'max']) {
      const key = `${edge}${axis}`
      const value = source[key]
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`房间室外行走适配失败：doorBounds 的 ${key} 必须是有限数，收到「${String(value)}」（${typeof value}）；请传 room.door.getBounds() 返回的普通对象。`)
      }
      bounds[key] = value
    }
    if (!(bounds[`min${axis}`] < bounds[`max${axis}`])) {
      throw new Error(`房间室外行走适配失败：doorBounds 的 ${axis} 轴 min(${bounds[`min${axis}`]}) 必须小于 max(${bounds[`max${axis}`]})，倒置或零厚度的门盒不是有效碰撞。`)
    }
  }
  // 门盒直接映射为碰撞：不重新猜门板宽度、铰链位置或角度；打开的门板仍是实体。
  return { id: 'structure:entry-door', kind: 'door', x0: bounds.minX, x1: bounds.maxX, y0: bounds.minY, y1: bounds.maxY, z0: bounds.minZ, z1: bounds.maxZ }
}

/** 封闭墙壳（转角重叠封缝）：西／东／南／北左／北右／北门过梁，厚 t 来自风格。 */
function toWallColliders(thickness) {
  const t = thickness
  const wall = (id, x0, x1, z0, z1, y0 = ROOM_FLOOR_Y, y1 = ROOM_HEIGHT) =>
    ({ id: `structure:${id}`, kind: 'wall', x0, x1, y0, y1, z0, z1 })
  return [
    wall('wall-west', OUTDOOR_INNER_X0 - t, OUTDOOR_INNER_X0, OUTDOOR_INNER_Z0 - t, OUTDOOR_INNER_Z1 + t),
    wall('wall-east', OUTDOOR_INNER_X1, OUTDOOR_INNER_X1 + t, OUTDOOR_INNER_Z0 - t, OUTDOOR_INNER_Z1 + t),
    wall('wall-south', OUTDOOR_INNER_X0 - t, OUTDOOR_INNER_X1 + t, OUTDOOR_INNER_Z1, OUTDOOR_INNER_Z1 + t),
    wall('wall-north-left', OUTDOOR_INNER_X0 - t, DOOR_OPENING_X0, OUTDOOR_INNER_Z0 - t, OUTDOOR_INNER_Z0),
    wall('wall-north-right', DOOR_OPENING_X1, OUTDOOR_INNER_X1 + t, OUTDOOR_INNER_Z0 - t, OUTDOOR_INNER_Z0),
    wall('wall-lintel-north', DOOR_OPENING_X0, DOOR_OPENING_X1, OUTDOOR_INNER_Z0 - t, OUTDOOR_INNER_Z0, DOOR_LINTEL_Y, ROOM_HEIGHT),
  ]
}

/** 外围隐形墙四盒：厚 0.25、Y[0,3.4]，内侧即 walkBounds；只是碰撞数据，不是可见物。 */
function toBoundaryColliders() {
  const { minX, maxX, minZ, maxZ } = OUTDOOR_SITE.walkBounds
  const g = 0.25
  const box = (id, x0, x1, z0, z1) =>
    ({ id: `structure:${id}`, kind: 'boundary', x0, x1, y0: ROOM_FLOOR_Y, y1: ROOM_HEIGHT, z0, z1 })
  return [
    box('boundary-west', minX - g, minX, minZ - g, maxZ + g),
    box('boundary-east', maxX, maxX + g, minZ - g, maxZ + g),
    box('boundary-north', minX - g, maxX + g, minZ - g, minZ),
    box('boundary-south', minX - g, maxX + g, maxZ, maxZ + g),
  ]
}

/**
 * template＋assembly＋{ doorBounds } → { model, presentation, site }（P1c-2b 室外版）。
 * model/presentation 直接交给 createNavigator／entryPoint：门外出生、绕屋行走、
 * 开门双向进出、关门挡人、隐形墙限距。纯数据翻译，不建 Mesh／事件／动画循环，
 * 不调用 setOpen——门切态后由调用方取新的 getBounds 重建导航并自行保留人物位置。
 */
export function buildRoomOutdoorWalkData(template, assembly, options) {
  assertRoomIdentity(template, assembly)
  // walkProfile 用严格有限数检查（缺失／NaN／Infinity／偏离都拒绝），不依赖 NaN 比较。
  const { radius, eyeClearance } = template.walkProfile ?? {}
  if (!Number.isFinite(radius) || !Number.isFinite(eyeClearance)
    || Math.abs(radius - NAVIGATOR_RADIUS) > EPS || Math.abs(eyeClearance - NAVIGATOR_EYE_CLEARANCE) > EPS) {
    throw new Error(`房间室外行走适配失败：模板 walkProfile（radius=${radius}，eyeClearance=${eyeClearance}）必须是有限数且等于现有导航的 0.26／1.9；不改导航支持可变人物尺寸，请修正模板。`)
  }
  const wallThickness = assertOutdoorRoomGeometry(template)
  const doorCollider = toDoorCollider(options)

  const { minX: wx0, maxX: wx1, minZ: wz0, maxZ: wz1 } = OUTDOOR_SITE.walkBounds
  const { minX: sx0, maxX: sx1, minZ: sz0, maxZ: sz1 } = OUTDOOR_SITE.supportBounds
  const outdoorSpaceId = `outdoor:${assembly.roomId}`
  // spaces 室内在前：locate 按顺序优先返回室内，室外项是有意覆盖室内的回退范围，
  // 不是第二间业务房间。entry 指室外项＝运行时门外开局；assembly.spawn（室内摆放
  // 校验的出生点）原样保留，不受本函数影响。
  return {
    model: {
      spaces: [
        { id: assembly.roomId, y: ROOM_FLOOR_Y, height: ROOM_HEIGHT, bounds: { x0: OUTDOOR_INNER_X0, x1: OUTDOOR_INNER_X1, z0: OUTDOOR_INNER_Z0, z1: OUTDOOR_INNER_Z1 } },
        { id: outdoorSpaceId, y: ROOM_FLOOR_Y, height: ROOM_HEIGHT, bounds: { x0: wx0, x1: wx1, z0: wz0, z1: wz1 } },
      ],
      entry: { spaceId: outdoorSpaceId, x: OUTDOOR_SITE.spawn.x, y: ROOM_FLOOR_Y, z: OUTDOOR_SITE.spawn.z },
    },
    presentation: {
      // 一张 flat 行走面盖住支撑面（含室内投影）：室内外地坪同高，没有台阶；室内
      // 外的分界只由墙壳碰撞表达，不由行走面断口表达。
      surfaces: [{ kind: 'flat', y: ROOM_FLOOR_Y, bounds: { x0: sx0, x1: sx1, z0: sz0, z1: sz1 } }],
      colliders: [
        ...toFurnitureColliders(assembly).map((collider) => ({ ...collider, kind: 'furniture' })),
        ...toFixtureColliders(template).map((collider) => ({ ...collider, kind: 'fixture' })),
        ...toWallColliders(wallThickness),
        doorCollider,
        ...toBoundaryColliders(),
      ],
    },
    site: {
      floorY: OUTDOOR_SITE.floorY,
      walkBounds: { minX: wx0, maxX: wx1, minZ: wz0, maxZ: wz1 },
      supportBounds: { minX: sx0, maxX: sx1, minZ: sz0, maxZ: sz1 },
      spawn: { x: OUTDOOR_SITE.spawn.x, y: ROOM_FLOOR_Y, z: OUTDOOR_SITE.spawn.z },
    },
  }
}

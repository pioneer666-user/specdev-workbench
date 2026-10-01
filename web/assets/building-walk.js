// 建筑漫游的两块纯逻辑，都不碰 Three.js，也不读页面布局：
//   1) createNavigator：只消费服务端算好的 present.surfaces（行走面）与 present.colliders
//      （实心盒 AABB），判定脚下的支撑与撞墙。规则与阈值迁移自实验
//      `experiments/2026-09-23-json房子生成器/navigation.mjs`（已验证的漫游手感）：
//      每一小步只接受高度连续的支撑面、两脚周围（含斜向）都要有支撑、撞墙时不限步长地按轴滑动。
//   2) createWalkInput：键盘（WASD／方向键／Shift 加速）、屏幕方向按钮、拖动环顾的输入状态机；
//      失焦与页面隐藏立即清空，松开按键才算停止移动。
// 相机与场景装配在 building-scene.js；本模块 Node 与 jsdom 都能直接 import 测试。

const EPS = 1e-6
const contains = (b, x, z) => x >= b.x0 - EPS && x <= b.x1 + EPS && z >= b.z0 - EPS && z <= b.z1 + EPS

/**
 * 行走判定。位置是脚底坐标（x, y, z）：y 是当前站立面的高度，不是眼睛高度。
 * 返回 move(position, dx, dz)（撞墙/悬空则原地不动）、locate(position)（所在空间或 null）、
 * canStand(position) 与半径 radius。
 */
export function createNavigator(model, presentation) {
  const radius = 0.26
  const eyeClearance = 1.9
  const { surfaces, colliders } = presentation

  /** 该平面位置上所有行走面的高度（楼梯面按沿线进度插值）。 */
  function heights(x, z) {
    return surfaces
      .filter((surface) => contains(surface.bounds, x, z))
      .map((surface) => ({
        surface,
        y:
          surface.kind === 'flat'
            ? surface.y
            : surface.from.y +
              Math.max(0, Math.min(1, ((x - surface.from.x) * surface.ux + (z - surface.from.z) * surface.uz) / surface.length)) * surface.rise,
      }))
  }

  /** 每一步只接受与当前高度连续的支撑面：不按最高楼板吸附，也不会突然吸到上一层。 */
  function support(x, z, previousY) {
    return heights(x, z)
      .filter((value) => Math.abs(value.y - previousY) <= 0.14 + EPS)
      .sort((a, b) => Math.abs(a.y - previousY) - Math.abs(b.y - previousY))[0]
  }

  /** 站位可用：躯干高度内不撞实心盒，且两脚周围都有支撑（相邻空间共边时不留下看不见的台阶）。 */
  function clear(x, y, z) {
    for (const box of colliders) {
      if (box.y1 <= y + 0.09 || box.y0 >= y + eyeClearance) continue
      const qx = Math.max(box.x0, Math.min(x, box.x1))
      const qz = Math.max(box.z0, Math.min(z, box.z1))
      if ((x - qx) ** 2 + (z - qz) ** 2 < radius ** 2 - EPS) return false
    }
    for (const [dx, dz] of [
      [radius, 0], [-radius, 0], [0, radius], [0, -radius],
      [radius * 0.707, radius * 0.707], [-radius * 0.707, radius * 0.707],
      [radius * 0.707, -radius * 0.707], [-radius * 0.707, -radius * 0.707],
    ]) {
      if (!heights(x + dx, z + dz).some((value) => Math.abs(value.y - y) <= radius + 0.02)) return false
    }
    return true
  }

  function step(position, dx, dz) {
    const x = position.x + dx
    const z = position.z + dz
    const next = support(x, z, position.y)
    return next && clear(x, next.y, z) ? { x, y: next.y, z } : position
  }

  /** 走一小段：拆成不超过 0.06 米的子步，撞墙时按轴各试一次（贴着墙滑，不穿过去）。 */
  function move(position, dx, dz) {
    if (![position.x, position.y, position.z, dx, dz].every(Number.isFinite)) throw new TypeError('漫游坐标与位移必须是有限数值。')
    const distance = Math.hypot(dx, dz)
    // 单次超长位移不是行走，禁止不受限分步；目录定位由页面明确处理。
    if (distance > 30) throw new RangeError('单次行走位移不得超过 30 米。')
    const count = Math.max(1, Math.ceil(distance / 0.06))
    let point = { x: position.x, y: position.y, z: position.z }
    for (let i = 0; i < count; i += 1) {
      const next = step(point, dx / count, dz / count)
      if (next !== point) point = next
      else {
        point = step(point, dx / count, 0)
        point = step(point, 0, dz / count)
      }
    }
    return point
  }

  /** 所在空间：高度对上（脚底与空间地坪差 0.06 米内）且平面落在其轮廓里；楼梯上返回 null。 */
  function locate(position) {
    return model.spaces.find((space) => Math.abs(space.y - position.y) < 0.06 && contains(space.bounds, position.x, position.z)) || null
  }

  return { move, locate, canStand: (point) => Boolean(support(point.x, point.z, point.y)) && clear(point.x, point.y, point.z), radius }
}

/** 入口落点：y 缺失时按所在空间的地坪补（与 locate 同一口径）；没有入口时返回 null。 */
export function entryPoint(model) {
  const entry = model?.entry
  if (!entry) return null
  const space = model.spaces?.find((item) => item.id === entry.spaceId)
  return { x: entry.x, y: entry.y ?? space?.y ?? 0, z: entry.z }
}

/** 看得见的实体构件才算挡住视线（与场景里"写深度才算挡住"的 0.6 门槛同口径：
 *  addBox 给 opacity ≥ 0.6 的构件开深度写入，也就是说它真的遮住了后面的东西）。 */
const OCCLUDING_OPACITY = 0.6

/**
 * 点牌子拾取的判定（纯函数；射线命中按距离从近到远传进来，每项 { kind, visible, opacity, spaceId }）。
 * 从近往远看：先撞上看得见的实体构件＝被挡住（不隔墙、不隔楼板点牌）；先撞上看得见的牌子才算点中。
 * 两条过滤缺一不可：
 *   ① Three.js 的射线不看 visible，而楼层剖看只改可见性——不过滤就能点中被剖看藏起来的牌子；
 *   ② 只拿牌子求交不打构件，就会隔着墙把隔壁房间、甚至另一层的门牌点开。
 * 半透明构件（玻璃 0.28、设计框架的薄墙 0.22 等）不当遮挡：看得见就点得到。
 */
export function pickSign(hits) {
  for (const hit of Array.isArray(hits) ? hits : []) {
    if (!hit || hit.visible === false) continue
    if (hit.kind === 'sign') return { spaceId: hit.spaceId ?? null }
    if ((hit.opacity ?? 1) >= OCCLUDING_OPACITY) return null
  }
  return null
}

/**
 * 出生点能不能站。蓝图校验只要求入口落在空间内并与边缘留 0.35 米，而墙体半厚加人物半径
 * 可能超过这个距离（例如墙厚 0.6 时门面墙占到 0.3＋0.26＝0.56 米）：这样的蓝图合法、
 * 设计框架下也没有实体墙，切到完整外观就会让入口与墙重叠——出生即卡死（每一步的落点
 * 都在墙里，走不动）。进探索与换表现都必须先过这一关。
 */
export function canSpawn(navigator, point) {
  return Boolean(point) && Boolean(navigator?.canStand({ x: point.x, y: point.y, z: point.z }))
}

/** 漫游按键：WASD 与方向键等价，Shift 加速。 */
export const WALK_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'ShiftLeft', 'ShiftRight']

const TYPING_TAGS = ['INPUT', 'TEXTAREA', 'SELECT']
const isTyping = (node) => Boolean(node) && (TYPING_TAGS.includes(node.tagName) || node.isContentEditable === true)

/**
 * 漫游输入状态机：只维护状态，不碰相机（场景每帧取用后施加到机位）。
 *   axis()            → { forward, right, fast }：键盘与屏幕方向按钮合并后的方向与加速；
 *                       停用期间一律报零（与 setEnabled 同一道闸，虚拟按键也不例外）
 *   takeLook()        → { yaw, pitch }：自上次取用以来拖动产生的环顾增量（弧度，俯仰夹取由场景做）
 *   press(code, down) → 屏幕方向按钮的虚拟按键；停用期间不记（读资料时按住方向按钮不许走动）
 *   setEnabled(bool)  → 只有漫游模式接收键盘与拖动；总览模式留给 OrbitControls，不抢指针。
 *                       关掉输入时把按住的键、虚拟按键与拖动一并清空
 *   clear() / dispose()
 * element 是三维画布（拖动环顾、聚焦），target 默认 window（键盘、失焦），document 取 visibilitychange。
 */
export function createWalkInput(element, { target = globalThis, lookPerPixel = 0.003 } = {}) {
  const doc = target.document ?? globalThis.document
  const held = new Set()
  const virtual = new Set()
  let enabled = false
  let drag = null
  let look = { yaw: 0, pitch: 0 }

  function keyDown(event) {
    if (!enabled || event.ctrlKey || event.altKey || event.metaKey) return
    // 正在输入框、下拉框里操作时不抢键；焦点在按钮或画布上照常生效。
    if (isTyping(event.target) || isTyping(doc?.activeElement)) return
    if (!WALK_KEYS.includes(event.code)) return
    held.add(event.code)
    event.preventDefault()
  }

  const keyUp = (event) => held.delete(event.code)

  function pointerDown(event) {
    if (!enabled || event.button !== 0) return
    element.focus?.({ preventScroll: true })
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY }
    element.setPointerCapture?.(event.pointerId)
  }

  function pointerMove(event) {
    if (!enabled || !drag || drag.id !== event.pointerId) return
    look.yaw -= (event.clientX - drag.x) * lookPerPixel
    look.pitch -= (event.clientY - drag.y) * lookPerPixel
    drag.x = event.clientX
    drag.y = event.clientY
  }

  function pointerUp(event) {
    if (!drag || drag.id !== event.pointerId) return
    drag = null
    if (element.hasPointerCapture?.(event.pointerId)) element.releasePointerCapture(event.pointerId)
  }

  // 丢焦点、切走页面、指针被系统取消：一律当"全部松开"，不让移动继续跑。
  function clear() {
    held.clear()
    virtual.clear()
    drag = null
    look = { yaw: 0, pitch: 0 }
  }

  const down = (code) => held.has(code) || virtual.has(code)

  element.addEventListener('pointerdown', pointerDown)
  element.addEventListener('pointermove', pointerMove)
  element.addEventListener('pointerup', pointerUp)
  element.addEventListener('pointercancel', clear)
  target.addEventListener('keydown', keyDown)
  target.addEventListener('keyup', keyUp)
  target.addEventListener('blur', clear)
  doc?.addEventListener('visibilitychange', clear)

  return {
    axis: () => (enabled
      ? {
        forward: Number(down('KeyW') || down('ArrowUp')) - Number(down('KeyS') || down('ArrowDown')),
        right: Number(down('KeyD') || down('ArrowRight')) - Number(down('KeyA') || down('ArrowLeft')),
        fast: down('ShiftLeft') || down('ShiftRight'),
      }
      : { forward: 0, right: 0, fast: false }),
    takeLook() {
      const value = look
      look = { yaw: 0, pitch: 0 }
      return value
    },
    press(code, down) {
      // 停用期间不收虚拟按键：键盘与拖动已经被 setEnabled 挡住，屏幕按钮必须走同一道闸，
      // 否则"读资料时暂停输入"只挡住一半（按住方向按钮仍会走）。
      if (!enabled) return
      if (down) virtual.add(code)
      else virtual.delete(code)
    },
    setEnabled(value) {
      enabled = value
      if (!value) clear()
    },
    clear,
    dispose() {
      clear()
      element.removeEventListener('pointerdown', pointerDown)
      element.removeEventListener('pointermove', pointerMove)
      element.removeEventListener('pointerup', pointerUp)
      element.removeEventListener('pointercancel', clear)
      target.removeEventListener('keydown', keyDown)
      target.removeEventListener('keyup', keyUp)
      target.removeEventListener('blur', clear)
      doc?.removeEventListener('visibilitychange', clear)
    },
  }
}

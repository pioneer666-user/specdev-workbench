// 独立房间 · 行走会话（P1c-2c-1）：把真实门句柄、室外导航快照与人物脚底位置交给
// 一个小模块管理；页面按钮与渲染循环只与会话对话，不各自直改底座门。会话只做状态
// 与事务：不导入 Three.js、不访问 DOM、不建帧循环／定时器／事件监听，也不管相机
// 朝向、键盘输入、速度或 dt（下一单场景负责把输入换算成世界位移）。
// 导航与碰撞全部复用现有模块：buildRoomOutdoorWalkData 做数据翻译，原版
// building-walk 的 createNavigator／entryPoint 做判定，本模块零复制、零改造；
// 人物脚底位置来自导航入口，不把坐标再写死一份。
// 门开合是同步事务（无 await、无动画、无中途通知，渲染循环不会看见候选的临时门
// 姿态）：先在内存把真实门切到目标端点、取真实世界包围盒重建候选导航，用候选
// canStand 检查人物当前站位（整体半径与躯干净高，不是点是否在盒内）；站得住才
// 提交，站不住立即恢复门端点并继续用旧导航，人物位置全程不动。本轮门只在 0°／
// 90° 两端点瞬时切换、不做动画；将来加开门动画须另做扫掠碰撞，不能沿用端点检查。

import { buildRoomOutdoorWalkData } from './navigation.js'
import { createNavigator, entryPoint } from '../building-walk.js'

/** 门句柄检查：三个方法齐全且当前关闭；会话不擅自改变调用者已有的门姿态。 */
function assertDoorHandle(door) {
  if (!door || typeof door !== 'object') {
    throw new Error('房间行走会话失败：缺少 door——会话需要真实底座返回的门句柄（setOpen／isOpen／getBounds），不接受门盒快照或 Three.js 对象。')
  }
  for (const method of ['setOpen', 'isOpen', 'getBounds']) {
    if (typeof door[method] !== 'function') {
      throw new Error(`房间行走会话失败：门句柄缺少 ${method} 方法，不是完整的真实门接口，会话无法安全地开关门。`)
    }
  }
  if (door.isOpen() !== false) {
    throw new Error('房间行走会话失败：会话只能从关闭的门开始（当前 isOpen() 为 true）。请以 { doorOpen: false } 创建底座后传入；会话不擅自改变调用者已有的门姿态。')
  }
}

/** 用门当前真实包围盒构建候选导航（数据适配＋原版导航器）；失败由调用方恢复门。 */
function buildNavFromDoor(template, assembly, door) {
  const data = buildRoomOutdoorWalkData(template, assembly, { doorBounds: door.getBounds() })
  return { data, nav: createNavigator(data.model, data.presentation) }
}

/**
 * 建立一次行走会话。调用前提：template 与 assembly 来自成功的真实 validatePlacement，
 * door 是以 { doorOpen: false } 创建的真实底座门句柄。返回：
 *   getState()                    → { mode, position:{x,y,z}, doorOpen, spaceId } 新快照
 *   setMode('walk'|'overview')    → 切模式返回新状态；总览不移动，回行走不重新出生
 *   move(dx,dz)                   → 世界 X/Z 位移；仅 walk 模式生效，撞墙滑动由原导航决定
 *   setDoorOpen(boolean)          → { ok, code, message, state }；人物挡目标门板时
 *                                   code='door-blocked-by-player'，非法参数抛中文错误
 * 没有传送、任意 setPosition 或“撞墙重生”接口；底座资源释放仍归场景所有。
 */
export function createRoomWalkSession({ template, assembly, door } = {}) {
  if (!template || !assembly) {
    throw new Error('房间行走会话失败：需要同时提供 template 与 assembly（来自成功的真实 validatePlacement），会话不重新推算家具、门盒或场地边界。')
  }
  assertDoorHandle(door)

  let current = buildNavFromDoor(template, assembly, door)
  const entry = entryPoint(current.data.model)
  if (!entry || !current.nav.canStand({ x: entry.x, y: entry.y, z: entry.z })) {
    throw new Error(`房间行走会话失败：门外出生点（${entry ? `${entry.x}, ${entry.y}, ${entry.z}` : '模型缺少 entry'}）在当前门姿态下不可站立，会话拒绝在不成立的场地上开局。`)
  }
  let mode = 'walk'
  let position = { x: entry.x, y: entry.y, z: entry.z }

  /** 每次新构造的快照：外部修改快照不影响会话内部状态。 */
  function snapshot() {
    return {
      mode,
      position: { x: position.x, y: position.y, z: position.z },
      doorOpen: door.isOpen(),
      spaceId: current.nav.locate(position)?.id ?? null,
    }
  }

  return {
    getState: snapshot,

    setMode(nextMode) {
      if (nextMode !== 'walk' && nextMode !== 'overview') {
        throw new Error(`房间行走会话失败：setMode 只接受 walk／overview，收到「${String(nextMode)}」；行走与总览的切换不改变人物站位。`)
      }
      mode = nextMode
      return snapshot()
    },

    move(dx, dz) {
      if (!Number.isFinite(dx) || !Number.isFinite(dz)) {
        throw new Error(`房间行走会话失败：move 的位移必须是有限数（收到 dx=${String(dx)}，dz=${String(dz)}）。`)
      }
      const distance = Math.hypot(dx, dz)
      if (distance > 30) {
        throw new Error(`房间行走会话失败：move 的单次位移不得超过 30 米（收到 ${distance} 米）；目录定位等跳转不归会话管。`)
      }
      if (mode === 'walk') {
        const next = current.nav.move(position, dx, dz)
        position = { x: next.x, y: next.y, z: next.z }
      }
      return snapshot()
    },

    setDoorOpen(open) {
      if (typeof open !== 'boolean') {
        throw new Error(`房间行走会话失败：setDoorOpen 只接受 boolean（收到「${String(open)}」）。`)
      }
      const previous = door.isOpen()
      if (open === previous) {
        return { ok: true, code: 'ok', message: `门已经是${open ? '打开' : '关闭'}状态，无需切换。`, state: snapshot() }
      }
      // 事务主体：真实门切到目标端点 → 真实包围盒重建候选导航 → 站位检查。
      // 构造中途任何异常都先恢复门原端点、保留旧导航与人物状态，再抛中文错误，
      // 不留下半次成功。开门与关门对称检查；总览模式同样检查保留的行走站位。
      let candidate = null
      try {
        door.setOpen(open)
        candidate = buildNavFromDoor(template, assembly, door)
      } catch (error) {
        let restoreFailure = null
        try {
          door.setOpen(previous)
        } catch (restoreError) {
          restoreFailure = restoreError
        }
        if (restoreFailure) {
          throw new Error(`房间行走会话失败：门切到${open ? '打开' : '关闭'}端点后构造导航失败（${error.message}），且恢复门原端点也失败（${restoreFailure.message}）；人物位置与导航保持原状，请检查底座门状态。`)
        }
        throw new Error(`房间行走会话失败：门切到${open ? '打开' : '关闭'}端点后构造导航失败（${error.message}）；门已恢复${previous ? '打开' : '关闭'}端点，人物位置与导航保持原状。`)
      }
      if (candidate.nav.canStand({ x: position.x, y: position.y, z: position.z })) {
        current = candidate
        return { ok: true, code: 'ok', message: `门已${open ? '打开' : '关闭'}，导航与碰撞已按新的门姿态重建。`, state: snapshot() }
      }
      door.setOpen(previous)
      return {
        ok: false,
        code: 'door-blocked-by-player',
        message: `人物当前位置与${open ? '打开' : '关闭'}后的门板重叠，请先挪开人物再${open ? '开' : '关'}门；门与导航保持原状。`,
        state: snapshot(),
      }
    },
  }
}

// 独立房间的行走帧推进（P1c-2c-2）：把已验收的行走会话（walk-session.js）、
// 原版输入器（building-walk.js 的 createWalkInput）与一台 Three 相机接成"每帧一步"。
// 只做状态推进与相机同步，不建动画循环、不建第二套会话、不碰 DOM——
// 渲染循环由 room-scene.js 的 renderer.setAnimationLoop 驱动，本模块只提供 frame()。
// 相机由调用方传入并直接读写其 position／rotation（YXZ 欧拉），本模块不导入 Three.js，
// Node 测试可直连。参数与旧建筑页手感一致：眼高 1.65、视场 66、步行 2.6 m/s、
// Shift 4.6 m/s、俯仰限 ±0.44π；帧间隔超过 0.05 秒按 0.05 截断，时钟重置后首帧 dt=0
// （页面隐藏／往返缓存／切模式回来，不把离开的时间算成位移）。

export const EYE_HEIGHT = 1.65
export const WALK_FOV = 66
export const PITCH_LIMIT = Math.PI * 0.44
export const WALK_SPEED = 2.6
export const WALK_RUN_SPEED = 4.6
export const MAX_FRAME_DT = 0.05

/** 从 from 看向 to 的 yaw（Three 相机面向局部 -Z）：门外出生看向门中心应得 ±π。 */
export function lookYawToward(from, to) {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z))
}

/**
 * 建一个行走帧推进器。session 是人物位置与门开合的唯一来源；input 只需提供
 * 原版输入器的 axis()／takeLook() 两个读法（测试可用同形小桩）。
 * 每帧：先应用环顾增量，再用新 yaw 算本帧位移交 session.move，最后把相机
 * 同步到脚底＋眼高。位移公式与旧建筑页一致，斜向输入按长度归一。
 */
export function createWalkFrame({ session, input, camera, yaw = 0, pitch = 0 } = {}) {
  let lastTime = null

  function frame(timeMs) {
    const seconds = Number(timeMs) / 1000
    const dt = lastTime === null || !Number.isFinite(seconds)
      ? 0
      : Math.min(Math.max(seconds - lastTime, 0), MAX_FRAME_DT)
    if (Number.isFinite(seconds)) lastTime = seconds

    const lookDelta = input.takeLook()
    yaw += lookDelta.yaw
    pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch + lookDelta.pitch))

    const { forward, right, fast } = input.axis()
    const length = Math.hypot(forward, right)
    if (length > 0) {
      const step = dt * (fast ? WALK_RUN_SPEED : WALK_SPEED)
      session.move(
        (-Math.sin(yaw) * forward + Math.cos(yaw) * right) / length * step,
        (-Math.cos(yaw) * forward - Math.sin(yaw) * right) / length * step,
      )
    }

    const state = session.getState()
    camera.position.set(state.position.x, state.position.y + EYE_HEIGHT, state.position.z)
    camera.rotation.set(pitch, yaw, 0, 'YXZ')
  }

  return {
    frame,
    /** 丢掉计时基线：下一帧 dt=0。页面隐藏／往返缓存恢复／切模式后调用。 */
    resetClock() { lastTime = null },
    /** 当前保存的行走视线（总览期间不被覆盖，恢复行走继续用）。 */
    getLook() { return { yaw, pitch } },
  }
}

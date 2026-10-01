// 独立房间的阅读暂停闸门（E3b-1）：阅读开始时停住场景的全部操作输入，
// 阅读结束后仍在原模式、原位置、原视线继续。动画氛围与渲染由场景照常推进，
// 本模块不冻结画面。只协调输入与帧推进——不读配置、不访问文档、不计算碰撞、
// 不保存第二份人物位置、不建 Three 渲染器；站位与视线始终留在会话／帧推进器，
// 模式始终由场景函数切换（本模块只按 getMode() 读，不改模式）。
//
// 为什么不能只在页面遮住画面或隐藏按钮：键盘监听仍在（WASD 会继续走动）；
// OrbitControls 的 enabled=false 也拦不住程序继续 update() 推进阻尼——
// r186 的 update 不检查 enabled。因此暂停做三件事：
//   1) 输入器 setEnabled(false)（键盘／拖动／虚拟按键同一道闸）＋clear＋resetClock；
//   2) OrbitControls disconnect() 结束未完成手势并拆监听，随后用公开接口
//      消耗残余阻尼并同步回原机位（见 pauseOverview 的步骤注释）；
//   3) 场景侧 pointerdown/up 在阅读中直接忽略；clearPick 在暂停时清掉未完成
//      拾取，恢复后不把暂停前的按下与恢复后的抬起拼成新点击。

/**
 * 建一个阅读暂停闸门。依赖均由场景传入：原版 createWalkInput 句柄、
 * 已创建并连接的 OrbitControls、行走帧推进器 walk-frame 句柄、读场景当前
 * 模式的 getMode（'walk'｜'overview'）、清掉未完成拾取的 clearPick。
 * 返回 { setReading, isReading, syncMode, advance, dispose }。
 */
export function createRoomReadingGate({ input, controls, walkFrame, getMode, clearPick }) {
  let reading = false
  let disposed = false
  // 场景创建 controls 时构造函数已自动 connect；这里只记录是否由本闸门断开，
  // 恢复时按记录重连原 domElement，避免重复连接。
  let controlsConnected = true

  /** 总览机位快照：相机 position／quaternion／zoom 与 controls.target（暂停前后保持）。 */
  function snapshotCamera() {
    const camera = controls.object
    return {
      position: camera.position.clone(),
      quaternion: camera.quaternion.clone(),
      zoom: camera.zoom,
      target: controls.target.clone(),
    }
  }

  function restoreCamera(snapshot) {
    const camera = controls.object
    camera.position.copy(snapshot.position)
    camera.quaternion.copy(snapshot.quaternion)
    camera.zoom = snapshot.zoom
    camera.updateProjectionMatrix?.()
    controls.target.copy(snapshot.target)
  }

  /**
   * 停住总览操作并清掉残余运动，全程同步执行、不渲染中间机位：
   *  1. 保存机位与设置 → enabled=false → disconnect()（结束未完成手势、
   *     清指针列表，r186 的 disconnect 会拆监听并把 state 置回 NONE）；
   *  2. 暂时关掉 autoRotate／enableDamping，update() 一次——无阻尼分支会把
   *     残余旋转／平移一次应用并在末尾清零，缩放比例重置；残余消耗在临时机位上；
   *  3. 相机恢复到保存的机位，再以无阻尼／无自动旋转 update() 一次，让控制器
   *     的内部球坐标与原机位重新对齐——此后没有任何可推进的残余；
   *  4. 恢复原 enableDamping／autoRotate 设置。只用公开接口，不读写私有字段，
   *     不调用 reset()／saveState()，不重建相机。
   */
  function pauseOverview() {
    const savedDamping = controls.enableDamping
    const savedAutoRotate = controls.autoRotate
    const snapshot = snapshotCamera()
    controls.enabled = false
    if (controlsConnected) {
      controls.disconnect()
      controlsConnected = false
    }
    controls.autoRotate = false
    controls.enableDamping = false
    controls.update() // 消耗残余运动（此步可能临时移动相机，不渲染）
    restoreCamera(snapshot)
    controls.update() // 从原机位重建控制器内部状态，无残余可推进
    controls.enableDamping = savedDamping
    controls.autoRotate = savedAutoRotate
  }

  /** 按当前模式与阅读状态设输入启用：walk 未阅读→行走进启用、总览停；
   *  overview 未阅读→OrbitControls 启用、行走停。阅读中一律停用。模式由场景切。 */
  function syncMode() {
    if (disposed) return
    if (reading) {
      input.setEnabled(false)
      controls.enabled = false
      return
    }
    if (getMode() === 'walk') {
      input.setEnabled(true)
      controls.enabled = false
    } else {
      input.setEnabled(false)
      controls.enabled = true
    }
  }

  /**
   * 暂停（true）或恢复（false）场景操作。重复设置同一值无副作用（不重新保存
   * 机位、不重复断开/连接监听）；非 boolean 明确抛参数错误且不改变状态。
   * 恢复不重置机位：总览机位在暂停时原样锁定，行走站位与视线一直在会话／
   * 帧推进器里；恢复只重连控制器、清空输入并重置计时（首帧 dt=0，不补阅读
   * 时长，阅读中按下的键不许在恢复后补算）。
   */
  function setReading(value) {
    if (disposed) return
    if (typeof value !== 'boolean') {
      throw new TypeError(`setReading 只接受布尔值（实际是 ${value === null ? 'null' : typeof value}）`)
    }
    if (value === reading) return
    reading = value
    if (value) {
      input.setEnabled(false) // 键盘／拖动／虚拟按键同一道闸，停用即清空
      input.clear()
      walkFrame.resetClock()
      clearPick?.()
      pauseOverview()
    } else {
      if (!controlsConnected) {
        controls.connect(controls.domElement)
        controlsConnected = true
      }
      input.clear()
      walkFrame.resetClock()
      syncMode()
    }
  }

  /** 场景渲染循环唯一的相机推进入口：阅读时两种推进都不做；
   *  非阅读时 walk 交帧推进器（人物与视线），overview 交 OrbitControls。 */
  function advance(now) {
    if (disposed || reading) return
    if (getMode() === 'walk') walkFrame.frame(now)
    else controls.update()
  }

  function isReading() {
    return !disposed && reading
  }

  /** 只使闸门失效并停用全部交互——含总览控制器：enabled=false 并主动断开已连接的
   *  监听（销毁自 overview／非阅读状态时鼠标事件不得再绕过失效的 advance 驱动它）；
   *  已在阅读中（先前已断开）则不重复主动断开。不调用 controls.dispose、不释放
   *  场景／渲染器／底座／家具——那些归场景的既有释放路径；不恢复相机、不重连、
   *  不改模式与站位。销毁后一切调用均为无操作，isReading 返回 false。 */
  function dispose() {
    if (disposed) return
    disposed = true
    reading = false
    input.setEnabled(false)
    controls.enabled = false
    if (controlsConnected) {
      controls.disconnect()
      controlsConnected = false
    }
  }

  return { setReading, isReading, syncMode, advance, dispose }
}

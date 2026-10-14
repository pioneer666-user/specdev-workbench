// 独立业务房间的三维场景（P1b-2 建骨架，P1c-2c-2 接行走）：底座、灯光、镜头与
// 渲染参数自 E2b 实验（2026-09-27-桌面承载与物品跟随）提取为产品模块，原实验不改。
// 本模块不重复摆放校验——只消费页面交来的 template 与 validatePlacement 的 assembly：
//   · 按 template.styleId 精确分派两套底座（ceramic／fairy），未知风格明确报错；
//   · 底座显式传 doorOpen:false（关门开局）；家具由页面先经 prepareRoomFurniture 异步
//     备好成批次（E4b-2），本模块同步整组挂入，调用瞬间接管批次的释放所有权；
//   · 家具平铺到场景根组：装配结果已含世界变换（含承载面高度 Y），不再叠加父桌变换。
// 行走（P1c-2c-2）：人物站位与门开合的唯一来源是 rooms/walk-session.js 的会话，
// 帧推进由 rooms/walk-frame.js 承担，输入复用原版 building-walk.js 的 createWalkInput。
// 两台相机分开——总览机位（OrbitControls）与行走视线互不覆盖；渲染、拾取、底座
// update（含反射）都用当前活动相机。主题决定亮度初值；亮度统一协调底座与灯光。
// 阅读暂停（E3b-1）：rooms/reading-gate.js 统一闸住输入、帧推进与总览控制器，
// setReading(true) 期间切模式/开门为无操作，渲染循环只经 gate.advance 推进相机。
import * as THREE from 'three'
export { createFurniturePreview } from './rooms/furniture-preview.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { createWalkInput } from './building-walk.js'
import { createCeramicRoom } from './rooms/ceramic-room.js'
import { createFairyRoom } from './rooms/fairy-room.js'
import { createBrightnessTransition } from './rooms/brightness.js'
import { createRoomLighting } from './rooms/room-lighting.js'
import { createRoomWalkSession } from './rooms/walk-session.js'
import { createWalkFrame, lookYawToward, WALK_FOV } from './rooms/walk-frame.js'
import { createRoomReadingGate } from './rooms/reading-gate.js'
import { createPickGesture } from './rooms/pick-gesture.js'
import { createSelectionHighlight } from './rooms/selection-highlight.js'
import { createFurnitureVisibility } from './rooms/furniture-visibility.js'
import { prepareRoomFurniture, findFurnitureInstance } from './rooms/furniture-assembly.js'
import { createMaterialHints, MATERIAL_HINT_LIMIT } from './rooms/material-hints.js'
import { createRoomWeather } from './rooms/weather.js'

// 页面经本模块动态入口进入 Three.js（E4b-2）：家具批次的准备与向上查找一并无须单独加载。
export { prepareRoomFurniture, findFurnitureInstance }

/** styleId → 底座工厂：两套已验收底座，其余风格不存在。 */
const ROOM_FACTORIES = { ceramic: createCeramicRoom, fairy: createFairyRoom }

/** 室外可见地面：低反光、顶面 Y=0、四块水平面拼出带室内空洞的连续外地面
 * （北／南条贯穿外宽，东／西条填中间两侧，不重叠、不盖室内地面与门槛）。
 * 只是视觉延伸——可走范围始终由会话里的隐形边界限制，这里不画任何边界线。 */
function buildOutdoorGround(styleId, template) {
  const outer = 60
  const hole = template.interiorBounds
  const material = new THREE.MeshStandardMaterial({
    name: styleId === 'fairy' ? '室外苔地' : '室外暖灰石地',
    color: styleId === 'fairy' ? '#8a9b74' : '#b7b1a3',
    roughness: 0.96,
    metalness: 0,
  })
  const group = new THREE.Group()
  group.name = 'room-outdoor-ground'
  const strip = (name, minX, maxX, minZ, maxZ) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(maxX - minX, maxZ - minZ), material)
    mesh.name = name
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set((minX + maxX) / 2, 0, (minZ + maxZ) / 2)
    mesh.receiveShadow = true
    group.add(mesh)
  }
  strip('室外地面·北', -outer, outer, -outer, hole.minZ)
  strip('室外地面·南', -outer, outer, hole.maxZ, outer)
  strip('室外地面·西', -outer, hole.minX, hole.minZ, hole.maxZ)
  strip('室外地面·东', hole.maxX, outer, hole.minZ, hole.maxZ)
  return group
}

/** 门所在墙外侧的抬高总览；人物出生点独立留在行走会话。 */
export function roomOverviewPose(template, aspect = 1) {
  const direction = { '+Z': [0, 1], '-Z': [0, -1], '+X': [1, 0], '-X': [-1, 0] }[template.entry.inward]
  if (!direction) throw new Error('入口缺少有效 inward 朝向')
  const door = template.entry.door, bounds = template.interiorBounds
  const target = { x: (bounds.minX + bounds.maxX) / 2, y: .9, z: (bounds.minZ + bounds.maxZ) / 2 }
  const fit = Math.max(1, 1 / Math.max(.15, aspect))
  return {
    position: { x: target.x + (door.centerX - direction[0] * 8.5 - target.x) * fit, y: target.y + (8.2 - target.y) * fit, z: target.z + (door.centerZ - direction[1] * 8.5 - target.z) * fit },
    target,
  }
}

/**
 * 拾取遮挡判定（纯函数，供测试直呼）：hits 为按距离排序的命中描述——
 * { kind:'furniture', visible, opacity, pick:{instanceId,assetId,name} } 或
 * { kind:'occluder', visible, opacity }。口径沿用旧建筑页 pickSign：
 * 隐藏祖先（含总览裁掉的墙）不参与；挡在前面的可见实体（不透明度 ≥0.6，
 * 磨砂窗玻璃 0.19／童话圆窗 0.46 都不算）截停，隔墙点不到家具。
 */
export function judgeRoomPick(hits) {
  for (const hit of Array.isArray(hits) ? hits : []) {
    if (!hit || hit.visible === false) continue
    if (hit.kind === 'furniture') return hit.pick ?? null
    if ((hit.opacity ?? 1) >= 0.6) return null
  }
  return null
}

/** 释放一组 Three.js 对象的几何与材质（含贴图）；中途失败与正常销毁共用。 */
function disposeGroup(group) {
  for (const child of [...group.children]) {
    child.traverse((node) => {
      node.geometry?.dispose?.()
      const material = node.material
      if (material) (Array.isArray(material) ? material : [material]).forEach((m) => { m.map?.dispose?.(); m.dispose?.() })
    })
    group.remove(child)
  }
}

/**
 * 建一个业务房间场景挂进 container。句柄：
 *   resetView()       切 overview 并恢复原总览机位；不改行走站位与视线；阅读期间无操作
 *   enterWalk()       切 walk，保留行走站位与视线；初次由按钮从总览进入；阅读期间无操作
 *   getWalkState()    会话的新状态快照，页面用它同步按钮与提示
 *   setDoorOpen(open) 只转交会话事务并返回其结果，不改真实门；阅读期间返回
 *                     { ok:false, code:'reading-active' }，不触碰门事务
 *   setReading(bool)  阅读暂停闸门（E3b-1）：true 停住全部场景操作（键盘、拖动、
 *                     总览控制器、拾取），false 后仍在原模式、原位置、原视线
 *   isReading()       闸门当前状态（销毁后恒 false）
 *   getMaterialHintsVisible()/setMaterialHintsVisible(bool) 本页资料图标选择，
 *                     隐藏/恢复只更新提示层；加载、阅读及冻结期不接受切换
 *   setPeriod('day'|'night')／dispose()
 * 场景／会话初始化失败沿用"清理后抛错"路径（页面展示失败原因），不退回无碰撞行走。
 */
export function createRoomScene({ container, template, assembly, furniture, materialHints = [], deferInput = false, brightness = 100, acceptance = false, onBrightnessChange = () => {}, onPick = () => {}, onRead = () => {}, onFurnitureDisplayChange = () => {}, onWalkMove = () => {}, onWalkReset = () => {} } = {}) {
  // styleId 取值必须在函数顶层：setPeriod 闭包引用它——不能随风格校验挪进 try 的块作用域
  const styleId = template?.styleId
  const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

  // 已创建的资源引用：releaseAll 对每一项判空，中途失败与正常销毁共用同一份清理。
  let renderer = null
  let scene = null
  let overviewCamera = null
  let walkCamera = null
  let controls = null
  let lighting = null
  let brightnessControl = null
  let room = null
  let furnitureBatch = null
  let furnitureGroup = null
  let outdoorGround = null
  let weather = null, weatherNight = 0
  let session = null
  let input = null
  let walkFrame = null
  let gate = null
  let observer = null
  let hints = null
  let highlight = null
  let furnitureDisplay = null
  let selectedInstance = null, acceptanceInput = null, acceptanceQuality = null
  let pageFocused = true
  let reading = false, controlFocused = false, settingsActive = false
  const gesture = createPickGesture()
  let acceptanceLock = false, acceptanceObserver = null
  const syncPause = () => gate?.setReading(reading || controlFocused || acceptanceLock)
  let disposed = false
  let loading = deferInput
  let pageFrozen = false
  let materialHintsVisible = true // 本页偏好独立于阅读/冻结等临时守卫，不持久化。
  let firstFrame = false
  let resolveReady, rejectReady
  const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject })
  // 同步构造抛错时句柄尚未交付；拒绝始终有处理者，页面仍 await 原始 Promise。
  ready.catch(() => {})
  let mode = 'overview' // 首帧即入口墙外总览；行走站位始终独立
  let overviewPose
  const canvasListeners = []
  const pageListeners = []

  function releaseAll() {
    if (disposed && !renderer) return
    disposed = true
    acceptanceObserver = null
    resolveReady(false)
    if (renderer) renderer.setAnimationLoop(null)
    observer?.disconnect()
    for (const { target, type, listener, capture = false } of canvasListeners) target.removeEventListener(type, listener, capture)
    canvasListeners.length = 0
    for (const { target, type, listener } of pageListeners) target.removeEventListener(type, listener)
    pageListeners.length = 0
    brightnessControl?.dispose()
    hints?.dispose()
    highlight?.dispose()
    furnitureDisplay?.dispose()
    gesture.cancel()
    gate?.dispose() // 先让阅读闸门失效，再走既有释放路径（不会重新启用输入或连接监听）
    input?.dispose()
    weather?.dispose()
    // 家具批次所有权在调用 createRoomScene 时已整体转交本场景：任何失败路径都由这里释放
    furnitureBatch?.dispose()
    if (outdoorGround) disposeGroup(outdoorGround)
    room?.dispose()
    lighting?.dispose()
    controls?.dispose()
    renderer?.dispose()
    if (renderer) renderer.domElement.remove()
    renderer = null
    scene = null
    overviewCamera = null
    walkCamera = null
    controls = null
    lighting = null
    brightnessControl = null
    room = null
    furnitureBatch = null
    furnitureGroup = null
    outdoorGround = null
    weather = null
    session = null
    input = null
    walkFrame = null
    gate = null
    observer = null
    hints = null
  }

  function resize() {
    if (disposed || !renderer) return
    const width = Math.max(1, container.clientWidth)
    const height = Math.max(1, container.clientHeight)
    renderer.setSize(width, height, false)
    for (const camera of [overviewCamera, walkCamera]) {
      if (!camera) continue
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }
    const pose = roomOverviewPose(template, width / height)
    const distance = Math.hypot(pose.position.x - pose.target.x, pose.position.y - pose.target.y, pose.position.z - pose.target.z)
    controls.maxDistance = Math.max(24, distance * 1.2)
    if (!firstFrame) {
      overviewCamera.position.set(pose.position.x, pose.position.y, pose.position.z)
      controls.target.set(pose.target.x, pose.target.y, pose.target.z)
      overviewCamera.lookAt(controls.target)
    }
  }

  /** 回到总览：恢复原总览机位；行走站位与视线原样保留在会话／帧推进器里。
   *  阅读期间为无操作（输入启停统一交闸门的 syncMode，不在这里直写）。 */
  function resetView() {
    if (disposed || loading || gate?.isReading()) return
    if (pageFrozen || document.hidden || !pageFocused) return
    session.setMode('overview')
    mode = 'overview'
    walkFrame.resetClock()
    overviewPose = roomOverviewPose(template, overviewCamera.aspect)
    overviewCamera.position.set(overviewPose.position.x, overviewPose.position.y, overviewPose.position.z)
    controls.target.set(overviewPose.target.x, overviewPose.target.y, overviewPose.target.z)
    controls.update()
    gate.syncMode()
    onFurnitureDisplayChange()
  }

  /** 继续行走：保留站位与视线，只切输入与相机；切模式清空计时避免切回来补算。
   *  阅读期间为无操作。 */
  function enterWalk() {
    if (disposed || loading || gate?.isReading()) return
    if (pageFrozen || document.hidden || !pageFocused) return
    session.setMode('walk')
    mode = 'walk'
    // 输入/活动相机生效前，清主动隐藏并同步实际模型、提示、高亮和清单。
    furnitureDisplay.restoreForWalk()
    onFurnitureDisplayChange()
    walkFrame.resetClock()
    renderer.domElement.focus({ preventScroll: true })
    gate.syncMode()
  }

  function applyBrightness(value) {
    brightnessControl.set(value)
    onBrightnessChange(brightnessControl.get())
    return true
  }
  function setBrightness(value) {
    if (disposed || loading || gate?.isReading()) return false
    return applyBrightness(value)
  }
  // 只允许首个成功主画面前更新主题初值，场景已呈现就冻结本次会话。
  function setInitialBrightness(value) {
    if (disposed || firstFrame) return false
    brightnessControl.set(value, true)
    return true
  }
  // 保留旧场景/实验两端调用；页面已删除旧独立昼夜入口。
  function setPeriod(period) { return setBrightness(period === 'night' ? 0 : 100) }

  try {
    // 参数与风格校验也在 try 内（E4b-2）：批次所有权自调用瞬间转交——先验批次并接管，
    // 风格未知、renderer 或行走会话创建失败同样走到 releaseAll 释放家具，不留隐藏的旧工厂路径。
    if (!furniture || !furniture.group || typeof furniture.dispose !== 'function') {
      throw new Error('缺少有效的家具批次（furniture：{ group, dispose }）——请先经 prepareRoomFurniture 准备')
    }
    furnitureBatch = furniture
    overviewPose = roomOverviewPose(template)
    const roomFactory = ROOM_FACTORIES[styleId]
    if (!roomFactory) throw new Error(`未知房间风格：${String(styleId)}（现有：ceramic、fairy）`)
    renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.domElement.tabIndex = 0
    renderer.domElement.setAttribute('aria-label', '房间视图：WASD 或方向键行走、Shift 加速、拖动环视；回到总览后拖动旋转、滚轮缩放；点击家具查看身份')
    if (acceptance) {
      const gl=renderer.getContext?.(),debug=gl?.getExtension('WEBGL_debug_renderer_info')
      acceptanceQuality={reducedMotion,antialias:gl?.getContextAttributes()?.antialias??null,shadowType:renderer.shadowMap.type,toneMapping:renderer.toneMapping,
        renderer:gl?gl.getParameter(debug?debug.UNMASKED_RENDERER_WEBGL:gl.RENDERER):null,vendor:gl?gl.getParameter(debug?debug.UNMASKED_VENDOR_WEBGL:gl.VENDOR):null}
    }
    container.append(renderer.domElement)

    scene = new THREE.Scene()
    overviewCamera = new THREE.PerspectiveCamera(40, 1, 0.1, 150)
    controls = new OrbitControls(overviewCamera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.065
    controls.minDistance = 6
    controls.maxDistance = 24
    controls.minPolarAngle = 0.22
    controls.maxPolarAngle = Math.PI * 0.49
    controls.enablePan = false
    walkCamera = new THREE.PerspectiveCamera(WALK_FOV, 1, 0.1, 150)

    lighting = createRoomLighting(renderer, scene)
    room = roomFactory({ renderer, scene, reducedMotion, doorOpen: false })
    scene.add(room.group)
    brightnessControl = createBrightnessTransition({ style: styleId, initial: brightness, reducedMotion,
      apply: (params) => { weatherNight = params.nightMix; lighting.applyBrightness(styleId, params); room.applyBrightness?.(params) },
    })

    // 家具批次（E4b-2）：模型由页面先经 prepareRoomFurniture 异步备好，这里只整组挂进
    // 场景——不再内置模型工厂循环；位置/朝向已在批次内按 assembly 世界坐标摆好。
    furnitureGroup = furnitureBatch.group
    scene.add(furnitureGroup)
    if (acceptance) acceptanceInput={templateId:template.templateId,instances:furnitureGroup.children.map(owner=>({instanceId:owner.userData.instanceId,
      assetId:assembly.instances.find(item=>item.instanceId===owner.userData.instanceId)?.assetId,position:owner.position.toArray(),rotation:owner.rotation.toArray(),scale:owner.scale.toArray()}))}
    highlight = createSelectionHighlight(scene, furnitureGroup)
    const originalVisibility = new Map(furnitureGroup.children.map(owner => [owner, owner.visible]))
    furnitureDisplay = createFurnitureVisibility({ instances: assembly.instances,
      canChange: () => !disposed && !loading && !pageFrozen && pageFocused && !document.hidden && !reading && mode === 'overview',
      onChange: () => {
        for (const owner of furnitureGroup.children) owner.visible = originalVisibility.get(owner) && !furnitureDisplay.getState(owner.userData.instanceId).hidden
        gesture.cancel(); hints?.cancelGesture()
        highlight.refresh(); hints?.update()
        onFurnitureDisplayChange()
      },
    })

    outdoorGround = buildOutdoorGround(styleId, template)
    scene.add(outdoorGround)
    weather = createRoomWeather({ scene, renderer, template, groundColor: outdoorGround.children[0].material.color })

    // 行走会话：人物站位、walk／overview 模式与门开合事务的唯一来源（P1c-2c-1 模块）。
    session = createRoomWalkSession({ template, assembly, door: room.door })
    session.setMode('overview')
    input = createWalkInput(renderer.domElement)
    const spawn = session.getState().position
    const doorCenter = template.entry.door
    walkFrame = createWalkFrame({
      session,
      input,
      camera: walkCamera,
      onMove: onWalkMove,
      onReset: onWalkReset,
      yaw: lookYawToward(spawn, { x: doorCenter.centerX, z: doorCenter.centerZ }),
    })

    // 阅读暂停闸门（E3b-1）：input、walkFrame、controls 就绪后创建；getMode 只读
    // 现有 mode，不另建一套 walk/overview 状态。未完成拾取记录放在 clearPick 可
    // 访问的同一作用域，暂停时由闸门清掉——恢复后不把暂停前的按下与恢复后的
    // 抬起拼成新点击；阅读中的按下/抬起在下方监听器里直接忽略。
    gate = createRoomReadingGate({
      input,
      controls,
      walkFrame,
      getMode: () => mode,
      clearPick: gesture.cancel,
    })

    // 点击家具：完整手势移出 6px 即拒绝，即使抬起时回到原位；取消清掉记录。
    // 候选＝家具网格＋四面墙组（含门框、门扇——门是墙组的活动子树），
    // 由 judgeRoomPick 按距离与可见性裁决：总览裁掉的墙不遮挡，磨砂玻璃不遮挡。
    const raycaster = new THREE.Raycaster()
    const canPick = () => !disposed && !loading && !pageFrozen && !document.hidden && !gate.isReading()
    const onPointerDown = (event) => {
      if (disposed || loading || pageFrozen || document.hidden || reading) return
      controlFocused = false; syncPause()
      if (!canPick()) return
      gesture.down(event)
    }
    const onPointerCancel = gesture.cancel
    const onPointerMove = event => { if (canPick()) gesture.move(event); else gesture.cancel() }
    const effectivelyVisible = (object) => {
      for (let node = object; node; node = node.parent) if (!node.visible) return false
      return true
    }
    // 原拾取对象集合与不透明度口径共用；世界包围盒只在装配后计算一次。
    const pickTargets = [...furnitureGroup.children, ...room.walls.map((wall) => wall.group)]
    furnitureGroup.updateMatrixWorld(true)
    const hintItems = materialHints.slice(0, MATERIAL_HINT_LIMIT).flatMap((item) => {
      const owner = furnitureGroup.children.find((child) => child.userData.instanceId === item.instanceId)
      if (!owner) return []
      const anchor = new THREE.Box3().setFromObject(owner).getCenter(new THREE.Vector3())
      return [{ instanceId: item.instanceId, title: item.title ?? owner.userData.name, owner, anchor, pick: { ...owner.userData } }]
    })
    const projected = new THREE.Vector3(), cameraPosition = new THREE.Vector3(), direction = new THREE.Vector3()
    const projectHint = (item) => {
      const camera = mode === 'walk' ? walkCamera : overviewCamera
      if (!camera || !effectivelyVisible(item.owner)) return { visible: false }
      camera.updateMatrixWorld()
      projected.copy(item.anchor).project(camera)
      if (projected.z < -1 || projected.z > 1 || Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1) return { visible: false }
      camera.getWorldPosition(cameraPosition)
      direction.copy(item.anchor).sub(cameraPosition)
      const distance = direction.length()
      // 每个标记每帧最多一条射线；按钮点击再次核当前相机，不能借避让绕过遮挡。
      raycaster.set(cameraPosition, direction.normalize())
      raycaster.camera = camera
      for (const hit of raycaster.intersectObjects(pickTargets, true)) {
        if (hit.distance >= distance - 0.001) break
        if (!effectivelyVisible(hit.object)) continue
        const owner = findFurnitureInstance(hit.object, furnitureGroup)
        if (owner === item.owner) continue
        const material = Array.isArray(hit.object.material) ? hit.object.material[0] : hit.object.material
        if (owner || !material?.transparent || material.opacity >= 0.6) return { visible: false }
      }
      return { visible: true, x: (projected.x + 1) * container.clientWidth / 2, y: (1 - projected.y) * container.clientHeight / 2 }
    }
    hints = hintItems.length ? createMaterialHints({ container, items: hintItems, project: projectHint,
      canInteract: () => materialHintsVisible && !disposed && !loading && !pageFrozen && !document.hidden && !reading,
      clearInput: () => { input.clear(); walkFrame.resetClock(); gesture.cancel() },
      onOpen: onRead, focusFallback: renderer.domElement,
    }) : null
    const onPointerUp = (event) => {
      if (!canPick()) { gesture.cancel(); return }
      if (!gesture.up(event)) return
      const rect = renderer.domElement.getBoundingClientRect()
      raycaster.setFromCamera(
        new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1),
        mode === 'walk' ? walkCamera : overviewCamera,
      )
      const hits = raycaster.intersectObjects(pickTargets, true).map((hit) => {
        const material = Array.isArray(hit.object.material) ? hit.object.material[0] : hit.object.material
        const opacity = material?.transparent ? material.opacity : 1
        const owner = findFurnitureInstance(hit.object, furnitureGroup) // 书板/书脊/藤叶命中都归所属书架实例
        return owner
          ? { kind: 'furniture', visible: effectivelyVisible(hit.object), opacity, pick: { instanceId: owner.userData.instanceId, assetId: owner.userData.assetId, name: owner.userData.name } }
          : { kind: 'occluder', visible: effectivelyVisible(hit.object), opacity }
      })
      const picked = judgeRoomPick(hits)
      onPick(picked)
    }
    // 原输入器/Orbit 收到按下之前解除控件暂停，让返回画布的首次拖动完整成立。
    renderer.domElement.addEventListener('pointerdown', onPointerDown, true)
    renderer.domElement.addEventListener('pointerup', onPointerUp)
    renderer.domElement.addEventListener('pointercancel', onPointerCancel)
    renderer.domElement.addEventListener('pointermove', onPointerMove)
    renderer.domElement.addEventListener('wheel', onPointerCancel)
    renderer.domElement.addEventListener('lostpointercapture', onPointerCancel)
    canvasListeners.push(
      { target: renderer.domElement, type: 'pointerdown', listener: onPointerDown, capture: true },
      { target: renderer.domElement, type: 'pointerup', listener: onPointerUp },
      { target: renderer.domElement, type: 'pointercancel', listener: onPointerCancel },
      { target: renderer.domElement, type: 'pointermove', listener: onPointerMove },
      { target: renderer.domElement, type: 'wheel', listener: onPointerCancel },
      { target: renderer.domElement, type: 'lostpointercapture', listener: onPointerCancel },
    )

    // 页面隐藏／失焦时输入器自会清空；这里再把帧计时基线一并重置，
    // 往返缓存（pagehide persisted=true 只冻结）恢复后首帧 dt=0，不把离开的时间算成位移。
    const pauseForFreeze = () => {
      gesture.cancel()
      hints?.cancelGesture()
      input.clear()
      walkFrame.resetClock()
      brightnessControl.resetClock()
      weather?.setActive(!pageFrozen && !document.hidden && pageFocused)
    }
    const onVisibilityChange = () => pauseForFreeze()
    const onPageHide = () => { pageFrozen = true; pauseForFreeze(); hints?.update() }
    const onPageShow = () => { pageFrozen = false; pauseForFreeze(); hints?.update(); onFurnitureDisplayChange() }
    const onBlur = () => { pageFocused = false; pauseForFreeze(); onFurnitureDisplayChange() }
    const onFocus = () => { pageFocused = true; pauseForFreeze(); onFurnitureDisplayChange() }
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('pageshow', onPageShow)
    window.addEventListener('blur', onBlur)
    window.addEventListener('focus', onFocus)
    pageListeners.push(
      { target: document, type: 'visibilitychange', listener: onVisibilityChange },
      { target: window, type: 'pagehide', listener: onPageHide },
      { target: window, type: 'pageshow', listener: onPageShow },
      { target: window, type: 'blur', listener: onBlur },
      { target: window, type: 'focus', listener: onFocus },
    )

    observer = new ResizeObserver(() => {
      try {
        resize()
      } catch (error) {
        // 尺寸回调是异步入口，不能漏到构造 try/catch 之外而悬挂首帧交接。
        if (firstFrame) throw error
        rejectReady(error)
        releaseAll()
      }
    })
    observer.observe(container)
    resize()
    overviewPose = roomOverviewPose(template, overviewCamera.aspect)
    overviewCamera.position.set(overviewPose.position.x, overviewPose.position.y, overviewPose.position.z)
    controls.target.set(overviewPose.target.x, overviewPose.target.y, overviewPose.target.z)
    controls.update()
    // 初始相机同步仍在出生点；加载时不连通输入，不抢返回入口焦点。
    input.setEnabled(false)
    input.clear()
    walkFrame.frame(0)
    walkFrame.resetClock()
    controls.enabled = false
    if (!loading) gate.syncMode()

    // 朝向裁墙只在总览做（背对相机的墙临时隐藏）；行走时四面墙与关闭的门真实可见。
    // 相机推进只经闸门（E3b-1）：阅读时两种推进都不做，不冻结渲染与底座动画。
    const worldCamera = new THREE.Vector3()
    const normal = new THREE.Vector3()
    renderer.setAnimationLoop((now) => {
      if (disposed || document.hidden) return
      // 隐藏标签或暂时零尺寸等待下一有效帧，无超时、无伪造就绪。
      if (!firstFrame && (container.clientWidth <= 0 || container.clientHeight <= 0)) return
      try {
        if (!firstFrame) resize()
        if (!loading) gate.advance(now)
        if (mode === 'walk') {
          for (const wall of room.walls) wall.group.visible = true
        } else {
          overviewCamera.getWorldPosition(worldCamera)
          for (const wall of room.walls) {
            normal.copy(wall.normal)
            wall.group.visible = worldCamera.dot(normal) <= 0.1
          }
        }
        const activeCamera = mode === 'walk' ? walkCamera : overviewCamera
        brightnessControl.update(now)
        room.update?.(now / 1000, activeCamera)
        lighting.update(reducedMotion ? 0 : now / 1000)
        weather.update(now, activeCamera, weatherNight)
        const collecting = !!acceptanceObserver, previousAutoReset = collecting ? renderer.info.autoReset : undefined
        if (collecting) { renderer.info.autoReset = false; renderer.info.reset() }
        try { renderer.render(scene, activeCamera) }
        finally { if (collecting) renderer.info.autoReset = previousAutoReset }
        acceptanceObserver?.({ now, calls:renderer.info.render.calls, triangles:renderer.info.render.triangles, lines:renderer.info.render.lines, points:renderer.info.render.points })
        hints?.update()
        if (!firstFrame) {
          firstFrame = true
          resolveReady(true)
        }
      } catch (error) {
        if (firstFrame) throw error // 已交接后的既有异常口径不扩大
        rejectReady(error)
        releaseAll()
      }
    })
  } catch (error) {
    releaseAll()
    throw error
  }

  return {
    ready,
    finishLoading() {
      if (disposed || !firstFrame || !loading) return
      loading = false
      input.clear()
      walkFrame.resetClock()
      gate.syncMode()
      hints?.update()
    },
    resetView,
    enterWalk,
    getWalkState: () => session.getState(),
    setDoorOpen: (open) => {
      if (loading || gate?.isReading()) return { ok: false, code: 'reading-active' }
      return session.setDoorOpen(open)
    },
    setReading: (value) => { if (disposed) return; reading = value; syncPause(); hints?.cancelGesture(); hints?.update() },
    isReading: () => reading,
    // 受控设置命令和场景输入分开；窗口打开不解除 reading 闸门。
    setSettingsActive(value) { if (!disposed) settingsActive = value === true },
    setSettingsBrightness(value) {
      if (acceptanceLock || !settingsActive || disposed || loading || pageFrozen || document.hidden || !pageFocused) return false
      return applyBrightness(value)
    },
    setSettingsRain(value) {
      if (acceptanceLock || !settingsActive || disposed || loading || pageFrozen || document.hidden || !pageFocused) return false
      return weather.set(value)
    },
    getWeather: () => weather?.get(),
    setSettingsHintsVisible(value) {
      if (!settingsActive || disposed || loading || pageFrozen || document.hidden || !pageFocused) return false
      if (typeof value !== 'boolean') throw new TypeError('资料图标显示选择必须是布尔值')
      hints?.cancelGesture(); materialHintsVisible = value; hints?.update(); return true
    },
    setControlFocus(value) {
      if (disposed || loading || controlFocused === value) return
      controlFocused = value; syncPause()
      // 离开面板、聚焦图标可能发生在其 pointerdown 之后，不能取消该新手势。
      if (value) hints?.cancelGesture()
      hints?.update()
    },
    setSelected(instanceId) { if (!disposed) { selectedInstance=instanceId;highlight?.select(instanceId) } },
    getFurnitureDisplayState: instanceId => furnitureDisplay?.getState(instanceId) ?? null,
    hasHiddenFurniture: () => furnitureDisplay?.hasHidden() ?? false,
    canChangeFurnitureDisplay: () => furnitureDisplay?.canChange() ?? false,
    setFurnitureHidden: (instanceId, value) => furnitureDisplay?.setHidden(instanceId, value) ?? false,
    showAllFurniture: () => furnitureDisplay?.showAll() ?? false,
    getMaterialHintsVisible: () => materialHintsVisible,
    setMaterialHintsVisible(value) {
      if (disposed || loading || pageFrozen || document.hidden || gate?.isReading()) return false
      if (typeof value !== 'boolean') throw new TypeError('资料图标显示选择必须是布尔值')
      hints?.cancelGesture()
      materialHintsVisible = value
      hints?.update() // 立即隐藏或按当前相机重新投影，不等下一帧、不重建场景。
      return true
    },
    setPeriod,
    setBrightness,
    clearControlInput() { if (disposed || loading) return; gesture.cancel(); input.clear(); walkFrame.resetClock() },
    setInitialBrightness,
    getBrightness: () => brightnessControl?.get(),
    // 只在显式T44验收页存在的受控入口；普通页面不能安装观察器或改采样配置。
    beginAcceptance(observer) {
      if (!acceptance || disposed || loading || pageFrozen || document.hidden || !pageFocused || typeof observer !== 'function') return false
      // 受控验收不能被侧栏的焦点暂停挡在行走机位；先排空旧阻尼，再精确回原总览。
      session.setMode('overview');mode='overview';walkFrame.resetClock()
      const damping=controls.enableDamping;controls.enableDamping=false;controls.update()
      overviewPose=roomOverviewPose(template,overviewCamera.aspect)
      overviewCamera.position.set(overviewPose.position.x,overviewPose.position.y,overviewPose.position.z);controls.target.set(overviewPose.target.x,overviewPose.target.y,overviewPose.target.z)
      controls.update();controls.enableDamping=damping
      acceptanceLock = true; syncPause(); input.clear(); acceptanceObserver = observer
      return true
    },
    configureAcceptance(rain) {
      if (!acceptance || !acceptanceLock || disposed || ((pageFrozen || document.hidden || !pageFocused) && rain !== 0)) return false
      brightnessControl.set(100, true); weather.set(rain); return true
    },
    endAcceptance() { if (!acceptance || disposed) return; acceptanceObserver = null; acceptanceLock = false; syncPause(); walkFrame.resetClock() },
    getAcceptanceSnapshot() {
      if (!acceptance || disposed) return null
      const canvas=renderer.domElement,rect=canvas.getBoundingClientRect(),c=mode==='walk'?walkCamera:overviewCamera
      return { revision:THREE.REVISION,webgl2:renderer.capabilities?.isWebGL2??null,pixelRatio:renderer.getPixelRatio(),quality:acceptanceQuality,
        viewport:[container.clientWidth,container.clientHeight,window.devicePixelRatio||1,canvas.width,canvas.height,renderer.getPixelRatio(),window.visualViewport?.scale??null,rect.width,rect.height],
        camera:{mode,position:c.position.toArray(),fov:c.fov},brightness:brightnessControl.get(),weather:weather.get(),rendererMemory:{...renderer.info.memory},
        configuration:{input:acceptanceInput,doorOpen:session.getState().doorOpen,hints:materialHintsVisible,selected:selectedInstance,hidden:assembly.instances.filter(item=>furnitureDisplay.getState(item.instanceId).hidden).map(item=>item.instanceId)},
        heap:performance.memory?{usedJSHeapBytes:performance.memory.usedJSHeapSize,totalJSHeapBytes:performance.memory.totalJSHeapSize,limitBytes:performance.memory.jsHeapSizeLimit}:null }
    },
    dispose: releaseAll,
  }
}

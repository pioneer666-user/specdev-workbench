// 建筑总览页的三维场景（外观重建版）：Three.js 消费服务端算好的 model 与 present。
//
// 与旧版相同的边界（接口、行为一条不改）：
//   · createBuildingScene(container, callbacks) → 句柄，句柄操作与回调同旧版；
//   · 可见的东西来自 present.parts，能走的与挡路的来自 present.surfaces / present.colliders，
//     两套数据互不串：外观派生件（整面墙、檐口、台基……）一律不进碰撞与行走，
//     漫游判定仍全部在 building-walk.js（本模块只把结果同步到相机）；
//   · 楼层剖看是可见性过滤，不是重算；
//   · 所有 GPU 资源登记后逐项 dispose，换建筑与销毁不泄漏。
// 新增的只有外观：building-plan.js 规划（纯函数），building-kit.js 造网格，
// building-look.js 给两套预设（由 model.style 驱动）。
// 第三个参数 options 可选（页面不传即默认）：{ style, look, debug }——原型用来调试外观，
// 页面与测试替身仍然只依赖句柄。
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { createNavigator, createWalkInput, canSpawn, entryPoint, pickSign } from './building-walk.js'
import { resolveLook } from './building-look.js'
import { planBuilding } from './building-plan.js'
import { createKit, buildSign, baseBoard, groundCanvas, skyTexture, environmentTexture } from './building-kit.js'

// 漫游：眼高、视场角与速度沿用旧版手感；俯仰限制在水平线上下约 79°。
const EYE_HEIGHT = 1.65
const WALK_FOV = 66
const PITCH_LIMIT = Math.PI * 0.44
const WALK_SPEED = 2.6
const WALK_RUN_SPEED = 4.6

/**
 * 建一个建筑场景挂进 container。句柄与回调同旧版（见文档"接口"一节）：
 *   show / enterWalk / exitWalk / getMode / walkKey / pauseWalk / resumeWalk /
 *   setFloor / focusSpace / resetView / dispose；
 *   onWalkMode / onWalkMove / onWalkBlocked / onSignClick。
 */
export function createBuildingScene(container, { onWalkMode = () => {}, onWalkMove = () => {}, onWalkBlocked = () => {}, onSignClick = () => {} } = {}, options = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: Boolean(options.debug) })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8))
  renderer.shadowMap.enabled = true
  // r186 已移除 PCFSoftShadowMap（会告警并回落为 PCF）；PCF＋radius 给柔边。
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  container.append(renderer.domElement)
  renderer.domElement.tabIndex = 0
  renderer.domElement.setAttribute('aria-label', '建筑视图，拖动环绕，滚轮缩放；进入探索后用 WASD 或方向键移动')
  const maxAnisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 1000)
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.075
  controls.maxPolarAngle = Math.PI * 0.47
  controls.minDistance = 2
  controls.maxDistance = 300
  const hemisphere = new THREE.HemisphereLight('#ffffff', '#cccccc', 1)
  const sunlight = new THREE.DirectionalLight('#ffffff', 2.5)
  sunlight.castShadow = true
  scene.add(hemisphere, sunlight, sunlight.target)
  const root = new THREE.Group()
  scene.add(root)

  let model = null
  let presentation = null
  let navigator = null
  let look = null
  let floorId = 'all'
  let disposed = false
  // 资源分两层：building（换建筑即清）与 stage（换外观预设时才清：环境贴图、天空）。
  let ownedResources = []
  let stageResources = []
  const stageCache = new Map()
  let site = null
  let lastPlan = null
  let lastTimings = null
  const own = (resource) => {
    ownedResources.push(resource)
    return resource
  }

  // 漫游状态：mode 决定相机归 OrbitControls 还是行走控制；player 是脚底位置，不是眼睛位置。
  let mode = 'orbit'
  let player = { x: 0, y: 0, z: 0 }
  let yaw = 0
  let pitch = 0
  let lastLocation = ''
  let lastTime = 0
  const input = createWalkInput(renderer.domElement)

  // ── 点牌子（同旧版口径）：只在"按下与松开几乎同一点"时算点击；射线打全部看得见的构件，
  // 由 pickSign 按距离判定——被墙、楼板挡住的牌子点不到，剖看藏起的牌子也点不到。
  // 构件现在是分组的（一面墙＝墙体＋墙裙），命中后回溯到 root 下的顶层对象取身份，
  // 可见性按"自己与所有祖先都可见"判定（Three.js 的射线本身不看 visible）。
  const raycaster = new THREE.Raycaster()
  const pointerNdc = new THREE.Vector2()
  let pressedAt = null

  function topLevel(object) {
    let node = object
    while (node.parent && node.parent !== root) node = node.parent
    return node.parent === root ? node : null
  }

  function effectivelyVisible(object) {
    for (let node = object; node; node = node.parent) if (!node.visible) return false
    return true
  }

  function pickables() {
    const list = []
    for (const child of root.children) {
      if (child.userData.environment) continue
      child.traverse((node) => { if (node.isMesh) list.push(node) })
    }
    return list
  }

  function pointerDownForSign(event) {
    if (event.button !== 0) return
    pressedAt = { x: event.clientX, y: event.clientY }
  }

  function pointerUpForSign(event) {
    const start = pressedAt
    pressedAt = null
    if (event.button !== 0 || !start) return
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) return
    const rect = renderer.domElement.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    pointerNdc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
    raycaster.setFromCamera(pointerNdc, camera)
    const hits = raycaster.intersectObjects(pickables(), false).map((hit) => {
      const top = topLevel(hit.object)
      return {
        kind: top?.userData.kind,
        visible: effectivelyVisible(hit.object),
        opacity: hit.object.userData.opacity ?? top?.userData.opacity ?? 1,
        spaceId: top?.userData.spaceIds?.[0] ?? null,
      }
    })
    const picked = pickSign(hits)
    if (picked) onSignClick(picked)
  }

  const forgetPress = () => { pressedAt = null }
  renderer.domElement.addEventListener('pointerdown', pointerDownForSign)
  renderer.domElement.addEventListener('pointerup', pointerUpForSign)
  renderer.domElement.addEventListener('pointercancel', forgetPress)

  function cleanupBuilding() {
    root.clear()
    for (const resource of ownedResources) resource.dispose()
    ownedResources = []
    site = null
  }

  function cleanupStage() {
    for (const resource of stageResources) resource.dispose()
    stageResources = []
    stageCache.clear()
    scene.background = null
    scene.environment = null
    scene.fog = null
  }

  /** 舞台（天空、环境反射）按预设缓存：来回切换 style 不重新生成环境贴图，销毁时一并释放。 */
  function applyStage() {
    const key = options.look ? `${look.id}|${JSON.stringify(options.look)}` : look.id
    if (!stageCache.has(key)) {
      const sky = skyTexture(look)
      const environment = environmentTexture(renderer, look)
      stageResources.push(sky, environment)
      stageCache.set(key, { sky, environment })
    }
    const stage = stageCache.get(key)
    scene.background = stage.sky
    scene.environment = stage.environment.texture
    scene.environmentIntensity = look.light.envIntensity
    renderer.toneMappingExposure = look.light.exposure
    hemisphere.color.set(look.light.hemiSky)
    hemisphere.groundColor.set(look.light.hemiGround)
    hemisphere.intensity = look.light.hemiIntensity
    sunlight.color.set(look.light.sun)
    sunlight.intensity = look.light.sunIntensity
    if (sunlight.shadow.mapSize.x !== look.shadow.mapSize) {
      sunlight.shadow.mapSize.set(look.shadow.mapSize, look.shadow.mapSize)
      sunlight.shadow.map?.dispose()
      sunlight.shadow.map = null
    }
    sunlight.shadow.radius = look.shadow.radius
    sunlight.shadow.bias = look.shadow.bias
    sunlight.shadow.normalBias = look.shadow.normalBias
    camera.fov = mode === 'walk' ? WALK_FOV : look.camera.orbitFov
    camera.updateProjectionMatrix()
  }

  function sunDirection() {
    const el = THREE.MathUtils.degToRad(look.light.sunElevation)
    const az = THREE.MathUtils.degToRad(look.light.sunAzimuth)
    return new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az))
  }

  /** 阴影相机：总览时框住整块底座；漫游时跟着人走、只框周边，近处阴影才够清楚。 */
  function fitShadow(center, half) {
    const direction = sunDirection()
    const distance = half * 3 + 20
    sunlight.target.position.copy(center)
    sunlight.position.copy(center).addScaledVector(direction, distance)
    Object.assign(sunlight.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 0.5, far: distance + half * 2 })
    sunlight.shadow.camera.updateProjectionMatrix()
  }

  function fitShadowOverview() {
    if (!site) return
    fitShadow(site.center, site.radius * 1.05)
  }

  /** 楼层剖看（同旧版语义）：选中某层时隐藏其上方构件与压在该层上的屋顶（山墙填充随屋顶走）。 */
  function updateFloor() {
    const floor = model?.floors.find((item) => item.id === floorId)
    const floorY = floor ? (floor.y ?? floor.elevation) : 0
    const ceiling = floor ? floorY + floor.height + 0.25 : Infinity
    for (const object of root.children) {
      if (object.userData.environment) continue
      const ids = object.userData.spaceIds || []
      const spaces = ids.map((id) => model.spaces.find((item) => item.id === id)).filter(Boolean)
      object.visible = !floor
        || ((object.userData.lowY ?? 0) < ceiling && (spaces.length ? spaces.some((space) => space.y <= floorY + 0.01) : true))
      const roofLike = ['roof', 'roof-frame'].includes(object.userData.kind) || object.userData.cutAs === 'roof'
      if (floor && roofLike && spaces.some((space) => space.floorId === floor.id)) object.visible = false
    }
  }

  /**
   * 总览机位：沿固定的"模型摄影"方向，二分出让建筑包络（含底座）刚好占满画面约 look.camera.fill
   * 的距离——不同尺寸、不同长宽比的建筑都得到同样饱满的构图，不靠写死的倍数。
   */
  function home() {
    if (!model || !site) return
    const b = model.bounds
    const center = new THREE.Vector3((b.x0 + b.x1) / 2, (b.y0 + b.y1) * 0.35, (b.z0 + b.z1) / 2)
    const direction = new THREE.Vector3(...look.camera.overviewDirection).normalize()
    const r = site.rect
    const corners = []
    for (const x of [r.x0, r.x0 + r.width]) for (const z of [r.z0, r.z0 + r.depth]) {
      corners.push(new THREE.Vector3(x, site.center.y, z), new THREE.Vector3(x, b.y1, z))
    }
    const probe = camera.clone()
    probe.fov = look.camera.orbitFov
    probe.aspect = camera.aspect
    probe.near = 0.1
    probe.far = 1e5
    probe.updateProjectionMatrix()
    const extent = (distance) => {
      probe.position.copy(center).addScaledVector(direction, distance)
      probe.lookAt(center)
      probe.updateMatrixWorld()
      let max = 0
      for (const corner of corners) {
        const v = corner.clone().project(probe)
        max = Math.max(max, Math.abs(v.x), Math.abs(v.y))
      }
      return max
    }
    let lo = 1
    let hi = 2000
    for (let i = 0; i < 40; i += 1) {
      const mid = (lo + hi) / 2
      if (extent(mid) > look.camera.fill) lo = mid
      else hi = mid
    }
    const distance = hi
    controls.target.copy(center)
    camera.position.copy(center).addScaledVector(direction, distance)
    controls.maxDistance = distance * 3
    camera.far = Math.max(500, distance * 8)
    camera.updateProjectionMatrix()
    camera.lookAt(center)
    controls.update()
  }

  function resize() {
    if (disposed) return
    const width = Math.max(1, container.clientWidth)
    const height = Math.max(1, container.clientHeight)
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
  }

  function syncWalk() {
    camera.position.set(player.x, player.y + EYE_HEIGHT, player.z)
    camera.rotation.set(pitch, yaw, 0, 'YXZ')
    const space = navigator?.locate(player) || null
    const key = space?.id || 'stairs'
    if (key !== lastLocation) {
      lastLocation = key
      onWalkMove(space, { ...player })
    }
  }

  function locate(point, lookAt) {
    if (!model || !point) return
    const space = model.spaces.find((item) => item.id === point.spaceId)
    player = { x: point.x, y: point.y ?? space?.y ?? 0, z: point.z }
    const target = lookAt || { x: (model.bounds.x0 + model.bounds.x1) / 2, z: (model.bounds.z0 + model.bounds.z1) / 2 }
    if (Math.hypot(target.x - player.x, target.z - player.z) > 0.01) yaw = Math.atan2(-(target.x - player.x), -(target.z - player.z))
    pitch = 0
    lastLocation = ''
    syncWalk()
  }

  function blocked(reason, whileWalking) {
    onWalkBlocked({ reason, whileWalking })
  }

  function enterWalk() {
    if (!model || !navigator || !presentation?.surfaces?.length) {
      blocked('no-walkable-ground', false)
      return false
    }
    const spawn = entryPoint(model)
    if (!canSpawn(navigator, spawn)) {
      blocked('entry-blocked', false)
      return false
    }
    floorId = 'all'
    updateFloor()
    mode = 'walk'
    controls.enabled = false
    camera.fov = WALK_FOV
    camera.updateProjectionMatrix()
    input.setEnabled(true)
    locate(spawn)
    renderer.domElement.focus({ preventScroll: true })
    onWalkMode(mode)
    return true
  }

  function exitWalk() {
    if (mode !== 'walk') return false
    mode = 'orbit'
    input.setEnabled(false)
    controls.enabled = true
    camera.fov = look?.camera.orbitFov ?? 40
    camera.updateProjectionMatrix()
    fitShadowOverview()
    home()
    onWalkMode(mode)
    return true
  }

  /** 场地：底座、接触阴影、雾——都是环境（不参与剖看与拾取）。 */
  function buildSite(plan) {
    const b = model.bounds
    const margin = look.base.margin
    const rect = { x0: b.x0 - margin, z0: b.z0 - margin, width: b.x1 - b.x0 + margin * 2, depth: b.z1 - b.z0 + margin * 2 }
    const footprints = plan.plinths.map((p) => ({ x0: p.x0 - look.plinth.outset, x1: p.x1 + look.plinth.outset, z0: p.z0 - look.plinth.outset, z1: p.z1 + look.plinth.outset }))
    const groundTexture = own(new THREE.CanvasTexture(groundCanvas(look, rect, footprints)))
    groundTexture.colorSpace = THREE.SRGBColorSpace
    groundTexture.anisotropy = maxAnisotropy
    const board = baseBoard(look, rect, plan.groundY, own, groundTexture)
    board.userData.environment = true
    root.add(board)
    const center = new THREE.Vector3(rect.x0 + rect.width / 2, plan.groundY, rect.z0 + rect.depth / 2)
    const radius = 0.5 * Math.hypot(rect.width, rect.depth)
    site = { center, radius, rect }
    const span = Math.max(b.x1 - b.x0, b.z1 - b.z0, 12)
    scene.fog = new THREE.Fog(look.sky.horizon, span * look.sky.fogNear, span * look.sky.fogFar)
  }

  function show({ model: nextModel, present }) {
    model = nextModel
    presentation = present
    navigator = createNavigator(model, present)
    floorId = 'all'
    const t0 = performance.now()
    cleanupBuilding()
    const t1 = performance.now()
    look = resolveLook(options.style || model.style, options.look || null)
    applyStage()
    const t2 = performance.now()
    const plan = planBuilding(model, present, look)
    const kit = createKit({ look, own, maxAnisotropy })
    buildSite(plan)
    for (const object of kit.build(plan, model, present)) root.add(object)
    for (const sign of model.signs || []) root.add(buildSign(sign, { project: !sign.spaceId, look, own, maxAnisotropy }))
    if (options.debug) lastTimings = { cleanup: Math.round(t1 - t0), stage: Math.round(t2 - t1), build: Math.round(performance.now() - t2) }
    lastPlan = options.debug ? plan : null
    fitShadowOverview()
    updateFloor()
    if (mode === 'walk') {
      const spawn = entryPoint(model)
      if (!presentation?.surfaces?.length) {
        exitWalk()
        blocked('no-walkable-ground', true)
      } else if (!canSpawn(navigator, spawn)) {
        exitWalk()
        blocked('entry-blocked', true)
      } else locate(spawn)
    } else home()
  }

  function focusSpace(spaceId) {
    if (!model) return
    const space = model.spaces.find((item) => item.id === spaceId)
    if (!space) return
    const width = space.bounds.x1 - space.bounds.x0
    const depth = space.bounds.z1 - space.bounds.z0
    const target = new THREE.Vector3((space.bounds.x0 + space.bounds.x1) / 2, space.y + space.height * 0.35, (space.bounds.z0 + space.bounds.z1) / 2)
    const direction = camera.position.clone().sub(controls.target)
    if (direction.lengthSq() < 1e-6) direction.set(0.85, 0.72, 1.04)
    direction.normalize()
    const distance = Math.max(Math.max(width, depth) * 2.4, 12)
    controls.target.copy(target)
    camera.position.copy(target).add(direction.multiplyScalar(distance))
    controls.update()
  }

  const observer = new ResizeObserver(resize)
  observer.observe(container)
  resize()
  const shadowCenter = new THREE.Vector3()
  renderer.setAnimationLoop((time) => {
    const dt = Math.min((time - lastTime) / 1000 || 0, 0.05)
    lastTime = time
    if (mode === 'walk') {
      const lookDelta = input.takeLook()
      if (lookDelta.yaw || lookDelta.pitch) {
        yaw += lookDelta.yaw
        pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch + lookDelta.pitch))
      }
      const { forward, right, fast } = input.axis()
      const length = Math.hypot(forward, right)
      if (length > 0 && navigator) {
        const step = dt * (fast ? WALK_RUN_SPEED : WALK_SPEED)
        player = navigator.move(
          player,
          (-Math.sin(yaw) * forward + Math.cos(yaw) * right) / length * step,
          (-Math.cos(yaw) * forward - Math.sin(yaw) * right) / length * step,
        )
      }
      syncWalk()
      if (look) fitShadow(shadowCenter.set(player.x, player.y, player.z), look.shadow.walkHalfSize)
    } else controls.update()
    if (model) renderer.render(scene, camera)
  })

  const handle = {
    show,
    enterWalk,
    exitWalk,
    getMode: () => mode,
    walkKey(code, down) {
      input.press(code, down)
    },
    pauseWalk() {
      if (mode !== 'walk') return false
      input.setEnabled(false)
      return true
    },
    resumeWalk() {
      if (mode !== 'walk') return false
      input.setEnabled(true)
      renderer.domElement.focus({ preventScroll: true })
      return true
    },
    setFloor(id) {
      if (mode === 'walk' && id !== 'all') exitWalk()
      floorId = id
      updateFloor()
    },
    focusSpace,
    resetView: home,
    dispose() {
      if (disposed) return
      disposed = true
      renderer.setAnimationLoop(null)
      observer.disconnect()
      input.dispose()
      controls.dispose()
      renderer.domElement.removeEventListener('pointerdown', pointerDownForSign)
      renderer.domElement.removeEventListener('pointerup', pointerUpForSign)
      renderer.domElement.removeEventListener('pointercancel', forgetPress)
      cleanupBuilding()
      cleanupStage()
      sunlight.shadow.map?.dispose()
      hemisphere.dispose?.()
      sunlight.dispose?.()
      renderer.dispose()
      renderer.domElement.remove()
    },
  }
  // 调试口只在 options.debug 时出现（原型与自动检查用）；页面不传，句柄与旧版一致。
  if (options.debug) {
    handle.debug = {
      info: () => ({ ...renderer.info.memory, programs: renderer.info.programs?.length ?? 0, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }),
      plan: () => lastPlan,
      timings: () => lastTimings,
      look: () => look,
      camera,
      controls,
      scene,
      sunlight,
      root,
      renderNow: () => renderer.render(scene, camera),
      canvas: renderer.domElement,
      player: () => ({ ...player, yaw, pitch }),
      setPlayer(next) {
        player = { x: next.x, y: next.y, z: next.z }
        yaw = next.yaw ?? yaw
        pitch = next.pitch ?? pitch
        syncWalk()
      },
      clickAt(x, y) {
        const rect = renderer.domElement.getBoundingClientRect()
        const down = new PointerEvent('pointerdown', { button: 0, clientX: rect.left + x, clientY: rect.top + y, bubbles: true })
        const up = new PointerEvent('pointerup', { button: 0, clientX: rect.left + x, clientY: rect.top + y, bubbles: true })
        renderer.domElement.dispatchEvent(down)
        renderer.domElement.dispatchEvent(up)
      },
      project(point) {
        const v = new THREE.Vector3(point.x, point.y, point.z).project(camera)
        const rect = renderer.domElement.getBoundingClientRect()
        return { x: (v.x + 1) / 2 * rect.width, y: (1 - v.y) / 2 * rect.height, z: v.z }
      },
    }
  }
  return handle
}

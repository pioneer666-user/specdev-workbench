import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { prepareRoomFurniture } from './furniture-assembly.js'
import { createPreviewState } from './preview-state.js'

// 一个窗口只持有一个渲染器；change/resize 才绘制，无后台循环或自转。
export function createFurniturePreview({ container, onStatus }) {
  let renderer, controls, observer, state, frame = 0, disposed = false, suspended = false, bounds = null
  const world = new THREE.Scene(), camera = new THREE.PerspectiveCamera(36, 1, .01, 100)
  world.add(new THREE.HemisphereLight(0xfff8e6, 0x76695f, 2.5))
  const light = new THREE.DirectionalLight(0xffffff, 3); light.position.set(3, 5, 4); world.add(light)
  function draw() {
    if (disposed || suspended || frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      if (disposed || suspended || !container.clientWidth || !container.clientHeight) return
      renderer.render(world, camera)
    })
  }
  function fit() {
    if (!bounds) return
    const size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3())
    const radius = Math.max(size.length() / 2, .06)
    const halfAngle = Math.min(THREE.MathUtils.degToRad(camera.fov / 2), Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect))
    const distance = radius / Math.sin(halfAngle) * 1.18
    camera.near = Math.max(.001, radius / 100); camera.far = distance + radius * 12
    camera.position.copy(center).add(new THREE.Vector3(1, .65, 1.25).normalize().multiplyScalar(distance))
    controls.target.copy(center); controls.minDistance = radius * 1.3; controls.maxDistance = distance * 3
    camera.updateProjectionMatrix(); controls.update(); draw()
  }
  function resize() {
    if (disposed || suspended || !container.clientWidth || !container.clientHeight) return
    const aspect = container.clientWidth / container.clientHeight
    camera.aspect = aspect; camera.updateProjectionMatrix()
    renderer.setSize(container.clientWidth, container.clientHeight, false)
    // 只有窄化可能裁物时重新取完整视角，普通往返保留旋转。
    if (bounds && aspect < .7) fit()
    draw()
  }
  function dispose() {
    if (disposed) return
    disposed = true; cancelAnimationFrame(frame); frame = 0
    observer?.disconnect(); state?.dispose(); controls?.dispose()
    renderer?.domElement.remove(); renderer?.dispose()
    world.clear()
  }
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.domElement.tabIndex = 0
    renderer.domElement.setAttribute('aria-label', '单件家具三维预览：拖动旋转，滚轮缩放，方向键旋转')
    container.append(renderer.domElement)
    controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = false; controls.autoRotate = false; controls.enablePan = false
    controls.addEventListener('change', draw)
    state = createPreviewState({
      prepare: (item, isActive) => prepareRoomFurniture({ instances: [{ ...item, position: { x: 0, y: 0, z: 0 }, yawDeg: 0 }] }, { isActive }),
      attach: handle => { world.add(handle.group); bounds = new THREE.Box3().setFromObject(handle.group); resize(); fit() },
      detach: handle => { world.remove(handle.group); bounds = null; draw() }, onStatus,
    })
    renderer.domElement.addEventListener('keydown', event => {
      if (disposed || suspended || !bounds) return
      const angle = { ArrowLeft: -.12, ArrowRight: .12, ArrowUp: -.12, ArrowDown: .12 }[event.key]
      if (angle === undefined) return
      event.preventDefault()
      const offset = camera.position.clone().sub(controls.target)
      const sphere = new THREE.Spherical().setFromVector3(offset)
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') sphere.theta += angle
      else sphere.phi = Math.max(.1, Math.min(Math.PI - .1, sphere.phi + angle))
      camera.position.copy(controls.target).add(offset.setFromSpherical(sphere)); controls.update(); draw()
    })
    observer = new ResizeObserver(resize); observer.observe(container); resize()
  } catch (error) { dispose(); throw error }
  return {
    show: item => state.show(item), retry: () => state.retry(), reset: fit,
    suspend(value) {
      if (disposed || suspended === value) return
      suspended = value; state.suspend(value)
      if (value) { cancelAnimationFrame(frame); frame = 0; controls.enabled = false; controls.disconnect() }
      else { controls.connect(renderer.domElement); controls.enabled = true; resize(); draw() }
    }, dispose,
  }
}

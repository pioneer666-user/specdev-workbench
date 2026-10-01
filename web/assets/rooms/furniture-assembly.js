// 家具批次准备（E4b-2）：把已通过 validatePlacement 的 assembly 逐件变成真实模型组。
// 设计前提是"先异步准备家具批次，再同步 createRoomScene"——WebGL 场景工厂保持同步，
// renderer/输入不会在等待模型期间半初始化。本模块只消费已通过校验的 assembly：
// 不重新推导摆放、不读 JSON、不访问业务资料；占位分发表用 Map（原型键不算工厂），
// 正式模型经真实 createFurnitureModel（registry 的固定字面量动态 import）创建。
// 释放纪律：占位组用适配句柄释放去重后的几何/材质/纹理；正式家具用其自带 dispose，
// 禁止再遍历正式模型重复释放；任一件失败释放此前全部句柄，不交付半批次。
import * as THREE from 'three'
import { createPlaceholderFurniture, createPlaceholderLamp } from './placeholder-furniture.js'
import { createFurnitureModel, hasFurnitureModel } from '../furniture/registry.js'

/** 三个占位 modelRef → 现有工厂；其余引用一律走正式注册表，不做风格/名称猜测。 */
const PLACEHOLDER_FACTORIES = new Map([
  ['placeholder-box-desk', (size) => createPlaceholderFurniture(size)],
  ['placeholder-box-shelf', (size) => createPlaceholderFurniture(size)],
  ['placeholder-box-lamp', (size) => createPlaceholderLamp(size)],
])

/** 从实际命中子节点向上找到带实例身份的家具根组（模型子节点不获得独立业务身份）；找不到返回 null。 */
export function findFurnitureInstance(object, furnitureRoot) {
  for (let node = object; node && node !== furnitureRoot; node = node.parent) {
    if (node.userData?.instanceId) return node
  }
  return null
}

/** 占位组适配句柄：释放去重后的几何／材质／全部纹理槽位（不只 map），幂等。 */
function makePlaceholderHandle(modelGroup) {
  let disposed = false
  return {
    group: modelGroup,
    dispose() {
      if (disposed) return
      disposed = true
      modelGroup.removeFromParent()
      const resources = new Set()
      modelGroup.traverse((node) => {
        if (node.geometry) resources.add(node.geometry)
        const material = node.material
        if (material) {
          for (const item of Array.isArray(material) ? material : [material]) {
            resources.add(item)
            for (const key of Object.keys(item)) {
              if (item[key]?.isTexture) resources.add(item[key])
            }
          }
        }
      })
      for (const resource of resources) resource.dispose?.()
      modelGroup.clear()
    },
  }
}

/**
 * 按 assembly 顺序逐件创建模型（当前规模逐件 await，不做并发），返回 { group, dispose }。
 * group 内每件实例组带 userData{instanceId,assetId,name}，位置/朝向直接用 assembly 的
 * 世界坐标（桌面子件已是世界坐标，不挂桌子二次变换），根缩放保持 1。
 * options.isActive（默认恒 true）：每次创建前、await 返回后、整批返回前检查；变 false
 * 时释放已有与刚返回的句柄，以 name='AbortError' 的错误结束——动态 import 无法取消，
 * 晚到句柄也必须释放。dispose 幂等：移除批次组、释放全部持有句柄并清空记录。
 */
export async function prepareRoomFurniture(assembly, { isActive = () => true } = {}) {
  const group = new THREE.Group()
  group.name = 'room-furniture'
  const handles = []
  const stop = () => {
    const error = new Error('页面已离开，家具准备中止')
    error.name = 'AbortError'
    return error
  }
  let batchDisposed = false
  const releaseAll = () => {
    if (batchDisposed) return
    batchDisposed = true
    group.removeFromParent()
    for (let index = handles.length - 1; index >= 0; index -= 1) {
      const handle = handles[index]
      try { handle.dispose() } catch { /* 释放尽力而为，单件失败不中断其余清理 */ }
    }
    handles.length = 0
    group.clear()
  }
  try {
    for (const item of assembly?.instances ?? []) {
      if (!isActive()) throw stop()
      const modelRef = item.mesh?.modelRef
      let handle
      if (typeof modelRef === 'string' && PLACEHOLDER_FACTORIES.has(modelRef)) {
        const { width, height, depth } = item.mesh
        handle = makePlaceholderHandle(PLACEHOLDER_FACTORIES.get(modelRef)({ width, height, depth }))
      } else if (typeof modelRef === 'string' && hasFurnitureModel(modelRef)) {
        handle = await createFurnitureModel(modelRef) // 每次调用创建独立实例，两件同资产互不共享
      } else {
        throw new Error(`家具「${item.instanceId}」引用了未登记的模型：${String(modelRef)}——不回退占位模型`)
      }
      handles.push(handle) // 一创建成功就登记所有权；位姿设置或后续创建失败也能释放
      if (!isActive()) throw stop()
      handle.group.position.set(item.position.x, item.position.y ?? 0, item.position.z)
      handle.group.rotation.y = (item.yawDeg * Math.PI) / 180
      handle.group.userData = { instanceId: item.instanceId, assetId: item.assetId, name: item.name }
      group.add(handle.group)
    }
    if (!isActive()) throw stop()
    return {
      group,
      dispose: releaseAll,
    }
  } catch (error) {
    releaseAll()
    throw error
  }
}

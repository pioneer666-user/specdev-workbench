import * as THREE from 'three'
// 唯一装饰挂在场景根，排除在家具拾取与包围范围之外；不触碰模型材质。
export function createSelectionHighlight(scene, furnitureGroup) {
  let helper = null, disposed = false, selected = null
  function clear() { if (!helper) return; helper.removeFromParent(); helper.geometry.dispose(); helper.material.dispose(); helper = null }
  function refresh() {
    if (disposed) return
    clear()
    const owner = furnitureGroup.children.find(child => child.userData.instanceId === selected)
    if (!owner || !owner.visible) return
    furnitureGroup.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(owner)
    if (box.isEmpty()) return
    helper = new THREE.Box3Helper(box, 0xffa21a)
    helper.material.depthTest = true; helper.material.toneMapped = false
    helper.raycast = () => {}; scene.add(helper)
  }
  return {
    select(instanceId) { selected = instanceId; refresh() },
    refresh,
    dispose() { if (disposed) return; disposed = true; selected = null; clear() },
  }
}

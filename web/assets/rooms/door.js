import * as THREE from 'three';

// 门扇通用小接口（P1c-2a）：门板、把手、门环等活动部件由各底座挂在 hinge 组下，
// 这里只统一开合端点与世界包围盒，不引入动画、物理或输入。门框、门檐、墙体留在
// 墙组，不进 door.group；活动网格仍由底座统一释放，本接口不新建动画循环或监听。
const OPEN_ROTATION_Y = Math.PI / 2;

/** 关闭端点 rotation.y=0；打开端点 rotation.y=π/2（两套底座均向北侧室外开启）。 */
export function createDoorHandle(hinge, id = 'entry-door') {
  return {
    id,
    group: hinge,
    setOpen(open) {
      if (typeof open !== 'boolean') {
        throw new Error(`房门 setOpen 只接受 true 或 false，收到「${String(open)}」（${typeof open}），不能猜测开合意图。`);
      }
      hinge.rotation.y = open ? OPEN_ROTATION_Y : 0;
    },
    isOpen() {
      return hinge.rotation.y !== 0;
    },
    // 真实活动网格在当前姿态下的世界包围盒：先连祖先链一起刷新世界矩阵（父组平移
    // 也算数），再用逐顶点精确模式累加。每次返回新的普通数值对象，调用方改不动
    // Three.js 缓存；导航层负责把它变成 collider。
    getBounds() {
      hinge.updateWorldMatrix(true, true);
      const box = new THREE.Box3().setFromObject(hinge, true);
      return {
        minX: box.min.x, maxX: box.max.x,
        minY: box.min.y, maxY: box.max.y,
        minZ: box.min.z, maxZ: box.max.z,
      };
    },
  };
}

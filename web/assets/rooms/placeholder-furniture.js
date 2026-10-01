// 占位家具模型工厂：程序生成、非正式美术（placeholder: true）。产品模块；P1a 自 E2b 实验
// 迁入（来源提交 d80bea1），只承诺目录里已登记的占位资产尺寸，不当作任意尺寸模型生成器。
// 生成约定：合并几何严格落在声明的本地包围盒 X[-w/2,w/2] × Y[0,h] × Z[-d/2,d/2] 内——
// 本体深 d-0.03 且回缩 0.015，正面标记板厚 0.03 填满最前段，可见模型不超出校验盒；
// 正面（本地 +Z）用深色标记板区分。tests/room-placement.test.mjs 在 Node 中用真实 Three.js 复核这一约定。
// 台灯工厂：底座 + 灯柱 + 灯罩盒 + 正面标记，原点同为底面中心（Y 从 0 起），
// 桌面上摆放时 group.position.y 直接用装配结果的承载面高度。three 用页面同一份随包副本（importmap 裸名）。
import * as THREE from 'three';

export function createPlaceholderFurniture({ width, height, depth, bodyColor = '#c99f6b', frontColor = '#6f4c2e' } = {}) {
  const panel = 0.03;
  if (![width, height, depth].every((value) => Number.isFinite(value) && value > panel)) {
    throw new Error(`占位家具尺寸必须为正且大于面板厚度 ${panel} 米`);
  }
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth - panel),
    new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.82, metalness: 0.02 }),
  );
  body.position.set(0, height / 2, -panel / 2);
  body.castShadow = true;
  body.receiveShadow = true;
  const front = new THREE.Mesh(
    new THREE.BoxGeometry(width, height * 0.42, panel),
    new THREE.MeshStandardMaterial({ color: frontColor, roughness: 0.7 }),
  );
  front.position.set(0, height * 0.58, depth / 2 - panel / 2);
  front.castShadow = true;
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(width, height, depth)),
    new THREE.LineBasicMaterial({ color: '#3a3f35' }),
  );
  edges.position.set(0, height / 2, 0);
  group.add(body, front, edges);
  return group;
}

/** 占位台灯：底座圆柱 + 灯柱 + 灯罩盒 + 正面标记板（本地 +Z），全部落在声明盒内、不外凸。 */
export function createPlaceholderLamp({ width, height, depth, bodyColor = '#e8c98f', frontColor = '#8a5a2e' } = {}) {
  if (![width, height, depth].every((value) => Number.isFinite(value) && value > 0.08)) {
    throw new Error('占位台灯尺寸必须为正且大于最小构件 0.08 米');
  }
  const group = new THREE.Group();
  const baseR = Math.min(width, depth) * 0.42;
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(baseR * 0.88, baseR, 0.04, 20),
    new THREE.MeshStandardMaterial({ color: frontColor, roughness: 0.62 }),
  );
  base.position.set(0, 0.02, 0); // Y[0, 0.04]
  base.castShadow = true;
  const poleHeight = height - 0.34;
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.016, 0.016, poleHeight, 12),
    new THREE.MeshStandardMaterial({ color: '#7c7f76', roughness: 0.5, metalness: 0.3 }),
  );
  pole.position.set(0, 0.04 + poleHeight / 2, 0); // Y[0.04, height-0.30]
  pole.castShadow = true;
  const shade = new THREE.Mesh(
    new THREE.BoxGeometry(width, 0.3, depth),
    new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.85 }),
  );
  shade.position.set(0, height - 0.15, 0); // Y[height-0.3, height]
  shade.castShadow = true;
  const mark = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.5, 0.1, 0.012),
    new THREE.MeshStandardMaterial({ color: frontColor, roughness: 0.7 }),
  );
  mark.position.set(0, height - 0.15, depth / 2 - 0.006); // 嵌入灯罩正面，最外端恰在 depth/2
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(width, height, depth)),
    new THREE.LineBasicMaterial({ color: '#3a3f35' }),
  );
  edges.position.set(0, height / 2, 0);
  group.add(base, pole, shade, mark, edges);
  return group;
}

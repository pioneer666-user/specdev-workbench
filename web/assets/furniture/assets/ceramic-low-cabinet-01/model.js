// 自制阅读休憩家具。米制、+Y向上、+Z正面，底面中心为原点。
import * as THREE from 'three';

// 圆角实体沿Z挤出，边缘真实倒角；归一到指定尺寸，顶面与包络不靠声明替身。
function rounded(w, h, d, radius = 0.025) {
  const r = Math.min(radius, w / 4, h / 4), x = -w / 2, y = -h / 2;
  const shape = new THREE.Shape();
  shape.moveTo(x + r, y); shape.lineTo(x + w - r, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + h - r); shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  shape.lineTo(x + r, y + h); shape.quadraticCurveTo(x, y + h, x, y + h - r);
  shape.lineTo(x, y + r); shape.quadraticCurveTo(x, y, x + r, y);
  const g = new THREE.ExtrudeGeometry(shape, { depth: d, steps: 1, curveSegments: 4,
    bevelEnabled: true, bevelSegments: 2, bevelSize: Math.min(0.006, d / 5), bevelThickness: Math.min(0.006, d / 5) });
  g.center(); g.computeBoundingBox();
  const size = g.boundingBox.getSize(new THREE.Vector3());
  g.scale(w / size.x, h / size.y, d / size.z); g.computeVertexNormals();
  return g;
}
function woodTexture() {
  const size = 128, data = new Uint8Array(size * size * 4); let seed = 20260930;
  for (let v = 0; v < size; v++) for (let u = 0; u < size; u++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const tone = 210 + 4 * Math.sin(v * 0.6 + Math.sin(u * 0.04)) + (seed / 4294967296 - 0.5) * 2;
    const i = (v * size + u) * 4; data[i] = tone; data[i + 1] = tone - 26; data[i + 2] = tone - 61; data[i + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter; texture.needsUpdate = true; return texture;
}

export function createCeramicLowCabinet() {
  const group = new THREE.Group(); group.name = 'ceramic-low-cabinet-01';
  const owned = new Set(), keep = value => { owned.add(value); return value; }; let disposed = false;
  const dispose = () => {
    if (disposed) return; disposed = true; group.removeFromParent();
    for (const resource of owned) resource.dispose(); owned.clear(); group.clear();
  };
  try {
    const material = options => keep(new THREE.MeshStandardMaterial(options));
    const wood = material({ map: keep(woodTexture()), roughness: 0.7 });
    const glaze = material({ color: '#eee9dd', roughness: 0.43 });
    const brass = material({ color: '#b69557', metalness: 0.72, roughness: 0.38 });
    const add = (g, m, x, y, z, name) => {
      const mesh = new THREE.Mesh(keep(g), m); mesh.name = name; mesh.position.set(x, y, z);
      mesh.castShadow = mesh.receiveShadow = true; group.add(mesh); return mesh;
    };
    const box = (w, h, d, m, x, y, z, name) => add(new THREE.BoxGeometry(w, h, d), m, x, y, z, name);
    const soft = (w, h, d, m, x, y, z, name, radius) => add(rounded(w, h, d, radius), m, x, y, z, name);
    for (const x of [-0.44, 0.44]) for (const z of [-0.18, 0.18])
      soft(0.075, 0.14, 0.075, wood, x, 0.07, z, '矮柜短脚');
    for (const x of [-0.52, 0.52]) box(0.045, 0.65, 0.50, glaze, x, 0.455, 0, '完整柜侧板');
    box(1.04, 0.05, 0.50, glaze, 0, 0.15, 0, '完整柜底板');
    box(1.04, 0.64, 0.035, glaze, 0, 0.46, -0.2325, '完整柜背板');
    box(0.03, 0.64, 0.46, glaze, 0, 0.46, 0, '柜内中撑');
    for (const x of [-0.252, 0.252]) {
      soft(0.494, 0.61, 0.035, glaze, x, 0.465, 0.235, '关闭柜门', 0.015);
      const k = x < 0 ? -0.055 : 0.055;
      const post = add(new THREE.CylinderGeometry(0.008, 0.008, 0.017, 12), brass, k, 0.52, 0.259, '把手连接座');
      post.rotation.x = Math.PI / 2;
      add(new THREE.SphereGeometry(0.011, 12, 8), brass, k, 0.52, 0.267, '黄铜门把手');
    }
    // 顶板用完整实体盒确保冻结rect九点都处于真正水平最高面。
    box(1.10, 0.07, 0.56, wood, 0, 0.815, 0, '平整浅木厚顶板');
    return { group, dispose };
  } catch (error) { dispose(); throw error; }
}

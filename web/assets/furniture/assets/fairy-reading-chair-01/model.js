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

export function createFairyReadingChair() {
  const group = new THREE.Group(); group.name = 'fairy-reading-chair-01';
  const owned = new Set(), keep = value => { owned.add(value); return value; }; let disposed = false;
  const dispose = () => {
    if (disposed) return; disposed = true; group.removeFromParent();
    for (const resource of owned) resource.dispose(); owned.clear(); group.clear();
  };
  try {
    const material = options => keep(new THREE.MeshStandardMaterial(options));
    const wood = material({ map: keep(woodTexture()), roughness: 0.7 });
    const cream = material({ color: '#eee4cf', roughness: 0.92 });
    const green = material({ color: '#86a69d', roughness: 0.94 });
    const add = (g, m, x, y, z, name) => {
      const mesh = new THREE.Mesh(keep(g), m); mesh.name = name; mesh.position.set(x, y, z);
      mesh.castShadow = mesh.receiveShadow = true; group.add(mesh); return mesh;
    };
    const box = (w, h, d, m, x, y, z, name) => add(new THREE.BoxGeometry(w, h, d), m, x, y, z, name);
    const soft = (w, h, d, m, x, y, z, name, radius) => add(rounded(w, h, d, radius), m, x, y, z, name);
    for (const x of [-0.28, 0.28]) for (const z of [-0.21, 0.21])
      soft(0.065, 0.40, 0.065, wood, x, 0.20, z, '落地椅脚');
    box(0.62, 0.065, 0.47, wood, 0, 0.39, 0.015, '座承托板');
    for (const x of [-0.29, 0.29]) soft(0.065, 0.105, 0.52, wood, x, 0.38, 0, '侧座框');
    for (const z of [-0.23, 0.23]) soft(0.62, 0.105, 0.055, wood, 0, 0.38, z, '端座框');
    for (const x of [-0.275, 0.275]) {
      soft(0.055, 0.57, 0.065, wood, x, 0.635, -0.235, '靠背支承');
      soft(0.055, 0.24, 0.055, wood, x, 0.505, 0.21, '前扶手支承');
      soft(0.09, 0.065, 0.52, wood, x, 0.635, 0, '圆润扶手');
    }
    soft(0.56, 0.12, 0.46, cream, 0, 0.48, 0.015, '厚坐垫', 0.035);
    soft(0.56, 0.47, 0.06, wood, 0, 0.70, -0.25, '实木背板', 0.04).rotation.x = -0.05;
    soft(0.53, 0.43, 0.095, cream, 0, 0.705, -0.18, '厚靠垫', 0.05).rotation.x = -0.05;
    soft(0.53, 0.018, 0.035, green, 0, 0.543, 0.205, '坐垫青绿缝边', 0.005);
    return { group, dispose };
  } catch (error) { dispose(); throw error; }
}

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

export function createFairyBed() {
  const group = new THREE.Group(); group.name = 'fairy-bed-01';
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
    for (const x of [-0.66, 0.66]) for (const z of [-0.95, 0.95])
      soft(0.11, 0.38, 0.11, wood, x, 0.19, z, '落地床脚');
    for (const x of [-0.69, 0.69]) soft(0.10, 0.18, 2.12, wood, x, 0.38, 0, '侧床框');
    for (const z of [-1.02, 1.02]) soft(1.46, 0.18, 0.10, wood, 0, 0.38, z, '端床框');
    box(1.34, 0.04, 2.02, wood, 0, 0.43, 0, '床垫承托板');
    soft(1.48, 0.76, 0.09, wood, 0, 0.72, -1.05, '圆润床头板', 0.12);
    soft(1.48, 0.29, 0.09, wood, 0, 0.485, 1.05, '低床尾板', 0.06);
    soft(1.34, 0.18, 1.98, cream, 0, 0.54, 0, '奶油厚床垫', 0.055);
    for (const x of [-0.34, 0.34]) soft(0.54, 0.12, 0.35, cream, x, 0.685, -0.69, '厚枕头', 0.06);
    soft(1.30, 0.07, 0.96, green, 0, 0.665, 0.40, '青绿折被', 0.045);
    soft(1.27, 0.022, 0.13, green, 0, 0.708, -0.01, '折被厚折边', 0.01);
    return { group, dispose };
  } catch (error) { dispose(); throw error; }
}

// 暖釉陶瓷展示台：自制程序化候选模型，不依赖 DOM、网络或实验文件。
// 米制、+Y 向上、+Z 正面；底面中心原点。冻结包络 X±0.4、Y[0,0.9]、Z±0.3。
// 设计常数（检查按此独立手算）：台板圆角矩形主体 X±0.4/Z±0.3（shape 内收倒角 0.03），
// 挤出总厚 0.07＝depth 0.062＋两端倒角 0.004，Y[0.83,0.9]，顶面平面区 X±0.37/Z±0.27；
// 台板收边（浅青灰）X±0.36/Z±0.26、Y[0.800,0.838]，顶面嵌入台板内部避免共面闪纹；
// 收腰柱身 Lathe 半径 0.118~0.175、Y[0.050,0.845]，两端开口分别埋入底座与收边；
// 宽底座圆角矩形 X±0.335/Z±0.235（shape 0.33/0.23＋倒角 0.005）、Y[0,0.085]，底面贴地。
import * as THREE from 'three';

// 釉面粗糙度微变化：缓波纹叠极弱噪点（NoColorSpace，乘在基础 roughness 上），不是砂纸颗粒。
function glazeRoughness() {
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  let seed = 20260941;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let v = 0; v < size; v++) for (let u = 0; u < size; u++) {
    const wave = 232 + 3.5 * Math.sin(u * 0.021 + Math.cos(v * 0.017) * 1.2) + 2 * Math.sin(v * 0.043 + u * 0.011) + (random() - 0.5) * 3;
    const i = (v * size + u) * 4;
    const tone = Math.round(Math.max(0, Math.min(255, wave)));
    data[i] = data[i + 1] = data[i + 2] = tone; data[i + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

// 圆角矩形轮廓（本地 XY 平面）：圆角只落在四角，直边保持给定半宽/半深。
function roundedRect(halfWidth, halfDepth, radius) {
  const shape = new THREE.Shape();
  shape.moveTo(-halfWidth + radius, -halfDepth);
  shape.lineTo(halfWidth - radius, -halfDepth);
  shape.quadraticCurveTo(halfWidth, -halfDepth, halfWidth, -halfDepth + radius);
  shape.lineTo(halfWidth, halfDepth - radius);
  shape.quadraticCurveTo(halfWidth, halfDepth, halfWidth - radius, halfDepth);
  shape.lineTo(-halfWidth + radius, halfDepth);
  shape.quadraticCurveTo(-halfWidth, halfDepth, -halfWidth, halfDepth - radius);
  shape.lineTo(-halfWidth, -halfDepth + radius);
  shape.quadraticCurveTo(-halfWidth, -halfDepth, -halfWidth + radius, -halfDepth);
  shape.closePath();
  return shape;
}

// 水平板：在本地 XY 画圆角矩形、沿 +Z 挤出，再绕 X 转 -90° 使挤出方向成为 +Y；
// yBottom 对应挤出几何的 z=0 面（含倒角时是下端倒角外沿）。只创建与放置 mesh，入组由调用方处理。
function slab(geometry, material, name, yBottom) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = yBottom;
  mesh.name = name;
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

export function createCeramicDisplayStand() {
  const group = new THREE.Group();
  group.name = 'ceramic-display-stand-01';
  const owned = new Set();
  const keep = (resource) => { owned.add(resource); return resource; };
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    group.removeFromParent();
    for (const resource of owned) resource.dispose();
    owned.clear(); group.clear();
  };
  try {
    const rough = keep(glazeRoughness());
    // 暖白象牙釉：柔和高光（clearcoat）叠很弱的粗糙度变化；模型自身不创建灯光或环境贴图。
    const glaze = keep(new THREE.MeshPhysicalMaterial({
      color: '#efe7da', roughness: 0.17, roughnessMap: rough, metalness: 0,
      clearcoat: 0.55, clearcoatRoughness: 0.3,
    }));
    const trim = keep(new THREE.MeshPhysicalMaterial({
      color: '#b6c3be', roughness: 0.38, roughnessMap: rough, metalness: 0,
      clearcoat: 0.3, clearcoatRoughness: 0.45,
    }));
    const add = (geometry, material, name, yBottom) => group.add(slab(keep(geometry), material, name, yBottom));

    // 厚台板：shape 内收 0.03 让倒角后的主体恰为 X±0.4/Z±0.3；顶面（Y=0.9）平面区 X±0.37/Z±0.27，
    // 完整覆盖承载矩形 X±0.32/Z±0.22，九点采样不会命中倒角斜面。
    const TOP = { depth: 0.062, bevel: 0.004, top: 0.9 };
    add(new THREE.ExtrudeGeometry(
      roundedRect(0.37, 0.27, 0.05),
      { depth: TOP.depth, bevelEnabled: true, bevelThickness: TOP.bevel, bevelSize: 0.03, bevelSegments: 3, curveSegments: 12 },
    ), glaze, '厚台板', TOP.top - TOP.depth - TOP.bevel);

    // 台板收边：浅青灰整板，四壁环绕形成台板下的一圈收边；顶面 Y=0.838 嵌入台板主体（不共面）。
    add(new THREE.ExtrudeGeometry(roundedRect(0.36, 0.26, 0.04), { depth: 0.038, bevelEnabled: false, curveSegments: 12 }), trim, '台板收边', 0.800);

    // 中央收腰柱身：Lathe 旋转体轮廓，底部展宽、腰部收细、顶部微扩托住收边；
    // 两端开口分别埋入底座（顶 0.085）与收边板（0.800~0.838）内部，外部看不到开口。
    const profile = [
      [0.150, 0.050], [0.150, 0.090], [0.175, 0.160], [0.150, 0.300],
      [0.118, 0.440], [0.118, 0.560], [0.150, 0.700], [0.172, 0.800], [0.172, 0.845],
    ].map(([radius, height]) => new THREE.Vector2(radius, height));
    // Lathe 旋转体本身绕 Y 直立，直接放置，不做水平板的转轴处理。
    const column = new THREE.Mesh(keep(new THREE.LatheGeometry(profile, 40)), glaze);
    column.name = '收腰柱身'; column.castShadow = column.receiveShadow = true;
    group.add(column);

    // 较宽低底座：圆角矩形厚板，底面 Y=0 落地，顶面 0.085 与柱身嵌接。
    const BASE = { depth: 0.075, bevel: 0.005 };
    add(new THREE.ExtrudeGeometry(
      roundedRect(0.33, 0.23, 0.06),
      { depth: BASE.depth, bevelEnabled: true, bevelThickness: BASE.bevel, bevelSize: 0.005, bevelSegments: 2, curveSegments: 12 },
    ), glaze, '宽底座', BASE.bevel);

    return { group, dispose };
  } catch (error) { dispose(); throw error; }
}

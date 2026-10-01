// 林间蜂蜜木书架（fairy-bookshelf-01）· 首款正式家具模型。
// 自 E4a 实验样件原样迁入（样件提交 f824ce3，2026-09-28；E4b-1 入库，仅改本头部说明），
// 造型、几何与材质未改动；经 web/assets/furniture/index.json 登记，由同目录 registry.js
// 按固定字面量动态导入创建。程序化建模＋自制材质：Three.js 随包副本，木纹用固定种子
// DataTexture 生成，不依赖 canvas/DOM，可在无 DOM 的 Node 中真实构造
// （tests/furniture-library.test.mjs 依赖这一点）。
// 约定：米制、+Y 向上、正面本地 +Z、底面中心为原点；根组 position/rotation 为零、
// scale 为 1；全部实体几何落在声明盒 X[-0.6,0.6]×Y[0,1.8]×Z[-0.25,0.25] 内。
// 构造不接业务数据、不内置房间坐标、不写实例 ID；dispose 幂等，只释放本次工厂
// 拥有的几何/材质/纹理（共享几何只登记一次），两实例互不释放对方资源。
import * as THREE from 'three';

/** 与底座同型的固定种子随机（LCG 家族），保证纹理可复现。 */
function seededRandom(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let n = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    n = (n + Math.imul(n ^ (n >>> 7), 61 | n)) ^ n;
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 256×256 蜂蜜木纹：低对比条纹沿纹理 U 方向变化（贴到板上即沿板长方向展开），
 * 叠加细噪点与少量节疤环。同一张纹理同时作 map（sRGB 颜色纹理）与 bumpMap。
 */
function makeWoodTexture(keep) {
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  const rng = seededRandom(20260928);
  const knots = [];
  for (let i = 0; i < 3; i++) knots.push({ u: 24 + rng() * (size - 48), v: 24 + rng() * (size - 48), r: 5 + rng() * 7 });
  for (let v = 0; v < size; v += 1) {
    const wobble = Math.sin(v * 0.055) * 3.2 + Math.sin(v * 0.017) * 6.5;
    for (let u = 0; u < size; u += 1) {
      // 主纹：沿 U 的密条纹，相位被低频扰动推弯；行间再叠一层行噪声
      const stripe = Math.sin((u + wobble) * 0.62 + Math.sin((u + wobble) * 0.11) * 2.4);
      const grain = stripe * 0.5 + 0.5;
      let tone = 213 + grain * 24 - 12 + (rng() - 0.5) * 9;
      for (const knot of knots) {
        const du = u - knot.u; const dv = v - knot.v;
        const ring = Math.sqrt(du * du + dv * dv);
        if (ring < knot.r) tone -= 14 + Math.sin(ring * 2.6) * 9; // 节疤略深
      }
      tone = Math.max(150, Math.min(245, tone));
      const index = (v * size + u) * 4;
      data[index] = tone; data[index + 1] = tone - 26; data[index + 2] = tone - 62; data[index + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace; // 当颜色纹理使用，按颜色空间标记
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return keep(texture);
}

export function createFairyBookshelf() {
  const group = new THREE.Group();
  group.name = 'fairy-bookshelf-01';
  const owned = new Set();
  const keep = (resource) => { owned.add(resource); return resource; };

  const woodMap = makeWoodTexture(keep);
  // 材质预算 8 个：蜜木主色（略深用于背板/底座）、边角轻蜡质、三色装饰书、叶、藤枝
  const woodMain = keep(new THREE.MeshStandardMaterial({ map: woodMap, bumpMap: woodMap, bumpScale: 0.014, roughness: 0.62, metalness: 0.02 }));
  const woodDeep = keep(new THREE.MeshStandardMaterial({ map: woodMap, bumpMap: woodMap, bumpScale: 0.012, color: '#cdb28c', roughness: 0.7, metalness: 0.02 }));
  const woodEdge = keep(new THREE.MeshStandardMaterial({ map: woodMap, color: '#efdcbb', roughness: 0.48, metalness: 0.03 })); // 端部压边：轻微蜡质反光
  const bookMoss = keep(new THREE.MeshStandardMaterial({ color: '#6b7d4f', roughness: 0.82 }));
  const bookBlue = keep(new THREE.MeshStandardMaterial({ color: '#7d93a8', roughness: 0.8 }));
  const bookCream = keep(new THREE.MeshStandardMaterial({ color: '#d8c39a', roughness: 0.86 }));
  const leafMat = keep(new THREE.MeshStandardMaterial({ color: '#5f7d43', roughness: 0.9, side: THREE.DoubleSide }));
  const vineMat = keep(new THREE.MeshStandardMaterial({ color: '#6a5236', roughness: 0.95 }));

  const boxGeometry = (w, h, d) => keep(new THREE.BoxGeometry(w, h, d));
  const addBox = (w, h, d, material, x, y, z) => {
    const item = new THREE.Mesh(boxGeometry(w, h, d), material);
    item.position.set(x, y, z);
    item.castShadow = true;
    item.receiveShadow = true;
    group.add(item);
    return item;
  };

  // ── 结构：底座（两层）→ 侧立板 → 背板 → 三块层板 → 顶板 → 圆润压边 ──
  addBox(1.14, 0.08, 0.42, woodDeep, 0, 0.04, 0);          // 底座主体 Y[0,0.08]
  addBox(1.18, 0.03, 0.46, woodDeep, 0, 0.095, 0);         // 底座顶沿 Y[0.08,0.11]
  addBox(0.045, 1.61, 0.44, woodMain, -0.575, 0.915, 0);   // 左立板 X[-0.5975,-0.5525] Y[0.11,1.72]
  addBox(0.045, 1.61, 0.44, woodMain, 0.575, 0.915, 0);    // 右立板
  addBox(1.06, 1.55, 0.018, woodDeep, 0, 0.885, -0.19);    // 背板 Z[-0.199,-0.181] Y[0.11,1.66]
  for (const y of [0.52, 0.94, 1.36]) addBox(1.085, 0.035, 0.42, woodMain, 0, y, 0.01); // 三块层板
  addBox(1.18, 0.05, 0.46, woodMain, 0, 1.745, 0);         // 顶板 Y[1.72,1.77]

  // 顶前圆润压边（轴沿 X 的圆柱）与两侧前棱竖圆角柱（轴沿 Y）
  const capBeam = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.026, 0.026, 1.18, 12)), woodEdge);
  capBeam.rotation.z = Math.PI / 2;
  capBeam.position.set(0, 1.772, 0.214);                    // 最前 0.24、最高 1.798
  capBeam.castShadow = true;
  group.add(capBeam);
  for (const x of [-0.575, 0.575]) {
    const roundEdge = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.018, 0.018, 1.55, 10)), woodEdge);
    roundEdge.position.set(x, 0.935, 0.201);                // X ±0.593、Z 0.219
    roundEdge.castShadow = true;
    group.add(roundEdge);
  }

  // ── 装饰书：苔绿/褪色蓝/暖米，贴背板直立，少量斜靠与平放，不铺满每层 ──
  // 层净空：A Y[0.11,0.5025]、B Y[0.5375,0.9225]、C Y[0.9575,1.3425]；顶层留给藤叶
  const standing = (x, baseY, h, material, lean = 0) => {
    const book = addBox(0.05, h, 0.17, material, x, baseY + h / 2, -0.09);
    if (lean) { book.rotation.z = lean; book.position.x += (Math.sin(lean) * h) / 2; book.position.y = baseY + (Math.cos(lean) * h) / 2 + 0.012; }
    return book;
  };
  standing(-0.44, 0.11, 0.30, bookMoss);
  standing(-0.37, 0.11, 0.26, bookBlue);
  standing(-0.30, 0.11, 0.32, bookCream);
  standing(-0.17, 0.11, 0.30, bookBlue, -0.21);             // 斜靠 12°
  standing(-0.44, 0.5375, 0.26, bookBlue);
  standing(-0.37, 0.5375, 0.30, bookCream);
  standing(-0.30, 0.5375, 0.24, bookMoss);
  standing(-0.44, 0.9575, 0.28, bookCream);
  standing(-0.37, 0.9575, 0.25, bookMoss);
  addBox(0.30, 0.05, 0.22, bookBlue, -0.05, 0.9825, -0.09); // C 层平放一册

  // ── 上角藤叶：贴背板顶沿与两角，不遮开放层与正面；细藤枝沿背板下垂 ──
  // 叶片是压扁球体，rotY 后的世界包络半径按对角 √(sx²+sz²) 校核，保证整叶留在盒内
  const leafGeometry = keep(new THREE.SphereGeometry(1, 8, 5)); // 所有叶片共享同一几何
  const leaves = [
    [-0.40, 1.772, -0.135, 0.06, 0.014, 0.09, 0.35],
    [-0.15, 1.768, -0.138, 0.058, 0.014, 0.088, -0.2],
    [0.12, 1.774, -0.132, 0.06, 0.014, 0.09, 0.55],
    [0.38, 1.77, -0.135, 0.058, 0.014, 0.088, -0.4],
    [-0.47, 1.70, -0.13, 0.055, 0.016, 0.085, 0.8],
    [0.47, 1.70, -0.13, 0.055, 0.016, 0.085, -0.7],
    [0.44, 1.32, -0.135, 0.06, 0.015, 0.088, 0.15],
  ];
  for (const [x, y, z, sx, sy, sz, rotY] of leaves) {
    const leaf = new THREE.Mesh(leafGeometry, leafMat);
    leaf.scale.set(sx, sy, sz);
    leaf.rotation.y = rotY;
    leaf.position.set(x, y, z);
    leaf.castShadow = true;
    group.add(leaf);
  }
  for (const side of [-1, 1]) {
    const vine = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.007, 0.011, 0.55, 8)), vineMat);
    vine.position.set(side * 0.47, 1.50, -0.165);
    vine.rotation.x = 0.12;
    vine.rotation.z = side * 0.06;
    vine.castShadow = true;
    group.add(vine);
  }

  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    group.removeFromParent();
    for (const resource of owned) resource.dispose();
    owned.clear();
    group.clear();
  }

  return { group, dispose };
}

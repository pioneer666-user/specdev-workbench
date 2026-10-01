// 林间蜂蜜木书桌：自制程序化候选模型，不依赖 DOM、网络或实验文件。
// 米制、+Y 向上、+Z 正面；底面中心原点。四层圆角环形成真实倒角和连续水平桌面。
import * as THREE from 'three';

function woodTexture() {
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  let seed = 20260929;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let v = 0; v < size; v++) for (let u = 0; u < size; u++) {
    // 木纹沿 U 延伸，横向 V 仅轻微起伏；不使用高对比节疤或随机大条纹。
    const wave = v + 2.2 * Math.sin(u * 0.025) + 0.8 * Math.sin(u * 0.071);
    const tone = 211 + 5 * Math.sin(wave * 0.48) + 2 * Math.sin(wave * 1.7) + (random() - 0.5) * 3;
    const i = (v * size + u) * 4;
    data[i] = tone; data[i + 1] = tone - 28; data[i + 2] = tone - 65; data[i + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

// 水平板：上下平面、圆润角点与上下斜边均为真实实体几何，顶面没有支撑替身。
function roundedBoard(width, height, depth, bevel) {
  const positions = [], uvs = [], indices = [];
  const ring = (y, inset) => {
    const radius = 0.018 - inset;
    const hx = width / 2 - inset, hz = depth / 2 - inset;
    const points = [];
    for (let corner = 0; corner < 4; corner++) {
      const angle = corner * Math.PI / 2;
      const cx = (corner === 0 || corner === 3 ? 1 : -1) * (hx - radius);
      const cz = (corner < 2 ? 1 : -1) * (hz - radius);
      for (let step = 0; step <= 4; step++) {
        const a = angle + step * Math.PI / 8;
        points.push([cx + Math.cos(a) * radius, y, cz + Math.sin(a) * radius]);
      }
    }
    return points;
  };
  const rings = [ring(-height / 2, bevel), ring(-height / 2 + bevel, 0), ring(height / 2 - bevel, 0), ring(height / 2, bevel)];
  const n = rings[0].length;
  const vertex = (p, uv) => { const id = positions.length / 3; positions.push(...p); uvs.push(...uv); return id; };
  // 环沿 XZ 逆时针；顶部反序得到 +Y 法线，侧面单独顶点保持柔和斜边与平面分界。
  for (const [level, top] of [[0, false], [3, true]]) {
    const center = vertex([0, rings[level][0][1], 0], [0.5, 0.5]);
    const ids = rings[level].map(p => vertex(p, [p[0] / width + 0.5, p[2] / depth + 0.5]));
    for (let i = 0; i < n; i++) indices.push(center, ids[top ? (i + 1) % n : i], ids[top ? i : (i + 1) % n]);
  }
  for (let level = 0; level < 3; level++) for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ids = [rings[level][i], rings[level][j], rings[level + 1][j], rings[level + 1][i]]
      .map((p, k) => vertex(p, [((k === 1 || k === 2) ? i + 1 : i) / n * 3, p[1] / height]));
    indices.push(ids[0], ids[2], ids[1], ids[0], ids[3], ids[2]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function createFairyDesk() {
  const group = new THREE.Group();
  group.name = 'fairy-desk-01';
  const owned = new Set();
  const keep = resource => { owned.add(resource); return resource; };
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    group.removeFromParent();
    for (const resource of owned) resource.dispose();
    owned.clear(); group.clear();
  };
  try {
    const map = keep(woodTexture());
    const wood = keep(new THREE.MeshStandardMaterial({ map, bumpMap: map, bumpScale: 0.002, roughness: 0.68, metalness: 0.01 }));
    const deep = keep(new THREE.MeshStandardMaterial({ map, color: '#d5bd99', roughness: 0.74 }));
    const seam = keep(new THREE.MeshStandardMaterial({ color: '#62492e', roughness: 0.9 }));
    const brass = keep(new THREE.MeshStandardMaterial({ color: '#b99955', metalness: 0.65, roughness: 0.4 }));
    const leaf = keep(new THREE.MeshStandardMaterial({ color: '#b69b60', roughness: 0.8 }));
    const add = (geometry, material, x, y, z, name) => {
      const mesh = new THREE.Mesh(keep(geometry), material);
      mesh.name = name; mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh); return mesh;
    };
    const box = (w, h, d, mat, x, y, z, name, grain = 'x') => {
      const geometry = new THREE.BoxGeometry(w, h, d);
      const p = geometry.attributes.position, uv = geometry.attributes.uv;
      for (let i = 0; i < p.count; i++) uv.setXY(i, grain === 'y' ? p.getY(i) / h + 0.5 : grain === 'z' ? p.getZ(i) / d + 0.5 : p.getX(i) / w + 0.5,
        grain === 'y' ? (p.getX(i) / w + p.getZ(i) / d) / 2 + 0.5 : p.getY(i) / h + 0.5);
      return add(geometry, mat, x, y, z, name);
    };
    add(roundedBoard(1.6, 0.06, 0.8, 0.008), wood, 0, 0.72, 0, '连续蜂蜜木桌面');
    // 四腿从地面到桌板底部；脚端收细，纹理沿腿长，桌下保持空隙。
    for (const x of [-0.675, 0.675]) for (const z of [-0.28, 0.28]) {
      const leg = box(0.092, 0.695, 0.092, wood, x, 0.3475, z, '收脚木腿', 'y');
      const p = leg.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) if (p.getY(i) < 0) p.setXYZ(i, p.getX(i) * 0.60, p.getY(i), p.getZ(i) * 0.60);
      p.needsUpdate = true; leg.geometry.computeVertexNormals();
    }
    box(1.28, 0.10, 0.038, deep, 0, 0.64, -0.28, '后桌裙');
    for (const x of [-0.675, 0.675]) {
      box(0.038, 0.10, 0.56, deep, x, 0.64, 0, '侧桌裙', 'z');
      box(0.044, 0.045, 0.52, deep, x, 0.24, 0, '侧横枨', 'z');
    }
    for (const x of [-0.465, 0.465]) box(0.39, 0.10, 0.038, deep, x, 0.64, 0.28, '前桌裙');
    box(0.52, 0.088, 0.026, seam, 0, 0.633, 0.301, '抽屉细缝');
    box(0.496, 0.070, 0.029, wood, 0, 0.633, 0.320, '静态浅抽屉面板');
    // 静态抽屉具有实际盒体：底板与侧/后板相接，低视角不会穿透到桌板。
    box(0.496, 0.012, 0.554, wood, 0, 0.604, 0.037, '抽屉底板');
    for (const x of [-0.240, 0.240]) box(0.016, 0.070, 0.540, deep, x, 0.643, 0.038, '抽屉侧板', 'z');
    box(0.496, 0.070, 0.016, deep, 0, 0.643, -0.232, '抽屉后板');
    for (const x of [-0.055, 0.055]) {
      const post = add(new THREE.CylinderGeometry(0.009, 0.009, 0.034, 10), brass, x, 0.633, 0.35, '黄铜拉手脚');
      post.rotation.x = Math.PI / 2;
    }
    const handle = add(new THREE.CylinderGeometry(0.009, 0.009, 0.128, 12), brass, 0, 0.633, 0.367, '黄铜拉手');
    handle.rotation.z = Math.PI / 2;
    for (const x of [-0.46, 0.46]) {
      const relief = add(new THREE.SphereGeometry(1, 12, 6), leaf, x, 0.647, 0.302, '叶形浅浮雕');
      relief.scale.set(0.045, 0.016, 0.004); relief.rotation.z = x > 0 ? -0.25 : 0.25;
    }
    return { group, dispose };
  } catch (error) { dispose(); throw error; }
}

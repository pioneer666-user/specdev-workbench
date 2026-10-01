// 林间暖光台灯：自制程序化候选模型，不依赖 DOM、网络或实验文件。
// 米制、+Y 向上、+Z 正面；底面中心原点。沿用占位台灯空间契约（X±0.12、Y0–0.42、Z±0.15）。
// 设计剖面（检查按此独立手算）：灯罩外半轴底(0.104,0.138)→顶(0.080,0.106)、Y 0.242→0.398，
// 壁厚 0.006；罩中部 Y=0.32 处外半轴 0.092、内半轴 0.086。灯杆中轴贯穿；支架自
// 灯头套环(r0.0185,Y0.310)伸至顶口内缘(0.074,0.100,Y0.3985)。
import * as THREE from 'three';

function woodTexture() {
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  let seed = 20260930;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let v = 0; v < size; v++) for (let u = 0; u < size; u++) {
    // 细木纹沿 U 延伸，供小底座近看；低对比，不做节疤。
    const wave = v + 1.4 * Math.sin(u * 0.031) + 0.5 * Math.sin(u * 0.083);
    const tone = 208 + 4 * Math.sin(wave * 0.55) + 2 * Math.sin(wave * 1.9) + (random() - 0.5) * 2.5;
    const i = (v * size + u) * 4;
    data[i] = tone; data[i + 1] = tone - 24; data[i + 2] = tone - 58; data[i + 3] = 255;
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

function fabricTexture() {
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  let seed = 20260931;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let v = 0; v < size; v++) for (let u = 0; u < size; u++) {
    // 暖米色低对比细布纹：经纬轻起伏加细噪，不出现条纹或大花色。
    const weave = 1.6 * Math.sin(u * 0.246) + 1.4 * Math.sin(v * 0.212) + 1.1 * Math.sin((u + v) * 0.147) + (random() - 0.5) * 2.2;
    const tone = 224 + weave;
    const i = (v * size + u) * 4;
    data[i] = tone + 6; data[i + 1] = tone - 4; data[i + 2] = tone - 26; data[i + 3] = 255;
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

// 椭圆环带侧壁：相邻环之间张成真实曲面（自下而上排列），outward 决定法线朝外或朝轴。
function ellipseWall(rings, segments, outward, uRepeat) {
  const positions = [], uvs = [], indices = [];
  const ringIds = rings.map((ring, level) => {
    const ids = [];
    for (let i = 0; i < segments; i++) {
      const t = i / segments * Math.PI * 2;
      const id = positions.length / 3;
      positions.push(ring[0] * Math.cos(t), ring[1], ring[2] * Math.sin(t));
      uvs.push(i / segments * uRepeat, level / (rings.length - 1));
      ids.push(id);
    }
    return ids;
  });
  for (let level = 0; level < rings.length - 1; level++) for (let i = 0; i < segments; i++) {
    const j = (i + 1) % segments;
    const A = ringIds[level][i], B = ringIds[level][j], C = ringIds[level + 1][j], D = ringIds[level + 1][i];
    if (outward) indices.push(A, C, B, A, D, C); else indices.push(A, B, C, A, C, D);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// 椭圆扁平环（包边）：外缘到内缘的真实窄带，up 决定法线朝上或朝下。
function annulus(y, aO, bO, aI, bI, segments, up) {
  const positions = [], uvs = [], indices = [];
  const ringOf = (a, b) => { const ids = []; for (let i = 0; i < segments; i++) {
    const t = i / segments * Math.PI * 2;
    const id = positions.length / 3;
    positions.push(a * Math.cos(t), y, b * Math.sin(t));
    uvs.push(a * Math.cos(t) / 0.3 + 0.5, b * Math.sin(t) / 0.3 + 0.5);
    ids.push(id);
  } return ids; };
  const outer = ringOf(aO, bO), inner = ringOf(aI, bI);
  for (let i = 0; i < segments; i++) {
    const j = (i + 1) % segments;
    if (up) indices.push(outer[i], inner[i], outer[j], inner[i], inner[j], outer[j]);
    else indices.push(outer[i], outer[j], inner[i], inner[i], outer[j], inner[j]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// 圆盘（底座上下封板）：真实封板，不是悬空轮廓。
function disc(y, r, segments, up) {
  const positions = [], uvs = [], indices = [];
  const center = positions.length / 3;
  positions.push(0, y, 0); uvs.push(0.5, 0.5);
  const ring = [];
  for (let i = 0; i < segments; i++) {
    const t = i / segments * Math.PI * 2;
    const id = positions.length / 3;
    positions.push(r * Math.cos(t), y, r * Math.sin(t));
    uvs.push(Math.cos(t) * 0.5 + 0.5, Math.sin(t) * 0.5 + 0.5);
    ring.push(id);
  }
  for (let i = 0; i < segments; i++) {
    const j = (i + 1) % segments;
    if (up) indices.push(center, ring[j], ring[i]); else indices.push(center, ring[i], ring[j]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function createFairyTableLamp() {
  const group = new THREE.Group();
  group.name = 'fairy-table-lamp-01';
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
    const wood = keep(woodTexture());
    const cloth = keep(fabricTexture());
    const honey = keep(new THREE.MeshStandardMaterial({ map: wood, bumpMap: wood, bumpScale: 0.0015, roughness: 0.66, metalness: 0.01 }));
    const brass = keep(new THREE.MeshStandardMaterial({ color: '#c19a5e', metalness: 0.7, roughness: 0.34 }));
    const fabric = keep(new THREE.MeshStandardMaterial({ map: cloth, bumpMap: cloth, bumpScale: 0.0012, roughness: 0.94 }));
    const lining = keep(new THREE.MeshStandardMaterial({ color: '#f2e3c2', roughness: 0.97 }));
    const trim = keep(new THREE.MeshStandardMaterial({ color: '#d9c49c', roughness: 0.88 }));
    const glow = keep(new THREE.MeshStandardMaterial({ color: '#ffe7c4', emissive: '#ffb46a', emissiveIntensity: 0.5, roughness: 0.4 }));
    const add = (geometry, material, x, y, z, name) => {
      const mesh = new THREE.Mesh(keep(geometry), material);
      mesh.name = name; mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh); return mesh;
    };
    // 低矮圆润蜂蜜木底座：下盘触地 Y=0，侧壁上收出柔和圆肩，顶盘承接黄铜套环。
    add(disc(0, 0.0905, 40, false), honey, 0, 0, 0, '底座下盘');
    add(ellipseWall([[0.0905, 0, 0.0905], [0.0905, 0.028, 0.0905], [0.088, 0.0325, 0.088], [0.0825, 0.035, 0.0825]], 40, true, 3), honey, 0, 0, 0, '底座侧壁');
    add(disc(0.035, 0.0825, 40, true), honey, 0, 0, 0, '底座顶盘');
    const leaf = add(new THREE.SphereGeometry(1, 12, 6), brass, 0, 0.0175, 0.0885, '黄铜叶纹嵌片');
    leaf.scale.set(0.024, 0.009, 0.004); leaf.rotation.z = 0.35;
    // 黄铜灯杆经两道套环真实连接底座与灯头，罩、杆都不悬浮。
    add(new THREE.CylinderGeometry(0.017, 0.019, 0.016, 14), brass, 0, 0.041, 0, '底座黄铜套环');
    add(new THREE.CylinderGeometry(0.0095, 0.0095, 0.254, 10), brass, 0, 0.173, 0, '灯杆');
    add(new THREE.CylinderGeometry(0.0185, 0.0185, 0.016, 14), brass, 0, 0.305, 0, '灯头黄铜套环');
    add(new THREE.CylinderGeometry(0.0155, 0.0155, 0.035, 12), brass, 0, 0.3285, 0, '灯座');
    add(new THREE.SphereGeometry(0.030, 16, 12), glow, 0, 0.358, 0, '灯泡');
    // 三根细支架从灯头套环伸向罩顶内缘，灯罩由此真实承托；上下口保持敞开。
    for (const degree of [30, 150, 270]) {
      const t = degree * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
      const from = new THREE.Vector3(0.0185 * c, 0.310, 0.0185 * s);
      const to = new THREE.Vector3(0.074 * c, 0.3985, 0.100 * s);
      const strut = add(new THREE.BoxGeometry(0.008, from.distanceTo(to), 0.008), brass, (from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2, '灯罩支架');
      strut.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
    }
    // 微锥布灯罩：外壁、内衬与上下薄包边各有真实几何与厚度，上下开口。
    add(ellipseWall([[0.104, 0.242, 0.138], [0.080, 0.398, 0.106]], 48, true, 4), fabric, 0, 0, 0, '灯罩外壁');
    add(ellipseWall([[0.098, 0.242, 0.132], [0.074, 0.398, 0.100]], 48, false, 1), lining, 0, 0, 0, '灯罩内衬');
    add(annulus(0.398, 0.080, 0.106, 0.074, 0.100, 48, true), trim, 0, 0, 0, '上包边');
    add(annulus(0.242, 0.104, 0.138, 0.098, 0.132, 48, false), trim, 0, 0, 0, '下包边');
    return { group, dispose };
  } catch (error) { dispose(); throw error; }
}

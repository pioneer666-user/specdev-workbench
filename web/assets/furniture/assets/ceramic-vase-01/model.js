// 暖釉细颈花瓶：自制程序化候选模型，不依赖 DOM、网络或实验文件。
// 米制、+Y 向上、+Z 正面；底面中心原点。冻结包络 X、Z 各 ±0.08、Y[0,0.30]。
// 设计常数（检查按此独立手算）：外壳 lathe 剖面外底近轴 (0.001,0)→底足缘 (0.053,0.006)
// →足上收腰 (0.046,0.022)→瓶腹最宽 (0.074,0.105)→肩 (0.049,0.212)→颈 (0.0265,0.262)
// →外翻口沿 (0.041,0.294)→口沿顶外缘 (0.041,0.299)；口沿顶环外 0.041／内 0.033 @Y0.299；
// 内壁剖面自口内缘 (0.033,0.299) 下行至内底缘 (0.045,0.030)；内底圆盘 r0.045 @Y0.030。
// 腹部壁厚 0.074−0.066=0.008；底部实心厚 0.030。空瓶不插花，顶部中央为真实开口。
import * as THREE from 'three';

// 釉面粗糙度微变：NoColorSpace 数据纹理，数值接近 255，只轻微扰动基础粗糙度。
function glazeRoughness() {
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  let seed = 20260951;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let v = 0; v < size; v++) for (let u = 0; u < size; u++) {
    const wave = 240 + 3 * Math.sin((u + 1.5 * Math.sin(v * 0.04)) * 0.05) + 2 * Math.sin(v * 0.021) + (random() - 0.5) * 2;
    const i = (v * size + u) * 4;
    data[i] = data[i + 1] = data[i + 2] = Math.max(0, Math.min(255, Math.round(wave)));
    data[i + 3] = 255;
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

// 椭圆扁平环（口沿顶面）：外缘到内缘的真实窄环，法线朝上。
function annulus(y, rOuter, rInner, segments) {
  const positions = [], indices = [];
  const ringOf = (r) => { const ids = []; for (let i = 0; i < segments; i++) {
    const t = i / segments * Math.PI * 2;
    const id = positions.length / 3;
    positions.push(r * Math.cos(t), y, r * Math.sin(t));
    ids.push(id);
  } return ids; };
  const outer = ringOf(rOuter), inner = ringOf(rInner);
  for (let i = 0; i < segments; i++) {
    const j = (i + 1) % segments;
    indices.push(outer[i], inner[i], outer[j], inner[i], inner[j], outer[j]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// 圆盘（内瓶底）：真实封底，法线朝上（腔内可见）。
function disc(y, r, segments) {
  const positions = [], indices = [];
  const center = positions.length / 3;
  positions.push(0, y, 0);
  const ring = [];
  for (let i = 0; i < segments; i++) {
    const t = i / segments * Math.PI * 2;
    const id = positions.length / 3;
    positions.push(r * Math.cos(t), y, r * Math.sin(t));
    ring.push(id);
  }
  for (let i = 0; i < segments; i++) {
    const j = (i + 1) % segments;
    indices.push(center, ring[j], ring[i]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function createCeramicVase() {
  const group = new THREE.Group();
  group.name = 'ceramic-vase-01';
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
    const glaze = keep(new THREE.MeshPhysicalMaterial({ color: '#e8e2d3', roughness: 0.16, roughnessMap: rough, clearcoat: 0.6, clearcoatRoughness: 0.25 }));
    const innerGlaze = keep(new THREE.MeshStandardMaterial({ color: '#cfc8b8', roughness: 0.55 }));
    const add = (geometry, material, name) => {
      const mesh = new THREE.Mesh(keep(geometry), material);
      mesh.name = name; mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh); return mesh;
    };
    // 瓶身外壳：真实旋转曲面，含外底封底、底足、收腰、瓶腹、肩、细颈与外翻口沿；
    // 剖面自下而上，法线朝外，顶部止于口沿顶外缘。
    add(new THREE.LatheGeometry([
      new THREE.Vector2(0.001, 0), new THREE.Vector2(0.045, 0), new THREE.Vector2(0.053, 0.006),
      new THREE.Vector2(0.053, 0.016), new THREE.Vector2(0.046, 0.022), new THREE.Vector2(0.064, 0.055),
      new THREE.Vector2(0.074, 0.105), new THREE.Vector2(0.071, 0.160), new THREE.Vector2(0.049, 0.212),
      new THREE.Vector2(0.030, 0.238), new THREE.Vector2(0.0265, 0.262), new THREE.Vector2(0.029, 0.278),
      new THREE.Vector2(0.041, 0.294), new THREE.Vector2(0.041, 0.299),
    ], 36), glaze, '瓶身外壳');
    // 口沿顶面：外缘 0.041 到内缘 0.033 的真实窄环，顶部中央由此保持开口。
    add(annulus(0.299, 0.041, 0.033, 36), glaze, '瓶口沿面');
    // 瓶内壁：自口沿内缘下行到内底缘的旋转曲面，法线朝腔内；与外壳之间是真实壁厚。
    add(new THREE.LatheGeometry([
      new THREE.Vector2(0.033, 0.299), new THREE.Vector2(0.031, 0.288), new THREE.Vector2(0.023, 0.262),
      new THREE.Vector2(0.027, 0.238), new THREE.Vector2(0.041, 0.212), new THREE.Vector2(0.063, 0.155),
      new THREE.Vector2(0.066, 0.105), new THREE.Vector2(0.062, 0.055), new THREE.Vector2(0.045, 0.030),
    ], 36), innerGlaze, '瓶内壁');
    // 内瓶底：封闭的瓶内底面，空瓶有底。
    add(disc(0.030, 0.045, 36), innerGlaze, '瓶内底');
    return { group, dispose };
  } catch (error) { dispose(); throw error; }
}

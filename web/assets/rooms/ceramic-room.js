import * as THREE from 'three';
import { createCeramicReflection } from './ceramic-reflection.js';
import { createDoorHandle } from './door.js';

const SIZE = Object.freeze({ width: 8, depth: 6, height: 3.4 });
const DOOR = Object.freeze({ wall: 'north', centerX: 2.25, width: 1.4, height: 2.55 });

function dataTexture(data, width, height, name, color = false) {
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.name = name;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function makePorcelainTextures() {
  const width = 1024;
  const height = 768;
  const colour = new Uint8Array(width * height * 4);
  const roughness = new Uint8Array(width * height * 4);
  const glaze = new Uint8Array(width * height * 4);
  const normal = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const px = (x + 0.5) / width * 8;
      const py = (y + 0.5) / height * 6;
      const tx = px % 1;
      const ty = py % 1;
      const edge = Math.min(tx, 1 - tx, ty, 1 - ty);
      const joint = 1 - THREE.MathUtils.smoothstep(edge, 0.0035, 0.012);
      const tileTone = Math.sin(Math.floor(px) * 19.3 + Math.floor(py) * 29.1) * 1.4;
      const silk = Math.sin(px * 13 + Math.cos(py * 7) * 1.8) * Math.cos(py * 12) * 1.15;
      const cloud = Math.sin(px * 4.3 + py * 1.2) * Math.sin(py * 5.8 - px * 0.9) * 1.6;
      const grain = Math.sin(x * 1.71 + y * 2.31) * 0.32;
      const value = 241 + tileTone + silk + cloud + grain;
      const offset = (y * width + x) * 4;
      colour[offset] = Math.round(THREE.MathUtils.lerp(value + 2, 181, joint));
      colour[offset + 1] = Math.round(THREE.MathUtils.lerp(value + 1, 183, joint));
      colour[offset + 2] = Math.round(THREE.MathUtils.lerp(value - 2, 178, joint));
      colour[offset + 3] = 255;
      const rough = Math.round(THREE.MathUtils.lerp(47 + cloud * 2.0, 176, joint));
      roughness[offset] = roughness[offset + 1] = roughness[offset + 2] = rough;
      roughness[offset + 3] = 255;
      // 缓慢变化的波纹，而不是砂纸颗粒；细缝在反射掩码中单独变哑。
      const dx = Math.sin(px * 17.3 + Math.cos(py * 9.7)) * 0.035 + Math.cos(py * 38 + px * 21) * 0.01;
      const dy = Math.cos(py * 19.1 + Math.sin(px * 11.2)) * 0.035 + Math.sin(px * 27 - py * 31) * 0.01;
      normal[offset] = glaze[offset] = Math.round(128 + dx * 127);
      normal[offset + 1] = glaze[offset + 1] = Math.round(128 + dy * 127);
      normal[offset + 2] = 255;
      normal[offset + 3] = glaze[offset + 3] = 255;
      glaze[offset + 2] = Math.round((1 - joint) * 255);
    }
  }
  return {
    map: dataTexture(colour, width, height, '珍珠陶瓷 / 一米砖与细灰缝', true),
    roughnessMap: dataTexture(roughness, width, height, '珍珠陶瓷 / 釉面粗糙度'),
    normalMap: dataTexture(normal, width, height, '珍珠陶瓷 / 轻微釉面起伏'),
    glaze: dataTexture(glaze, width, height, '珍珠陶瓷 / 反射釉层与灰缝掩码'),
  };
}

export function createCeramicRoom({ renderer, scene, reducedMotion = false, doorOpen } = {}) {
  if (doorOpen !== undefined && typeof doorOpen !== 'boolean') {
    throw new Error(`createCeramicRoom 的 doorOpen 只接受 true、false 或不传，收到「${String(doorOpen)}」（${typeof doorOpen}），不能猜测门的初始状态。`);
  }
  const group = new THREE.Group();
  group.name = 'room-ceramic / 珍珠白瓷';
  const walls = [];
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  let disposed = false;
  const ownMaterial = (material) => { materials.add(material); return material; };
  const ownTexture = (texture) => { textures.add(texture); return texture; };
  const porcelain = makePorcelainTextures();
  Object.values(porcelain).forEach(ownTexture);
  const floorMaterial = ownMaterial(new THREE.MeshPhysicalMaterial({
    name: '珍珠白釉 / 镜面与细微起伏',
    map: porcelain.map,
    roughnessMap: porcelain.roughnessMap,
    roughness: 1,
    normalMap: porcelain.normalMap,
    normalScale: new THREE.Vector2(0.85, 0.85),
    metalness: 0,
    clearcoat: 0.72,
    clearcoatRoughness: 0.09,
    envMapIntensity: 0.72,
    ior: 1.48,
  }));
  const wallMaterial = ownMaterial(new THREE.MeshPhysicalMaterial({
    name: '暖雾色陶板墙', color: '#dfdfd7', roughness: 0.48,
    metalness: 0, clearcoat: 0.16, clearcoatRoughness: 0.35,
  }));
  wallMaterial.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `
      #include <common>
      varying vec3 vPorcelainPosition;
    `).replace('#include <project_vertex>', `
      #include <project_vertex>
      vPorcelainPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `
      #include <common>
      varying vec3 vPorcelainPosition;
    `).replace('#include <color_fragment>', `
      #include <color_fragment>
      float row = vPorcelainPosition.y / 0.24;
      vec2 tileUv = vec2((vPorcelainPosition.x + vPorcelainPosition.z) / 0.8 + mod(floor(row), 2.0) * 0.5, row);
      vec2 seamDist = min(fract(tileUv), 1.0 - fract(tileUv));
      vec2 seamAA = fwidth(tileUv) * 0.7;
      vec2 seam = 1.0 - smoothstep(vec2(0.002), vec2(0.002) + seamAA, seamDist);
      float tileShade = sin(floor(tileUv.x) * 7.3 + floor(tileUv.y) * 13.9) * 0.006;
      diffuseColor.rgb *= 1.0 + tileShade - max(seam.x, seam.y) * 0.055;
    `);
  };
  wallMaterial.customProgramCacheKey = () => 'room-ceramic-wall-grid-v1';
  const trimMaterial = ownMaterial(new THREE.MeshStandardMaterial({ name: '亚光暖白边框', color: '#f2eee4', roughness: 0.29 }));
  const baseMaterial = ownMaterial(new THREE.MeshStandardMaterial({ name: '石材地台侧沿', color: '#d6d3c9', roughness: 0.7 }));
  const shadowMaterial = ownMaterial(new THREE.MeshStandardMaterial({ name: '细窄阴缝', color: '#858981', roughness: 0.8 }));
  const metalMaterial = ownMaterial(new THREE.MeshStandardMaterial({ name: '香槟拉丝金属', color: '#aaa28b', metalness: 0.8, roughness: 0.26 }));
  const doorMaterial = ownMaterial(new THREE.MeshStandardMaterial({ name: '浅米灰门扇', color: '#c9c5b7', roughness: 0.4 }));
  const glassMaterial = ownMaterial(new THREE.MeshPhysicalMaterial({
    name: '淡色通透窗玻璃', color: '#e5ece5', metalness: 0, roughness: 0.12,
    transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide,
    clearcoat: 1, clearcoatRoughness: 0.1,
  }));

  function box(parent, name, width, height, depth, x, y, z, material = wallMaterial) {
    const geometry = new THREE.BoxGeometry(width, height, depth);
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function wall(name, x, z) {
    const wallGroup = new THREE.Group();
    wallGroup.name = name;
    group.add(wallGroup);
    walls.push({ group: wallGroup, normal: new THREE.Vector3(x, 0, z) });
    return wallGroup;
  }
  function ribbon(parent, name, length, x, z, alongZ = false) {
    box(parent, `${name} / 踢脚`, alongZ ? 0.026 : length, 0.13, alongZ ? length : 0.026, x, 0.065, z, trimMaterial);
    box(parent, `${name} / 顶边`, alongZ ? 0.065 : length, 0.065, alongZ ? length : 0.065, x, 3.365, z, trimMaterial);
    box(parent, `${name} / 顶边阴缝`, alongZ ? 0.022 : length, 0.008, alongZ ? length : 0.022, x, 3.319, z, shadowMaterial);
  }

  box(group, '整块室内地台', 8.4, 0.22, 6.4, 0, -0.135, 0, baseMaterial);
  box(group, '地台下缘细线', 8.32, 0.025, 6.32, 0, -0.257, 0, shadowMaterial);
  const floorGeometry = new THREE.PlaneGeometry(8, 6);
  geometries.add(floorGeometry);
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.name = '可摆放地面 / 珍珠陶瓷';
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0;
  floor.receiveShadow = true;
  group.add(floor);

  const north = wall('北墙 / 外开门', 0, -1);
  const west = wall('西墙 / 天光高窗', -1, 0);
  const east = wall('东墙', 1, 0);
  const south = wall('南墙', 0, 1);
  // 墙内侧严格落在 +/-4、+/-3。北侧墙厚角归侧墙，裁掉门墙时仍保留侧墙收口；
  // 不加独立角块、不挤占净空。窗台等固定突出构件另由模板 fixture 描述。
  box(north, '门左墙', 5.55, 3.4, 0.18, -1.225, 1.7, -3.09);
  box(north, '门右墙', 1.05, 3.4, 0.18, 3.475, 1.7, -3.09);
  box(north, '门上过梁', 1.4, 0.85, 0.18, 2.25, 2.975, -3.09);
  ribbon(north, '门左', 5.55, -1.225, -2.988);
  ribbon(north, '门右', 1.05, 3.475, -2.988);
  box(north, '北墙连续顶线', 1.4, 0.065, 0.065, 2.25, 3.365, -2.99, trimMaterial);
  box(east, '东墙墙体', 0.18, 3.4, 6.18, 4.09, 1.7, -0.09);
  ribbon(east, '东墙', 6, 3.987, 0, true);
  box(south, '南墙墙体', 8.36, 3.4, 0.18, 0, 1.7, 3.09);
  ribbon(south, '南墙', 8, 0, 2.987);

  // 左墙高窗：3.6 × 1.75 m，窗下仍有完整可用墙面。
  const windowZ = -0.45;
  const windowWidth = 3.6;
  const windowBottom = 1.12;
  const windowTop = 2.87;
  box(west, '窗下实墙', 0.18, windowBottom, 6.18, -4.09, windowBottom / 2, -0.09);
  box(west, '窗上实墙', 0.18, 3.4 - windowTop, 6.18, -4.09, (3.4 + windowTop) / 2, -0.09);
  box(west, '窗北侧实墙', 0.18, windowTop - windowBottom, 0.93, -4.09, (windowTop + windowBottom) / 2, -2.715);
  box(west, '窗南侧实墙', 0.18, windowTop - windowBottom, 1.65, -4.09, (windowTop + windowBottom) / 2, 2.175);
  ribbon(west, '西墙', 6, -3.987, 0, true);
  box(west, '窗台 / 白瓷倒角感', 0.31, 0.065, windowWidth + 0.18, -4.025, windowBottom, windowZ, trimMaterial);
  box(west, '窗框上沿', 0.18, 0.065, windowWidth + 0.13, -4.075, windowTop, windowZ, trimMaterial);
  for (const z of [windowZ - windowWidth / 2, windowZ + windowWidth / 2]) {
    box(west, '窗框立边', 0.17, windowTop - windowBottom, 0.065, -4.075, (windowTop + windowBottom) / 2, z, trimMaterial);
  }
  for (const z of [windowZ - 0.6, windowZ + 0.6]) {
    box(west, '纤细窗格', 0.095, windowTop - windowBottom, 0.04, -4.045, (windowTop + windowBottom) / 2, z, trimMaterial);
  }
  box(west, '窗格横梁', 0.08, 0.035, windowWidth, -4.055, 2.29, windowZ, trimMaterial);
  const windowGeometry = new THREE.BoxGeometry(0.024, windowTop - windowBottom, windowWidth);
  geometries.add(windowGeometry);
  const glass = new THREE.Mesh(windowGeometry, glassMaterial);
  glass.name = '高窗玻璃';
  glass.position.set(-4.075, (windowTop + windowBottom) / 2, windowZ);
  west.add(glass);

  // 门洞不是在完整墙面上贴一块门图；室内到室外有真正贯通的净空。
  for (const z of [-2.976, -3.204]) {
    for (const x of [1.51, 2.99]) box(north, '双面门框立边', 0.08, 2.59, 0.055, x, 1.295, z, trimMaterial);
    box(north, '双面门框过梁', 1.56, 0.085, 0.055, 2.25, 2.59, z, trimMaterial);
  }
  box(north, '门洞右侧套口', 0.035, 2.55, 0.24, 2.933, 1.275, -3.09, trimMaterial);
  box(north, '门洞左侧套口', 0.035, 2.55, 0.24, 1.567, 1.275, -3.09, trimMaterial);
  box(north, '门槛', 1.4, 0.023, 0.38, 2.25, 0.006, -3.12, trimMaterial);
  const hinge = new THREE.Group();
  hinge.name = '固定向外开启的门扇';
  hinge.position.set(1.59, 0, -3.17);
  // doorOpen 不传时保留历史展示角 1.17（算 isOpen=true）；显式 true/false 才落到统一端点。
  hinge.rotation.y = doorOpen === undefined ? 1.17 : (doorOpen ? Math.PI / 2 : 0);
  north.add(hinge);
  box(hinge, '门扇', 1.32, 2.51, 0.065, 0.66, 1.27, 0, doorMaterial);
  for (const z of [-0.035, 0.035]) {
    box(hinge, '门板内嵌边左', 0.012, 2.17, 0.006, 0.13, 1.27, z, trimMaterial);
    box(hinge, '门板内嵌边右', 0.012, 2.17, 0.006, 1.19, 1.27, z, trimMaterial);
    for (const y of [0.185, 2.355]) box(hinge, '门板内嵌横边', 1.072, 0.012, 0.006, 0.66, y, z, trimMaterial);
    box(hinge, '门把手底座', 0.038, 0.17, 0.02, 1.16, 1.12, z * 1.5, metalMaterial);
    box(hinge, '门把手支柱', 0.035, 0.035, 0.085, 1.16, 1.14, z * 2.3, metalMaterial);
    box(hinge, '门把手握柄', 0.15, 0.029, 0.027, 1.105, 1.14, z * 3.4, metalMaterial);
  }
  for (const y of [0.4, 1.25, 2.1]) box(hinge, '拉丝门铰', 0.035, 0.12, 0.082, 0, y, 0, metalMaterial);

  // 窗光与窗属于同一个墙组，被剖开的墙不会留下悬空窗框或光源。
  const windowFill = new THREE.SpotLight('#fff5df', 20, 13, Math.PI / 3.7, 0.72, 1.4);
  windowFill.name = '柔和窗光';
  windowFill.position.set(-3.88, 2.8, windowZ);
  const lightTarget = new THREE.Object3D();
  lightTarget.position.set(1.25, 0.0, 1.1);
  windowFill.target = lightTarget;
  windowFill.castShadow = false;
  west.add(windowFill, lightTarget);

  const reflection = createCeramicReflection({ surface: floor, material: floorMaterial, glazeTexture: porcelain.glaze, renderer, scene });
  return {
    group,
    walls,
    door: createDoorHandle(hinge),
    applyBrightness(p) { if (disposed) return; windowFill.intensity = p.windowFill; floorMaterial.envMapIntensity = p.porcelainEnv; },
    update() { /* 静态陶瓷空间没有循环动画；反射在实际渲染时跟随相机。 */ },
    dispose() {
      if (disposed) return;
      disposed = true;
      reflection.dispose();
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      textures.forEach((texture) => texture.dispose());
      group.removeFromParent();
      group.clear();
    },
    meta: {
      id: 'room-ceramic-pearl-v1',
      name: '珍珠白瓷',
      dimensions: { ...SIZE },
      door: { ...DOOR, position: [2.25, 0, -3], opens: 'outward' },
      floorBounds: { minX: -4, maxX: 4, minZ: -3, maxZ: 3, y: 0 },
      window: { wall: 'west', centerZ: windowZ, width: windowWidth, bottom: windowBottom, top: windowTop },
      furniture: [],
      reflection: '实时镜像相机 + 线性离屏渲染 + 釉面扰动 + 柔化取样',
      reducedMotion,
      description: '暖白陶瓷砖、细灰缝、微起伏釉面、高窗长反光与双面精细门框；室内净空保持规则长方体。',
    },
  };
}

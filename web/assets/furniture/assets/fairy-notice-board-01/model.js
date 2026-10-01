// 林间蜂蜜木告示牌：自制程序化候选模型，不依赖 DOM、网络或实验文件。
// 米制、+Y 向上、+Z 正面（软木面板朝向）；底面中心原点。冻结包络 X±0.5、Y[0,1.7]、Z±0.22。
// 设计常数（检查按此独立手算）：木框外半宽 0.46、底 0.80、拱脚 1.30、拱顶 1.60、
// 圆角 0.03；框带宽 0.055；框体挤出 Z[-0.045,0.045]＋倒角 0.008；软木板 Z[-0.005,0.035]；
// 背板 Z[-0.045,-0.005]；立柱 x=±0.40（截面 0.09×0.074，Y[0.04,1.56]，前面 z=0.037
// 略凸出于软木板前面 0.035，避免共面闪纹）；短脚 X[±0.35,±0.45]、
// Y[0,0.045]、Z±0.19；横撑 Y[0.48,0.52]；柱顶黄铜球 r0.032@Y1.578；铆钉 r0.014@Z0.053。
import * as THREE from 'three';

function woodTexture() {
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  let seed = 20260932;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let v = 0; v < size; v++) for (let u = 0; u < size; u++) {
    // 低对比细木纹沿 U 延伸，与书桌、书架同系列；不做节疤。
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

function corkTexture() {
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  let seed = 20260933;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let v = 0; v < size; v++) for (let u = 0; u < size; u++) {
    // 暖米色软木：细颗粒噪点叠加少量深色碎屑，不出现条纹或图案。
    const grain = (random() - 0.5) * 9 + 2.2 * Math.sin(u * 0.71) * Math.sin(v * 0.63);
    const speck = random() < 0.012 ? -26 : 0;
    const tone = 226 + grain + speck;
    const i = (v * size + u) * 4;
    data[i] = tone + 8; data[i + 1] = tone - 6; data[i + 2] = tone - 34; data[i + 3] = 255;
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

// 拱顶外轮廓：底边圆角 r，两侧直边到拱脚，两条二次曲线汇于拱顶；按 inset 收缩得框内孔。
function boardOutline(halfWidth, bottom, spring, peak, radius) {
  const path = new THREE.Path();
  path.moveTo(-halfWidth + radius, bottom);
  path.lineTo(halfWidth - radius, bottom);
  path.quadraticCurveTo(halfWidth, bottom, halfWidth, bottom + radius);
  path.lineTo(halfWidth, spring);
  path.quadraticCurveTo(halfWidth, peak, 0, peak);
  path.quadraticCurveTo(-halfWidth, peak, -halfWidth, spring);
  path.lineTo(-halfWidth, bottom + radius);
  path.quadraticCurveTo(-halfWidth, bottom, -halfWidth + radius, bottom);
  path.closePath();
  return path;
}

export function createFairyNoticeBoard() {
  const group = new THREE.Group();
  group.name = 'fairy-notice-board-01';
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
    const wood = keep(woodTexture());
    const cork = keep(corkTexture());
    const honey = keep(new THREE.MeshStandardMaterial({ map: wood, bumpMap: wood, bumpScale: 0.0015, roughness: 0.66, metalness: 0.01 }));
    const backWood = keep(new THREE.MeshStandardMaterial({ color: '#dcc39a', map: wood, bumpMap: wood, bumpScale: 0.0012, roughness: 0.78 }));
    const corkMat = keep(new THREE.MeshStandardMaterial({ map: cork, bumpMap: cork, bumpScale: 0.004, roughness: 0.95 }));
    const brass = keep(new THREE.MeshStandardMaterial({ color: '#c19a5e', metalness: 0.7, roughness: 0.34 }));
    const add = (geometry, material, x, y, z, name) => {
      const mesh = new THREE.Mesh(keep(geometry), material);
      mesh.name = name; mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh); return mesh;
    };

    // 面板三件：木框（真实倒角挤出，孔内嵌板）、软木正面板、木质背板；三者都有实际厚度。
    const OUTER = { halfWidth: 0.46, bottom: 0.80, spring: 1.30, peak: 1.60, radius: 0.03 };
    const inset = 0.055;
    const frameShape = new THREE.Shape(boardOutline(OUTER.halfWidth, OUTER.bottom, OUTER.spring, OUTER.peak, OUTER.radius).getPoints(16));
    frameShape.holes.push(boardOutline(
      OUTER.halfWidth - inset, OUTER.bottom + inset, OUTER.spring - inset, OUTER.peak - inset, OUTER.radius,
    ));
    add(new THREE.ExtrudeGeometry(frameShape, { depth: 0.09, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2, curveSegments: 16 }), honey, 0, 0, -0.045, '木框');
    const panelShape = new THREE.Shape(boardOutline(
      OUTER.halfWidth - inset, OUTER.bottom + inset, OUTER.spring - inset, OUTER.peak - inset, OUTER.radius,
    ).getPoints(16));
    add(new THREE.ExtrudeGeometry(panelShape, { depth: 0.04, bevelEnabled: false, curveSegments: 16 }), corkMat, 0, 0, -0.005, '软木正面板');
    add(new THREE.ExtrudeGeometry(panelShape, { depth: 0.04, bevelEnabled: false, curveSegments: 16 }), backWood, 0, 0, -0.045, '木质背板');

    // 两根立柱与向前后延伸的短脚：脚底到 Y=0，柱、脚、面板真实嵌接，不悬空。
    for (const side of [-1, 1]) {
      const label = side < 0 ? '左' : '右';
      add(new THREE.BoxGeometry(0.09, 1.52, 0.074), honey, side * 0.40, 0.80, 0, `${label}立柱`);
      add(new THREE.BoxGeometry(0.10, 0.045, 0.38), honey, side * 0.40, 0.0225, 0, `${label}短脚`);
      add(new THREE.SphereGeometry(0.032, 14, 10), brass, side * 0.40, 1.578, 0, '柱顶黄铜球');
    }
    add(new THREE.BoxGeometry(0.72, 0.04, 0.06), honey, 0, 0.50, 0, '背侧横撑');

    // 少量黄铜铆钉：底角、拱肩与拱冠各就位在框带中线上，正面主要区域保持留白。
    for (const [x, y] of [[-0.4325, 0.8275], [0.4325, 0.8275], [-0.4325, 1.3275], [0.4325, 1.3275], [0, 1.5725]]) {
      add(new THREE.SphereGeometry(0.014, 10, 6), brass, x, y, 0.053, '黄铜铆钉');
    }
    return { group, dispose };
  } catch (error) { dispose(); throw error; }
}

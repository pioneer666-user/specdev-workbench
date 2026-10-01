// 林间小叶盆栽：自制程序化候选模型，不依赖 DOM、网络或实验文件。
// 米制、+Y 向上、+Z 正面；底面中心原点。冻结包络 X、Z 各 ±0.11、Y[0,0.36]。
// 设计常数（检查按此独立手算）：盆外壳 lathe 外底近轴 (0.001,0)→外底缘 (0.058,0)→
// 底缘圆角 (0.064,0.008)→盆壁 (0.072,0.080)→口外缘 (0.076,0.092)→厚边顶 (0.070,0.098)；
// 盆口沿面环外 0.070／内 0.0665 @Y0.098；盆内壁 lathe 自口内缘 (0.0665,0.098) 下行至
// 内底缘 (0.052,0.034)→内底近轴 (0.001,0.032)；土面圆盘 r0.058 @Y0.078；
// 主枝自土内 (0.008,0.070,0.004) 至 (0.020,0.178,0.010)（r0.005），
// 两分枝自 (0.015,0.150,0.008) 分别至 (−0.030,0.210,−0.020) 与 (0.032,0.222,0.018)（r0.0035）；
// 八片薄弧叶（球体压扁 0.036×0.005×0.015）叶柄端接枝：叶心自所接枝端沿朝向偏移 0.024，
// 小于长半轴 0.036，枝端点始终嵌在叶体内；随机翻转只绕长轴（rotateX），实测叶簇最高约 Y0.27。
// 无动画、光点或实际灯光；每叶有薄厚度，枝入土、叶接枝，不出现漂浮叶。
import * as THREE from 'three';

// 圆盘（土面）：法线朝上的真实面。
// 椭圆扁平环（盆口沿面）：厚边顶面的真实窄环。
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

export function createFairyPottedPlant() {
  const group = new THREE.Group();
  group.name = 'fairy-potted-plant-01';
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
    const terra = keep(new THREE.MeshStandardMaterial({ color: '#b06f4e', roughness: 0.85 }));
    const soil = keep(new THREE.MeshStandardMaterial({ color: '#4a3626', roughness: 0.97 }));
    const stem = keep(new THREE.MeshStandardMaterial({ color: '#5a4a33', roughness: 0.8 }));
    const greenDeep = keep(new THREE.MeshStandardMaterial({ color: '#3c5232', roughness: 0.7 }));
    const greenMid = keep(new THREE.MeshStandardMaterial({ color: '#4f6b3c', roughness: 0.68 }));
    const greenLight = keep(new THREE.MeshStandardMaterial({ color: '#68884a', roughness: 0.65 }));
    const add = (geometry, material, name) => {
      const mesh = new THREE.Mesh(keep(geometry), material);
      mesh.name = name; mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh); return mesh;
    };
    // 暖陶小盆：外壳含外底与厚边口沿（法线朝外），内壁与内底朝腔内，盆口有真实厚边。
    add(new THREE.LatheGeometry([
      new THREE.Vector2(0.001, 0), new THREE.Vector2(0.058, 0), new THREE.Vector2(0.064, 0.008),
      new THREE.Vector2(0.072, 0.080), new THREE.Vector2(0.076, 0.092), new THREE.Vector2(0.070, 0.098),
    ], 32), terra, '盆外壳');
    add(annulus(0.098, 0.070, 0.0665, 32), terra, '盆口沿面');
    add(new THREE.LatheGeometry([
      new THREE.Vector2(0.0665, 0.098), new THREE.Vector2(0.060, 0.040), new THREE.Vector2(0.052, 0.034),
      new THREE.Vector2(0.001, 0.032),
    ], 32), soil, '盆内壁');
    add(disc(0.078, 0.058, 32), soil, '土面');
    // 枝：两点定长的圆柱（同台灯支架技巧），自土中向上，分枝外倾。
    const grow = (from, to, radius, name) => {
      const fromV = new THREE.Vector3(...from), toV = new THREE.Vector3(...to);
      const branch = add(new THREE.CylinderGeometry(radius, radius * 1.15, fromV.distanceTo(toV), 8), stem, name);
      branch.position.copy(fromV).add(toV).multiplyScalar(0.5);
      branch.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), toV.clone().sub(fromV).normalize());
      return toV;
    };
    const soilTop = new THREE.Vector3(0.008, 0.070, 0.004);
    const mainTip = new THREE.Vector3(0.020, 0.178, 0.010);
    const forkBase = new THREE.Vector3(0.015, 0.150, 0.008);
    grow([soilTop.x, soilTop.y, soilTop.z], [mainTip.x, mainTip.y, mainTip.z], 0.005, '主枝');
    const tipA = grow([forkBase.x, forkBase.y, forkBase.z], [-0.030, 0.210, -0.020], 0.0035, '左分枝');
    const tipB = grow([forkBase.x, forkBase.y, forkBase.z], [0.032, 0.222, 0.018], 0.0035, '右分枝');
    // 八片薄弧叶：叶心自所接枝端沿 outward 偏移 0.024（<长半轴 0.036），朝向固定种子伪随机，三档绿色。
    let seed = 20260961;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const anchors = [mainTip, tipA, tipB, tipA, tipB, mainTip, tipA, tipB];
    const greens = [greenDeep, greenMid, greenLight];
    for (let i = 0; i < anchors.length; i++) {
      const anchor = anchors[i];
      const yaw = random() * Math.PI * 2;
      const tilt = 0.35 + random() * 0.5;
      const outward = new THREE.Vector3(Math.cos(yaw) * Math.cos(tilt), Math.sin(tilt), Math.sin(yaw) * Math.cos(tilt)).normalize();
      const leaf = add(new THREE.SphereGeometry(1, 10, 8), greens[i % 3], `薄叶${i + 1}`);
      leaf.scale.set(0.036, 0.005, 0.015);
      leaf.position.copy(anchor).add(outward.clone().multiplyScalar(0.024));
      leaf.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), outward);
      // 随机翻转只能绕自身长轴（rotateX）：长轴保持穿过所接枝端，叶柄端始终嵌入枝内；
      // 绕局部 Y 随机转会把短轴转向枝端（偏移 0.024 超过短半轴 0.015），叶与枝分离成漂浮叶。
      leaf.rotateX(random() * Math.PI);
    }
    return { group, dispose };
  } catch (error) { dispose(); throw error; }
}

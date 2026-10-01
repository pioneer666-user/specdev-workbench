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
export function createCeramicFloorLamp() {
  const group = new THREE.Group(); group.name = 'ceramic-floor-lamp-01';
  const owned = new Set(), keep = value => { owned.add(value); return value; }; let disposed = false;
  const dispose = () => {
    if (disposed) return; disposed = true; group.removeFromParent();
    for (const resource of owned) resource.dispose(); owned.clear(); group.clear();
  };
  try {
    const material = options => keep(new THREE.MeshStandardMaterial(options));
    const cream = material({ color: '#eee4cf', roughness: 0.92 });
    const glaze = material({ color: '#eee9dd', roughness: 0.43 });
    const brass = material({ color: '#b69557', metalness: 0.72, roughness: 0.38 });
    const add = (g, m, x, y, z, name) => {
      const mesh = new THREE.Mesh(keep(g), m); mesh.name = name; mesh.position.set(x, y, z);
      mesh.castShadow = mesh.receiveShadow = true; group.add(mesh); return mesh;
    };
    const box = (w, h, d, m, x, y, z, name) => add(new THREE.BoxGeometry(w, h, d), m, x, y, z, name);
    const soft = (w, h, d, m, x, y, z, name, radius) => add(rounded(w, h, d, radius), m, x, y, z, name);
    add(new THREE.CylinderGeometry(0.185, 0.215, 0.085, 40), glaze, 0, 0.0425, 0, '釉面低圆底座');
    add(new THREE.CylinderGeometry(0.018, 0.018, 1.355, 16), brass, 0, 0.7575, 0, '黄铜立杆');
    add(new THREE.CylinderGeometry(0.035, 0.032, 0.08, 20), brass, 0, 1.39, 0, '杆端灯座');
    const bulbMat = material({ color: '#fff1cf', emissive: '#ffcf80', emissiveIntensity: 0.45, roughness: 0.5 });
    const bulb = add(new THREE.SphereGeometry(1, 20, 12), bulbMat, 0, 1.465, 0, '固定暖亮灯泡'); bulb.scale.set(0.045, 0.065, 0.045);
    // Lathe环剖面绕一圈：外壁上行、顶口沿、内壁下行、底口沿，中央上下真正开口。
    const profile = [[0.235,1.28],[0.158,1.65],[0.148,1.65],[0.225,1.28],[0.235,1.28]];
    add(new THREE.LatheGeometry(profile.map(([r,y]) => new THREE.Vector2(r,y)), 48), cream, 0, 0, 0, '双壁开口厚布灯罩');
    // 三个真实径向支架位于下口平面，穿入罩的厚口沿与中心杆端。
    for (let i = 0; i < 3; i++) {
      const angle = i * Math.PI * 2 / 3;
      const a = new THREE.Vector3(0, 1.285, 0), b = new THREE.Vector3(Math.cos(angle)*0.232, 1.285, Math.sin(angle)*0.232);
      const delta = b.clone().sub(a);
      const support = add(new THREE.CylinderGeometry(0.004,0.004,delta.length(),10),brass,(a.x+b.x)/2,1.285,(a.z+b.z)/2,'径向灯罩支架');
      support.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());
    }
    return { group, dispose };
  } catch (error) { dispose(); throw error; }
}

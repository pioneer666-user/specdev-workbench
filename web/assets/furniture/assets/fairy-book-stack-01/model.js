// 林间双册书摆：自制程序化候选模型，不依赖 DOM、网络或实验文件。
// 米制、+Y 向上、+Z 正面；底面中心原点。冻结包络 X ±0.11、Y[0,0.075]、Z ±0.07。
// 设计常数（检查按此独立手算）：下册 0.208×0.041×0.132（蜂蜜棕），中心 (0,0.0205,0)，
// 封面顶/封底厚 0.005、书脊宽 0.014 居 X[−0.104,−0.090]、页块 0.188×0.030×0.120 内缩
// 且右缘 0.098<封面 0.104；上册 0.176×0.032×0.106（低饱和青绿），子组中心
// (0.012,0.057,−0.002) 绕 Y 转 7°，底面与下册顶面相接（Y0.041）不悬空；上册同构四件。
// 书脊饰线各两条（0.0016×0.0016×页深−0.07），凸出书脊外缘 0.0008，不生成文字贴图。
// 整体一件摆件，无承载面，不允许把新物品继续挂到书上。
import * as THREE from 'three';

// 一册合上的精装书：封面顶板、封底板、书脊板与内缩页块，四件都有真实厚度；
// 以册中心为原点，书脊居 X− 侧，页块贴书脊内缘、右侧与前后内缩。
function addBook(parent, keep, size, materials, prefix) {
  const [width, height, depth] = size;
  const { cover, pages, trim } = materials;
  const add = (geometry, material, name, x, y, z) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name; mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh); return mesh;
  };
  const board = 0.005; // 硬封面厚度
  const spine = 0.014; // 书脊板宽
  const pageInset = 0.006; // 页块右侧与前后内缩
  const pageWidth = width - spine - pageInset;
  const pageHeight = height - board * 2 - 0.001; // 与封面顶底各留 0.0005，不共面
  add(keep(new THREE.BoxGeometry(width, board, depth)), cover, `${prefix}封面顶`, 0, height / 2 - board / 2, 0);
  add(keep(new THREE.BoxGeometry(width, board, depth)), cover, `${prefix}封底`, 0, -height / 2 + board / 2, 0);
  add(keep(new THREE.BoxGeometry(spine, pageHeight + board * 2, depth)), cover, `${prefix}书脊`, -width / 2 + spine / 2, 0, 0);
  add(keep(new THREE.BoxGeometry(pageWidth, pageHeight, depth - pageInset * 2)), pages, `${prefix}书页`, (spine - pageInset) / 2, 0, 0);
  // 书脊饰线：两条细凸线，比书深短 0.07，沿书脊长度方向错开且不出封面。
  for (const [index, offset] of [-0.03, 0.03].entries()) {
    add(keep(new THREE.BoxGeometry(0.0016, 0.0016, depth - 0.07)), trim, `${prefix}书脊饰线${index + 1}`,
      -width / 2 - 0.0008, (index === 0 ? 0.008 : -0.008), offset);
  }
}

export function createFairyBookStack() {
  const group = new THREE.Group();
  group.name = 'fairy-book-stack-01';
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
    const honeyCover = keep(new THREE.MeshPhysicalMaterial({ color: '#a8793f', roughness: 0.52, clearcoat: 0.3, clearcoatRoughness: 0.4 }));
    const sageCover = keep(new THREE.MeshPhysicalMaterial({ color: '#6f8d7d', roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.4 }));
    const pages = keep(new THREE.MeshStandardMaterial({ color: '#ece2c8', roughness: 0.85 }));
    const trim = keep(new THREE.MeshStandardMaterial({ color: '#e6d6a8', roughness: 0.4, metalness: 0.35 }));

    // 下册平放：底面贴地 Y=0，页块三面内缩于封面。
    const lower = new THREE.Group();
    group.add(lower);
    addBook(lower, keep, [0.208, 0.041, 0.132], { cover: honeyCover, pages, trim }, '下册');
    lower.position.set(0, 0.0205, 0);

    // 上册轻微错开＋小角度斜叠：子组整体变换，底面与下册顶面相接。
    const upper = new THREE.Group();
    group.add(upper);
    addBook(upper, keep, [0.176, 0.032, 0.106], { cover: sageCover, pages, trim }, '上册');
    upper.position.set(0.012, 0.057, -0.002);
    upper.rotation.y = 7 * Math.PI / 180;
    return { group, dispose };
  } catch (error) { dispose(); throw error; }
}

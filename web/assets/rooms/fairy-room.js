import * as THREE from 'three';
import { createDoorHandle } from './door.js';
import { sampleBrightness } from './brightness.js';

// 童话房间只负责外观：内部 8 × 6 × 3.4 米，所有装饰都跟随所属墙面。
// 主场景负责灯光、镜头和墙面剖看；这里不持有 renderer 的环境或输出设置。
export function createFairyRoom({ renderer, scene, reducedMotion = false, doorOpen } = {}) {
  if (doorOpen !== undefined && typeof doorOpen !== 'boolean') {
    throw new Error(`createFairyRoom 的 doorOpen 只接受 true、false 或不传，收到「${String(doorOpen)}」（${typeof doorOpen}），不能猜测门的初始状态。`);
  }
  // doorOpen 不传时保留历史展示角 π×0.58（算 isOpen=true）；显式 true/false 才落到统一端点。
  const doorAngle = doorOpen === undefined ? Math.PI * 0.58 : (doorOpen ? Math.PI / 2 : 0);
  const group = new THREE.Group();
  group.name = 'fairy-empty-room';
  const owned = new Set();
  const keep = (resource) => { owned.add(resource); return resource; };
  const rng = seededRandom(92726);
  const walls = [];
  const nightMaterials = [];
  const glowSprites = [];
  const butterflyActors = [];
  const fireflyActors = [];
  let period = 'day';
  let nightMix = 0;
  let disposed = false;

  const plasterMap = makeTexture(512, paintPlaster, keep, renderer);
  const woodMap = makeTexture(512, paintWood, keep, renderer);
  const plaster = keep(new THREE.MeshStandardMaterial({ color: '#e6d7b9', map: plasterMap, bumpMap: plasterMap, bumpScale: 0.028, roughness: 0.92 }));
  const edgePlaster = keep(new THREE.MeshStandardMaterial({ color: '#d3c2a0', map: plasterMap, roughness: 0.93 }));
  const timber = keep(new THREE.MeshStandardMaterial({ color: '#b88045', map: woodMap, roughness: 0.72 }));
  const paleTimber = keep(new THREE.MeshStandardMaterial({ color: '#dfb675', map: woodMap, roughness: 0.78 }));
  const bark = keep(new THREE.MeshStandardMaterial({ color: '#725435', roughness: 0.94 }));
  const mortar = keep(new THREE.MeshStandardMaterial({ color: '#a99e80', roughness: 1 }));
  const stoneColors = ['#d5c2a0', '#decbae', '#cbbf9f', '#d7c6ac', '#e0cbb0', '#c8b999'];
  const stones = stoneColors.map(color => keep(new THREE.MeshStandardMaterial({ color, map: plasterMap, bumpMap: plasterMap, bumpScale: 0.012, roughness: 0.9 })));
  const moss = keep(new THREE.MeshStandardMaterial({ color: '#657b45', roughness: 1 }));
  const leafMaterials = ['#637f41', '#789546', '#a0ad58'].map(color => keep(new THREE.MeshStandardMaterial({ color, roughness: 0.9, side: THREE.DoubleSide })));
  const tiles = ['#567c82', '#7687a7', '#9b7b99', '#b77565', '#86a58e'].map(color => keep(new THREE.MeshStandardMaterial({ color, roughness: 0.64, metalness: 0.03 })));
  const brass = keep(new THREE.MeshStandardMaterial({ color: '#bc9650', metalness: 0.62, roughness: 0.36 }));
  const cream = keep(new THREE.MeshStandardMaterial({ color: '#ecdbb0', roughness: 0.86 }));
  const capMaterials = ['#b56e56', '#af696d', '#847b9b'].map(color => keep(new THREE.MeshStandardMaterial({ color, roughness: 0.58, metalness: 0.02 })));
  const petalMaterials = ['#d89c94', '#d5bd78', '#9aa5c6'].map(color => keep(new THREE.MeshStandardMaterial({ color, roughness: 0.86, side: THREE.DoubleSide })));
  const petalGeometry = keep(new THREE.SphereGeometry(1, 8, 5));
  const leafGeometry = keep(makeLeafGeometry());
  const mushroomCap = keep(makeMushroomGeometry());
  const orbGeometry = keep(new THREE.SphereGeometry(1, 12, 8));
  const glowTexture = makeTexture(128, paintGlow, keep, renderer);
  const pollenGroup = new THREE.Group();
  const fireflyGroup = new THREE.Group();
  const butterflyGroup = new THREE.Group();
  group.add(pollenGroup, fireflyGroup, butterflyGroup);

  function mesh(geometry, material, parent, position, rotation) {
    keep(geometry);
    const item = new THREE.Mesh(geometry, material);
    if (position) item.position.set(...position);
    if (rotation) item.rotation.set(...rotation);
    item.castShadow = true;
    item.receiveShadow = true;
    parent.add(item);
    return item;
  }

  function box(w, h, d, material, parent, x, y, z, bevel = 0) {
    const geo = bevel ? softBox(w, h, d, bevel) : new THREE.BoxGeometry(w, h, d);
    return mesh(geo, material, parent, [x, y, z]);
  }

  function beam(parent, points, radius = 0.07, material = timber) {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
    return mesh(new THREE.TubeGeometry(curve, Math.max(5, points.length * 4), radius, 8, false), material, parent);
  }

  // 内部地面保持水平；不规则轮廓仅存在于地台外缘。
  const baseShape = new THREE.Shape();
  const outline = [[-4.48,-3.48],[-2.95,-3.58],[-1.15,-3.51],[0.6,-3.6],[3.2,-3.52],[4.43,-3.39],[4.58,-1.2],[4.52,1.1],[4.41,3.47],[2.3,3.58],[-0.1,3.52],[-2.4,3.58],[-4.46,3.39],[-4.58,1.2],[-4.51,-1.3]];
  outline.forEach(([x, z], i) => i ? baseShape.lineTo(x, z) : baseShape.moveTo(x, z));
  baseShape.closePath();
  const plinth = mesh(new THREE.ExtrudeGeometry(baseShape, { depth: 0.32, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.055, bevelSegments: 2, steps: 1 }), edgePlaster, group, [0, -0.38, 0], [-Math.PI / 2, 0, 0]);
  plinth.name = 'organic-exterior-plinth';
  box(8.04, 0.11, 6.04, mortar, group, 0, -0.055, 0);

  for (let row = 0; row < 8; row++) {
    const rowWidth = row % 2 ? [0.5,1,1,1,1,1,1,1,0.5] : Array(8).fill(1);
    let x = -4;
    for (let c = 0; c < rowWidth.length; c++) {
      const w = rowWidth[c];
      const item = box(w - 0.023, 0.065, 0.728, stones[(row * 3 + c) % stones.length], group, x + w / 2, -0.029, -2.625 + row * 0.75, 0.018);
      item.name = 'level-limestone-floor';
      x += w;
    }
  }
  // 门外的一小段门槛不侵占室内；门与地面同高，留给接入方继续延伸路径。
  box(1.7, 0.14, 0.78, stones[1], group, 2.25, -0.066, -3.4, 0.035);

  let doorHinge = null;
  const wallDefs = [
    { name: 'north-door-wall', width: 8.28, x: 0, z: -3.13, turn: 0, normal: [0,0,-1], door: true },
    { name: 'east-wall', width: 6.28, x: 4.13, z: 0, turn: -Math.PI / 2, normal: [1,0,0], window: true },
    { name: 'south-wall', width: 8.28, x: 0, z: 3.13, turn: Math.PI, normal: [0,0,1] },
    { name: 'west-wall', width: 6.28, x: -4.13, z: 0, turn: Math.PI / 2, normal: [-1,0,0], window: true },
  ];

  for (let index = 0; index < wallDefs.length; index++) {
    const def = wallDefs[index];
    const wall = new THREE.Group();
    wall.name = def.name;
    wall.position.set(def.x, 0, def.z);
    wall.rotation.y = def.turn;
    group.add(wall);
    walls.push({ group: wall, normal: new THREE.Vector3(...def.normal) });
    const w = def.width;

    if (def.door) {
      // 南北墙壳只到净空端点，外角由侧墙独占；避免延长侧墙端面与外墙共面闪烁。
      // 原w仍负责全部装饰定位，门洞/铰链不动。
      const left = -4, right = 4;
      box(1.55 - left, 3.4, 0.26, plaster, wall, (left + 1.55) / 2, 1.7, 0);
      box(right - 2.95, 3.4, 0.26, plaster, wall, (right + 2.95) / 2, 1.7, 0);
      box(1.4, 0.85, 0.26, plaster, wall, 2.25, 2.975, 0);
      doorHinge = addDoor(wall, doorAngle);
    } else if (def.window) {
      // 只延长墙壳至南北墙外缘；装饰、窗洞及其定位仍用原 w，不重做造型。
      const shellWidth = w + 0.24;
      const shape = new THREE.Shape();
      shape.moveTo(-shellWidth / 2, 0); shape.lineTo(shellWidth / 2, 0); shape.lineTo(shellWidth / 2, 3.4); shape.lineTo(-shellWidth / 2, 3.4); shape.closePath();
      const opening = new THREE.Path();
      opening.absarc(-0.68, 2.08, 0.52, 0, Math.PI * 2, true);
      shape.holes.push(opening);
      mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.26, bevelEnabled: false, curveSegments: 32 }), plaster, wall, [0,0,-0.13]);
      addWindow(wall, -0.68, 2.08);
    } else box(8, 3.4, 0.26, plaster, wall, 0, 1.7, 0);

    // 内侧收口平整，木梁的小幅弯曲只作为墙顶装饰，不改变房间容积。
    beam(wall, [[-w/2,3.4,0],[-w/4,3.44,-0.01],[0,3.42,0],[w/4,3.46,-0.005],[w/2,3.41,0]], 0.125, paleTimber);
    if (def.door) {
      box(w/2 + 1.48, 0.12, 0.035, timber, wall, (-w/2+1.48)/2, 0.07, 0.145, 0.014);
      box(w/2 - 3.02, 0.12, 0.035, timber, wall, (w/2+3.02)/2, 0.07, 0.145, 0.014);
    } else box(w - 0.2, 0.12, 0.035, timber, wall, 0, 0.07, 0.145, 0.014);
    for (const sign of [-1, 1]) {
      beam(wall, [[sign*(w/2-0.1),0.04,-0.04],[sign*(w/2-0.12),1.1,-0.06],[sign*(w/2-0.16),2.2,-0.055],[sign*(w/2-0.1),3.48,-0.06]], 0.115, timber);
      addMushroom(wall, sign*(w/2-0.27), 0.02, -0.35, 0.26 + rng()*0.12, index%3);
      addMushroom(wall, sign*(w/2-0.51), 0.02, -0.3, 0.16 + rng()*0.07, (index+1)%3);
      addFlowerClump(wall, sign*(w/2-0.7), -0.34, index%3);
    }

    // 外墙脚的低矮石块与苔藓；门洞宽度完全跳过。
    for (let x = -w/2 + 0.23; x < w/2 - 0.1; x += 0.46) {
      if (def.door && x > 1.28 && x < 3.22) continue;
      const rock = box(0.4 + rng()*0.08, 0.17 + rng()*0.1, 0.17, stones[Math.floor(rng()*stones.length)], wall, x, 0.105, -0.21, 0.048);
      rock.rotation.z = (rng()-0.5)*0.07;
      if (rng()>0.38) {
        const cushion = mesh(new THREE.SphereGeometry(1, 8, 5), moss, wall, [x,0.23,-0.22]);
        cushion.scale.set(0.18+rng()*0.04,0.026,0.11);
      }
    }
    // 藤条沿外墙两角向墙顶生长，最多绕进室内十几厘米，保持陈设墙面可用。
    addVine(wall, [[-w/2+0.34,0.35,-0.22],[-w/2+0.46,1.2,-0.23],[-w/2+0.24,2.2,-0.24],[-w/2+0.58,3.32,-0.23],[-w/2+1.35,3.51,-0.03],[-w/2+2.1,3.39,0.03]], 0.96);
    addVine(wall, [[w/2-0.26,1.15,-0.22],[w/2-0.45,2.1,-0.22],[w/2-0.33,2.92,-0.23],[w/2-0.75,3.44,-0.03],[w/2-1.45,3.5,0.02]], 0.85);
    addVine(wall, [[-w/2+0.2,3.42,-0.08],[-w/4,3.55,-0.12],[0.15,3.47,-0.11],[w/4,3.57,-0.12],[w/2-0.16,3.43,-0.08]], 0.74);
    if (!def.door) {
      addMushroom(wall, -w/2+0.21, 1.38, -0.18, 0.25, 2, true);
      addMushroom(wall, -w/2+0.25, 1.6, -0.19, 0.17, 2, true);
    }
  }

  function addDoor(parent, doorAngle) {
    for (const x of [1.45,3.05]) beam(parent, [[x,0.02,0.005],[x-0.008,1.3,0.012],[x,2.65,0]], 0.08, paleTimber);
    beam(parent, [[1.4,2.65,0],[1.86,2.67,0.01],[2.4,2.66,0],[3.1,2.65,0]], 0.085, paleTimber);
    const hinge = new THREE.Group();
    hinge.name = 'outward-open-door';
    hinge.position.set(1.55,0,-0.18);
    hinge.rotation.y = doorAngle;
    parent.add(hinge);
    // 门板／横梁／门环是活动部件，随 hinge 开合转动；命名供门接口与后续拾取识别。
    for(let i=0;i<6;i++) { const plank = box(0.221,2.48,0.074, i%2 ? timber : paleTimber, hinge, 0.112+i*0.227,1.255,0,0.016); plank.name = 'door-plank'; }
    for(const y of [0.38,1.92]) { const cross = box(1.34,0.115,0.075,timber,hinge,0.68,y,0.057,0.014); cross.name = 'door-crossbeam'; }
    const ring = mesh(new THREE.TorusGeometry(0.065,0.013,7,18),brass,hinge,[1.12,1.19,0.068]);
    ring.name = 'door-ring';
    ring.rotation.x = 0.15;
    const pin = mesh(new THREE.SphereGeometry(0.032,10,6),brass,hinge,[1.12,1.26,0.068]);
    pin.name = 'door-ring-pin';
    // 门檐采用成排弧形彩釉瓦，清晰的小尺度手工轮廓。
    for (const sign of [-1,1]) {
      const slope = new THREE.Group();
      slope.position.set(2.25+sign*0.56,2.89,-0.5);
      slope.rotation.z = -sign*0.38;
      parent.add(slope);
      box(1.27,0.08,0.96,timber,slope,0,0,0,0.028);
      for (let r=0;r<4;r++) for(let c=0;c<4;c++) {
        const tile = mesh(softBox(0.325,0.052,0.27,0.035),tiles[(r+c+(sign>0?2:0))%tiles.length],slope,[-0.46+c*0.31,0.073+r*0.006,-0.35+r*0.225]);
        tile.rotation.x = -0.09;
      }
    }
    beam(parent, [[2.25,3.13,0.03],[2.25,3.14,-0.5],[2.25,3.09,-1.03]],0.073,paleTimber);
    for(const sign of [-1,1]) beam(parent, [[2.25+sign*1.14,2.64,-0.08],[2.25+sign*1.04,2.68,-0.58],[2.25+sign*1.14,2.61,-1.02]],0.056,paleTimber);
    addLantern(parent,1.17,2.25,-0.37);
    return hinge;
  }

  function addWindow(parent, x, y) {
    for(const z of [-0.17,0.17]) mesh(new THREE.TorusGeometry(0.53,0.066,10,48),paleTimber,parent,[x,y,z]);
    const glass = keep(new THREE.MeshPhysicalMaterial({ color:'#d8cda6', transparent:true, opacity:0.46, roughness:0.16, metalness:0.04, emissive:'#dfad62', emissiveIntensity:0.08, side:THREE.DoubleSide, depthWrite:false }));
    nightMaterials.push({ material:glass, day:0.08, night:0.85 });
    mesh(new THREE.CircleGeometry(0.515,48),glass,parent,[x,y,-0.025]);
    box(0.043,1.02,0.065,paleTimber,parent,x,y,0.034,0.012);
    box(1.02,0.043,0.065,paleTimber,parent,x,y,0.034,0.012);
    box(1.24,0.105,0.4,paleTimber,parent,x,y-0.58,-0.13,0.034);
    addVine(parent,[[x-0.79,y-0.52,-0.19],[x-0.84,y+0.06,-0.2],[x-0.51,y+0.58,-0.2],[x+0.05,y+0.73,-0.2],[x+0.67,y+0.36,-0.21]],0.65);
  }

  function addLantern(parent,x,y,z) {
    beam(parent,[[x,y+0.29,-0.15],[x,y+0.36,z-0.02],[x,y+0.25,z-0.05]],0.018,brass);
    const glass = keep(new THREE.MeshStandardMaterial({color:'#ffd497',emissive:'#ffbf63',emissiveIntensity:0.18,roughness:0.35}));
    nightMaterials.push({material:glass,day:0.18,night:3.5});
    mesh(new THREE.CylinderGeometry(0.06,0.075,0.21,6),glass,parent,[x,y,z]);
    mesh(new THREE.ConeGeometry(0.12,0.1,6),brass,parent,[x,y+0.145,z]);
    mesh(new THREE.CylinderGeometry(0.105,0.065,0.05,6),brass,parent,[x,y-0.13,z]);
    for(let a=0;a<4;a++) {
      const angle=a*Math.PI/2;
      box(0.012,0.245,0.012,brass,parent,x+Math.cos(angle)*0.072,y,z+Math.sin(angle)*0.072);
    }
    const glow = addGlow(parent,x,y,z,0.68,'#ffb66b',0.27);
    glow.userData.baseOpacity = glow.material.opacity;
    glowSprites.push(glow);
    const light = new THREE.PointLight('#ffc579',0,2.4,2);
    light.position.set(x,y,z-0.11); parent.add(light);
    light.userData.nightIntensity=1.25;
    nightMaterials.push({light});
  }

  function addVine(parent, points, leafSize) {
    const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
    mesh(new THREE.TubeGeometry(curve,40,0.012,5,false),bark,parent);
    const counts=30;
    const instanceSets=leafMaterials.map(mat=>{
      const inst=new THREE.InstancedMesh(leafGeometry,mat,counts);
      inst.castShadow=true; inst.receiveShadow=true; parent.add(inst); return inst;
    });
    const transform=new THREE.Object3D();
    const materialCount=[0,0,0];
    for(let i=0;i<counts;i++) {
      const t=(i+0.2)/counts;
      const p=curve.getPoint(t);
      const side=i%2?-1:1;
      const type=i%3;
      const size=(0.085+rng()*0.048)*leafSize;
      transform.position.copy(p).add(new THREE.Vector3(side*size*0.65,0.008,-0.035));
      transform.rotation.set((rng()-0.5)*0.7,Math.PI+(rng()-0.5)*0.6,side*(0.65+rng()*0.45));
      transform.scale.set(size*0.79,size*1.65,size);
      transform.updateMatrix();
      instanceSets[type].setMatrixAt(materialCount[type]++,transform.matrix);
    }
    instanceSets.forEach((inst,i)=>{inst.count=materialCount[i];inst.instanceMatrix.needsUpdate=true;});
  }

  function addMushroom(parent,x,y,z,size,type=0,bracket=false) {
    const item=new THREE.Group(); item.position.set(x,y,z); parent.add(item);
    const stemHeight=bracket ? size*0.2 : size*1.15;
    if(!bracket) beam(item,[[0,0,0],[-size*0.08,stemHeight*0.55,0],[size*0.05,stemHeight,0]],size*0.15,cream);
    const cap=mesh(mushroomCap,capMaterials[type],item,[0,stemHeight,0]);
    cap.scale.set(size,size*0.76,bracket?size*0.69:size);
    cap.rotation.z=(rng()-0.5)*0.18;
    const under=mesh(new THREE.CylinderGeometry(size*0.91,size*0.82,size*0.045,24),cream,item,[0,stemHeight+size*0.035,0]);
    if(bracket) under.scale.z=0.69;
    for(let k=0;k<7;k++) {
      const a=k*2.399+type;
      const radius=(0.22+(k%3)*0.22)*size;
      const px=Math.cos(a)*radius,pz=Math.sin(a)*radius;
      const spot=mesh(orbGeometry,cream,item,[px,stemHeight+size*(0.32-Math.pow(radius/size,2)*0.22),pz*(bracket?0.69:1)]);
      spot.scale.set(size*0.055,size*0.018,size*0.045);
    }
    if(!bracket&&size>0.3) {
      const glow=addGlow(item,0,stemHeight*0.92,-size*0.03,size*1.8,'#ffd98b',0.2);
      glow.userData.baseOpacity = glow.material.opacity;
    glowSprites.push(glow);
    }
  }

  function addFlowerClump(parent,x,z,type) {
    for(let i=0;i<5;i++) {
      const px=x+(rng()-0.5)*0.3,pz=z+(rng()-0.5)*0.12;
      const h=0.15+rng()*0.18;
      beam(parent,[[px,0.025,pz],[px+0.025,h*0.6,pz],[px+0.012,h,pz]],0.004,leafMaterials[0]);
      for(let j=0;j<5;j++) {
        const a=j*Math.PI*2/5;
        const petal=mesh(petalGeometry,petalMaterials[type],parent,[px+0.012+Math.cos(a)*0.033,h+Math.sin(a)*0.025,pz-0.008]);
        petal.scale.set(0.027,0.018,0.01);petal.rotation.z=a;
      }
      const core=mesh(orbGeometry,cream,parent,[px+0.012,h,pz-0.021]);core.scale.setScalar(0.012);
    }
  }

  function addGlow(parent,x,y,z,size,color,opacity) {
    const mat=keep(new THREE.SpriteMaterial({map:glowTexture,color,transparent:true,opacity,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}));
    const sprite=new THREE.Sprite(mat);sprite.position.set(x,y,z);sprite.scale.setScalar(size);parent.add(sprite);return sprite;
  }

  // 白天花粉是细小的慢动微粒；蝴蝶翼展约 12 厘米。
  const pollenGeometry=keep(new THREE.BufferGeometry());
  const pollenPositions=new Float32Array(54*3);
  for(let i=0;i<54;i++) {pollenPositions[i*3]=(rng()-0.5)*10;pollenPositions[i*3+1]=0.3+rng()*4;pollenPositions[i*3+2]=(rng()-0.5)*8;}
  pollenGeometry.setAttribute('position',new THREE.BufferAttribute(pollenPositions,3));
  const pollenMaterial=keep(new THREE.PointsMaterial({color:'#fff0c3',map:glowTexture,size:0.037,transparent:true,opacity:0.53,depthWrite:false,blending:THREE.AdditiveBlending,sizeAttenuation:true}));
  const pollen=new THREE.Points(pollenGeometry,pollenMaterial);pollenGroup.add(pollen);

  const butterflyWing=keep(makeButterflyWing());
  const butterflyMaterials=['#e2c67c','#bfd8ca','#d6a2ae'].map(color=>keep(new THREE.MeshStandardMaterial({color,roughness:0.6,side:THREE.DoubleSide,emissive:color,emissiveIntensity:0.08})));
  for(let i=0;i<7;i++) {
    const body=new THREE.Group();butterflyGroup.add(body);
    const left=new THREE.Group(),right=new THREE.Group();body.add(left,right);
    const wingL=mesh(butterflyWing,butterflyMaterials[i%3],left);wingL.scale.set(0.072,0.072,0.072);
    const wingR=mesh(butterflyWing,butterflyMaterials[i%3],right);wingR.scale.set(-0.072,0.072,0.072);
    const center=mesh(new THREE.CapsuleGeometry(0.005,0.035,2,5),bark,body);center.rotation.x=Math.PI/2;
    butterflyActors.push({body,left,right,phase:rng()*6.28,base:new THREE.Vector3((rng()-0.5)*7.3,0.75+rng()*2.4,(rng()-0.5)*6.3)});
  }
  for(let i=0;i<38;i++) {
    const side=i%4;
    const p=new THREE.Vector3(side<2?(rng()-0.5)*8.9:(side===2?-4.35:4.35),0.3+rng()*3.55,side<2?(side===0?-3.42:3.42):(rng()-0.5)*6.8);
    const sprite=addGlow(fireflyGroup,p.x,p.y,p.z,0.075+rng()*0.06,i%4===0?'#bae5b7':'#ffe8a4',0.72);
    fireflyActors.push({sprite,base:p,phase:rng()*6.28,rate:0.3+rng()*0.5});
  }

  function applyBrightness(p) {
    if(disposed)return;
    nightMix=p.nightMix;
    pollenGroup.visible=nightMix<1;
    butterflyGroup.visible=nightMix<1;
    fireflyGroup.visible=nightMix>0;
    pollenMaterial.opacity=.53*(1-nightMix);
    for(const material of butterflyMaterials) {material.transparent=true;material.opacity=1-nightMix;}
    for(const glow of glowSprites) {glow.visible=nightMix>0;glow.material.opacity=glow.userData.baseOpacity*nightMix;}
    for(const entry of nightMaterials) {
      if(entry.light) entry.light.intensity=entry.light.userData.nightIntensity*p.fairyLamp;
      else entry.material.emissiveIntensity=(entry.day+(entry.night-entry.day)*nightMix)*p.fairyEmissive;
    }
  }
  function setPeriod(next) {
    if(disposed)return;
    period=next==='night'?'night':'day';
    applyBrightness(sampleBrightness('fairy',period==='night'?0:100,period==='night'?1:0));
  }

  function update(time = 0) {
    if(disposed)return;
    const t=reducedMotion?0:time;
    pollen.position.y=Math.sin(t*0.13)*0.15;
    pollen.rotation.y=Math.sin(t*0.045)*0.07;
    for(const a of butterflyActors) {
      const q=t*0.32+a.phase;
      a.body.position.copy(a.base).add(new THREE.Vector3(Math.sin(q)*0.44,Math.sin(q*1.7)*0.17,Math.cos(q*0.83)*0.33));
      a.body.rotation.set(0.16,Math.atan2(Math.cos(q),-Math.sin(q*0.83)),Math.sin(q*2)*0.14);
      const flap=reducedMotion?0.4:0.25+Math.sin(t*11+a.phase)*0.64;
      a.left.rotation.z=flap;a.right.rotation.z=-flap;
    }
    for(const a of fireflyActors) {
      const q=t*a.rate+a.phase;
      a.sprite.position.copy(a.base).add(new THREE.Vector3(Math.sin(q)*0.22,Math.sin(q*0.7)*0.16,Math.cos(q*0.9)*0.19));
      a.sprite.material.opacity=(reducedMotion?0.65:0.25+(Math.sin(q*2)+1)*0.3)*nightMix;
    }
  }

  function dispose() {
    if(disposed)return;
    disposed=true;
    group.removeFromParent();
    group.traverse(node=>{if(node.isInstancedMesh)node.dispose();});
    for(const resource of owned)resource.dispose();
    owned.clear();
    group.clear();
  }

  // 静态细节按墙和材质合批，避免每片花瓣、每块小石都占一次绘制调用。
  // 各面墙仍是独立整体，灯、发光精灵和实例叶片不参与合并；门扇活动子树也跳过，
  // 否则门板会被烘进墙体，失去独立开合能力。
  group.updateMatrixWorld(true);
  for(const wall of walls) mergeStaticMeshes(wall.group,keep,true,doorHinge);
  mergeStaticMeshes(group,keep,false,doorHinge);
  setPeriod('day');
  update(0);
  return {
    group,walls,door:createDoorHandle(doorHinge),update,setPeriod,applyBrightness,dispose,
    meta:{
      id:'room-fairy-woodland-v1',name:'林间微光',style:'fairy',
      dimensions:{width:8,depth:6,height:3.4},
      door:{wall:'north',centerX:2.25,width:1.4,height:2.55,position:[2.25,0,-3],opens:'outward'},
      floorBounds:{minX:-4,maxX:4,minZ:-3,maxZ:3,y:0},
      periods:['day','night'],furniture:[],
      description:'奶油灰泥、蜂蜜木梁与浅色石地；墙外藤蔓、彩瓦门檐和小蘑菇。白昼蝶与花粉，夜晚萤火与暖光。'
    }
  };
}

function mergeStaticMeshes(parent,keep,recursive,exclude) {
  const batches=new Map();
  const inExcluded=node=>{ for(let p=node;p;p=p.parent) if(p===exclude) return true; return false; };
  const select=node=>{
    if(exclude&&inExcluded(node))return;
    if(!node.isMesh||node.isInstancedMesh||Array.isArray(node.material))return;
    const list=batches.get(node.material)||[];list.push(node);batches.set(node.material,list);
  };
  if(recursive)parent.traverse(select);else parent.children.forEach(select);
  const inverse=new THREE.Matrix4().copy(parent.matrixWorld).invert();
  const position=new THREE.Vector3(),normal=new THREE.Vector3();
  for(const [material,meshes] of batches) {
    if(meshes.length<2)continue;
    const total=meshes.reduce((sum,item)=>sum+(item.geometry.index?.count||item.geometry.attributes.position.count),0);
    const positions=new Float32Array(total*3),normals=new Float32Array(total*3),uvs=new Float32Array(total*2);
    let offset=0;
    for(const item of meshes) {
      const geo=item.geometry,idx=geo.index;
      const p=geo.attributes.position,n=geo.attributes.normal,uv=geo.attributes.uv;
      const matrix=new THREE.Matrix4().multiplyMatrices(inverse,item.matrixWorld);
      const normalMatrix=new THREE.Matrix3().getNormalMatrix(matrix);
      const count=idx?.count||p.count;
      for(let i=0;i<count;i++) {
        const k=idx?idx.getX(i):i;
        position.fromBufferAttribute(p,k).applyMatrix4(matrix);position.toArray(positions,(offset+i)*3);
        if(n)normal.fromBufferAttribute(n,k).applyNormalMatrix(normalMatrix);else normal.set(0,1,0);
        normal.toArray(normals,(offset+i)*3);
        if(uv){uvs[(offset+i)*2]=uv.getX(k);uvs[(offset+i)*2+1]=uv.getY(k);}
      }
      offset+=count;item.removeFromParent();
    }
    const geo=keep(new THREE.BufferGeometry());
    geo.setAttribute('position',new THREE.BufferAttribute(positions,3));geo.setAttribute('normal',new THREE.BufferAttribute(normals,3));geo.setAttribute('uv',new THREE.BufferAttribute(uvs,2));
    geo.computeBoundingSphere();
    const combined=new THREE.Mesh(geo,material);combined.name='static-material-batch';combined.castShadow=true;combined.receiveShadow=true;parent.add(combined);
  }
}

function seededRandom(seed) {
  return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let n=Math.imul(seed^seed>>>15,1|seed);n=n+Math.imul(n^n>>>7,61|n)^n;return((n^n>>>14)>>>0)/4294967296;};
}

function makeTexture(size,paint,keep,renderer) {
  if(typeof document==='undefined')return null;
  const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
  const ctx=canvas.getContext('2d');if(!ctx)return null;
  paint(ctx,size);
  const texture=keep(new THREE.CanvasTexture(canvas));
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.anisotropy=Math.min(4,renderer?.capabilities?.getMaxAnisotropy?.()||1);
  return texture;
}

function paintPlaster(ctx,size) {
  const rng=seededRandom(8713);
  ctx.fillStyle='#e8e1cd';ctx.fillRect(0,0,size,size);
  for(let i=0;i<18000;i++) {
    const v=Math.floor(125+rng()*95);
    ctx.fillStyle=`rgba(${v},${v-4},${v-9},${0.025+rng()*0.08})`;
    const s=0.3+rng()*1.5;ctx.fillRect(rng()*size,rng()*size,s,s);
  }
  for(let i=0;i<130;i++) {
    ctx.strokeStyle='rgba(255,252,235,0.035)';ctx.lineWidth=3+rng()*15;
    ctx.beginPath();const y=rng()*size;ctx.moveTo(-30,y);ctx.bezierCurveTo(size*.3,y-12,size*.7,y+13,size+30,y+2);ctx.stroke();
  }
}

function paintWood(ctx,size) {
  const rng=seededRandom(4711);ctx.fillStyle='#d9bd8b';ctx.fillRect(0,0,size,size);
  for(let i=0;i<240;i++) {
    const x=rng()*size;
    ctx.strokeStyle=i%4?'rgba(101,69,32,0.07)':'rgba(255,235,190,0.14)';ctx.lineWidth=0.4+rng()*1.6;
    ctx.beginPath();ctx.moveTo(x,-10);ctx.bezierCurveTo(x+Math.sin(x)*9,size*.3,x-5,size*.7,x+2,size+10);ctx.stroke();
  }
  for(let i=0;i<5;i++) {
    const x=40+rng()*(size-80),y=40+rng()*(size-80);
    for(let j=0;j<6;j++) {ctx.strokeStyle='rgba(101,65,30,0.06)';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(x,y,3+j*2.2,8+j*7.6,0,0,Math.PI*2);ctx.stroke();}
  }
}

function paintGlow(ctx,size) {
  const g=ctx.createRadialGradient(size/2,size/2,0,size/2,size/2,size/2);
  g.addColorStop(0,'rgba(255,255,245,1)');g.addColorStop(0.08,'rgba(255,252,228,0.9)');g.addColorStop(0.23,'rgba(255,247,214,0.25)');g.addColorStop(0.55,'rgba(255,241,211,0.055)');g.addColorStop(1,'rgba(255,235,193,0)');
  ctx.fillStyle=g;ctx.fillRect(0,0,size,size);
}

function softBox(w,h,d,r) {
  r=Math.min(r,w/3,h/3,d/3);
  const x=-w/2+r,y=-d/2+r,ww=w-2*r,hh=d-2*r;
  const shape=new THREE.Shape();
  shape.moveTo(x+r,y);shape.lineTo(x+ww-r,y);shape.quadraticCurveTo(x+ww,y,x+ww,y+r);
  shape.lineTo(x+ww,y+hh-r);shape.quadraticCurveTo(x+ww,y+hh,x+ww-r,y+hh);
  shape.lineTo(x+r,y+hh);shape.quadraticCurveTo(x,y+hh,x,y+hh-r);shape.lineTo(x,y+r);shape.quadraticCurveTo(x,y,x+r,y);
  const geo=new THREE.ExtrudeGeometry(shape,{depth:Math.max(0.001,h-2*r),bevelEnabled:true,bevelSize:r,bevelThickness:r,bevelSegments:2,curveSegments:3,steps:1});
  geo.rotateX(-Math.PI/2);geo.translate(0,-(h-2*r)/2,0);return geo;
}

function makeLeafGeometry() {
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute([0,-0.45,0, -.55,0,0, 0,0.24,0.17, .55,0,0, 0,0.9,0],3));
  geo.setAttribute('uv',new THREE.Float32BufferAttribute([.5,0,0,.4,.5,.6,1,.4,.5,1],2));
  geo.setIndex([0,1,2,0,2,3,1,4,2,2,4,3]);geo.computeVertexNormals();return geo;
}

function makeMushroomGeometry() {
  return new THREE.LatheGeometry([new THREE.Vector2(0,0.34),new THREE.Vector2(.28,.32),new THREE.Vector2(.6,.25),new THREE.Vector2(.85,.14),new THREE.Vector2(.99,.035),new THREE.Vector2(1,0),new THREE.Vector2(.89,-.035),new THREE.Vector2(.28,-.05)],32);
}

function makeButterflyWing() {
  const shape=new THREE.Shape();shape.moveTo(0,0);shape.bezierCurveTo(.28,.82,1.15,1.14,.92,.35);shape.bezierCurveTo(.8,.02,.39,.12,.18,0);shape.bezierCurveTo(.67,-.07,.87,-.56,.37,-.58);shape.bezierCurveTo(.09,-.48,.13,-.2,0,0);
  const geo=new THREE.ShapeGeometry(shape,12);geo.rotateX(-Math.PI/2);return geo;
}

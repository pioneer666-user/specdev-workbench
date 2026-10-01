// 空房间风格的公共光照；场景模块不依赖旧建筑蓝图或业务资料。
import * as THREE from 'three';

export function createRoomLighting(renderer,scene){
  const group=new THREE.Group(); group.name='room-style-lighting'; scene.add(group);
  const hemi=new THREE.HemisphereLight(0xe6efff,0x9a896e,2);group.add(hemi);
  const key=new THREE.DirectionalLight(0xffeed2,3.7);key.position.set(-5,9,4);key.castShadow=true;
  key.shadow.mapSize.set(2048,2048); Object.assign(key.shadow.camera,{left:-8,right:8,top:7,bottom:-7,near:.1,far:35});
  key.shadow.bias=-.00025;key.shadow.normalBias=.025;key.shadow.radius=3;group.add(key);group.add(key.target);
  const fill=new THREE.DirectionalLight(0xd9e7ff,1.4);fill.position.set(4,5,-1);group.add(fill);
  const bounce=new THREE.DirectionalLight(0xffdbaa,.5);bounce.position.set(1,2,6);group.add(bounce);
  const studio=new THREE.Scene();studio.background=new THREE.Color(0xbfc4ce);
  const panel=(w,h,x,y,z,power)=>{const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color:new THREE.Color(power,power*.98,power*.93),side:THREE.DoubleSide}));m.position.set(x,y,z);m.lookAt(0,1,0);studio.add(m);};
  panel(9,6,-5,8,2,5);panel(5,7,6,3,0,2.2);panel(8,3,0,3,-8,1.5);
  const pmrem=new THREE.PMREMGenerator(renderer);const env=pmrem.fromScene(studio,.04,.1,40);pmrem.dispose();
  studio.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
  const previousEnv=scene.environment;scene.environment=env.texture;
  const skyMaterial=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{top:{value:new THREE.Color('#c9dfed')},horizon:{value:new THREE.Color('#eff0df')},bottom:{value:new THREE.Color('#cddcc4')}},vertexShader:'varying vec3 vWorld; void main(){ vWorld=(modelMatrix*vec4(position,1.)).xyz; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',fragmentShader:'varying vec3 vWorld; uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; void main(){float h=normalize(vWorld).y;vec3 c=mix(horizon,top,smoothstep(0.,.72,h));c=mix(c,bottom,1.-smoothstep(-.5,0.,h));gl_FragColor=vec4(c,1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}'});
  const sky=new THREE.Mesh(new THREE.SphereGeometry(90,32,16),skyMaterial);sky.renderOrder=-10;group.add(sky);
  const stage=new THREE.Mesh(new THREE.PlaneGeometry(180,180),new THREE.MeshStandardMaterial({color:0xe2e4dc,roughness:1}));stage.rotation.x=-Math.PI/2;stage.position.y=-.46;stage.receiveShadow=true;group.add(stage);
  const glowCanvas=document.createElement('canvas');glowCanvas.width=128;glowCanvas.height=128;const ctx=glowCanvas.getContext('2d');const grad=ctx.createRadialGradient(64,64,0,64,64,64);grad.addColorStop(0,'rgba(255,244,205,.6)');grad.addColorStop(.18,'rgba(255,238,186,.28)');grad.addColorStop(.5,'rgba(255,220,165,.08)');grad.addColorStop(1,'rgba(255,220,165,0)');ctx.fillStyle=grad;ctx.fillRect(0,0,128,128);
  const glowTexture=new THREE.CanvasTexture(glowCanvas);glowTexture.colorSpace=THREE.SRGBColorSpace;
  const celestial=new THREE.Group();celestial.position.set(-6,8,-12);group.add(celestial);
  const moonMaterial=new THREE.MeshBasicMaterial({color:0xffe5ac});
  const orb=new THREE.Mesh(new THREE.SphereGeometry(1,48,32),moonMaterial);celestial.add(orb);
  const halo=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTexture,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}));halo.scale.set(8,8,1);celestial.add(halo);
  // 月面细节是建筑外的低对比点缀，不作为室内物品。
  const craters=new THREE.Group();celestial.add(craters);
  [[-.3,.35,.89,.16],[.32,-.23,.91,.22],[-.2,-.46,.86,.1],[.43,.42,.78,.12],[.05,.65,.75,.08]].forEach(([x,y,z,r])=>{const crater=new THREE.Mesh(new THREE.CircleGeometry(r,24),new THREE.MeshBasicMaterial({color:0xd3be8e,transparent:true,opacity:.21,depthWrite:false}));crater.position.set(x,y,z+.02);crater.lookAt(new THREE.Vector3(x,y,z).multiplyScalar(2));craters.add(crater);});
  let seed=478;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  const positions=[];for(let i=0;i<120;i++){const a=random()*Math.PI*2,r=25+random()*25;positions.push(Math.cos(a)*r,9+random()*24,Math.sin(a)*r);}
  const stars=new THREE.Points(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(positions,3)),new THREE.PointsMaterial({color:0xffecc4,size:.095,transparent:true,opacity:.75,depthWrite:false,toneMapped:false}));group.add(stars);
  let style='ceramic',period='day';
  function set(nextStyle,nextPeriod='day'){
    style=nextStyle;period=nextPeriod;const fairy=style==='fairy',night=fairy&&period==='night';
    sky.visible=fairy;stage.visible=!fairy;celestial.visible=fairy;stars.visible=night;craters.visible=night;
    scene.background=new THREE.Color(night?0x1c263b:fairy?0xd6e3dc:0xe5e6df);
    scene.fog=fairy?new THREE.Fog(night?0x26364b:0xd7e3d5,26,76):new THREE.Fog(0xe5e6df,35,90);
    scene.environmentIntensity=night?.20:fairy?.45:.75;
    hemi.color.set(night?0x92aeed:fairy?0xdbefff:0xe8f1ff);hemi.groundColor.set(night?0x3f3b52:0xb4a27f);hemi.intensity=night?.85:fairy?1.7:2.2;
    key.color.set(night?0xb4c9ff:fairy?0xffd99d:0xfff1df);key.intensity=night?1.5:fairy?3.1:3.3;
    key.position.set(night?-5:-4,night?7:9,night?-6:5);key.target.position.set(0,0,0);
    fill.color.set(night?0x969bde:0xdeeeff);fill.intensity=night?.7:1.1;bounce.color.set(night?0xeebd76:0xffdfa8);bounce.intensity=night?.35:.55;
    renderer.toneMappingExposure=night?1.1:fairy?1.08:1.02;
    skyMaterial.uniforms.top.value.set(night?'#111b37':'#a9cfe4');skyMaterial.uniforms.horizon.value.set(night?'#566078':'#f4e6c6');skyMaterial.uniforms.bottom.value.set(night?'#283f47':'#bbcfad');
    moonMaterial.color.set(night?0xffe5af:0xfff4cb);celestial.scale.setScalar(night?1.05:.7);halo.material.opacity=night?.58:.7;
  }
  set('ceramic');
  return {set,update(t){if(style==='fairy'&&period==='night')stars.material.opacity=.68+Math.sin(t*.4)*.07;},dispose(){scene.remove(group);if(scene.environment===env.texture)scene.environment=previousEnv;env.dispose();const g=new Set(),m=new Set();group.traverse(o=>{if(o.geometry)g.add(o.geometry);if(o.material)m.add(o.material);});g.forEach(v=>v.dispose());m.forEach(v=>v.dispose());glowTexture.dispose();key.shadow.map?.dispose();}};
}

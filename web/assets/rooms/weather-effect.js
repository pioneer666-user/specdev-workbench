import * as THREE from 'three'
import { Reflector } from '../three/Reflector.js'
import { WEATHER_BUDGET as B, weatherCounts, weatherSeeds } from './weather-layout.js'
import { registerReflection, withReflection } from './reflection-guard.js'

// T43雨丝/落点的柔边、头尾、速度、距离淡出；遮盖改为产品房壳与门檐。
const coverGLSL = `uniform vec4 covers[2];uniform int coverCount;
float covered(vec2 p){float c=0.;for(int i=0;i<2;i++){if(i<coverCount){vec4 b=covers[i];c=max(c,step(b.x,p.x)*step(p.x,b.y)*step(b.z,p.y)*step(p.y,b.w));}}return c;}`
const supportGLSL = `uniform vec4 support;uniform float supportY;float groundAt(vec2 p){return mix(groundY,supportY,step(support.x,p.x)*step(p.x,support.y)*step(support.z,p.y)*step(p.y,support.w));}`
const hashGLSL = `float hash21(vec2 p){p=fract(p*vec2(123.34,345.45));p+=dot(p,p+34.345);return fract(p.x*p.y);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x),mix(hash21(i+vec2(0,1)),hash21(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){return noise(p)*.5+noise(p*2.03)*.25+noise(p*4.01)*.125+noise(p*8.02)*.0625;}`
function geometry(data, splash = false) {
  const geo = new THREE.InstancedBufferGeometry()
  geo.setIndex([0, 1, 2, 0, 2, 3])
  geo.setAttribute('position', new THREE.Float32BufferAttribute(splash ? [-1,-1,0,1,-1,0,1,1,0,-1,1,0] : [-.5,0,0,.5,0,0,.5,1,0,-.5,1,0], 3))
  geo.setAttribute('drop', new THREE.InstancedBufferAttribute(data, 4)); geo.instanceCount = 0
  return geo
}
// 和 buildOutdoorGround 相同承接面，只有视觉覆盖；遮盖孔在片元阶段再次排除。
function groundGeometry(layout) {
  const { interior: b, outer: o } = layout
  const shape = new THREE.Shape(); shape.moveTo(-o,-o); shape.lineTo(o,-o); shape.lineTo(o,o); shape.lineTo(-o,o); shape.closePath()
  const hole = new THREE.Path(); hole.moveTo(b.minX,-b.minZ); hole.lineTo(b.maxX,-b.minZ); hole.lineTo(b.maxX,-b.maxZ); hole.lineTo(b.minX,-b.maxZ); hole.closePath()
  shape.holes.push(hole); return new THREE.ShapeGeometry(shape)
}
export function createWeatherEffect({ scene, renderer, layout, groundColor }) {
  const group = new THREE.Group(); group.name = '天气：屋外雨丝、落点和湿润覆盖'
  const resources = new Set(), keep = r => { resources.add(r); return r }
  let floor, unregister = () => {}, disposed = false, updates = 0
  const covers = Array.from({ length: 2 }, (_, i) => { const b = layout.covers[i]; return b ? new THREE.Vector4(b.minX,b.maxX,b.minZ,b.maxZ) : new THREE.Vector4() })
  const uniforms = { time: { value: 0 }, rain: { value: 0 }, wind: { value: 0 }, groundY: { value: layout.groundY }, night: { value: 0 },
    covers: { value: covers }, coverCount: { value: layout.covers.length }, right: { value: new THREE.Vector3(1,0,0) },
    support:{value:new THREE.Vector4(layout.threshold.minX,layout.threshold.maxX,layout.threshold.minZ,layout.threshold.maxZ)},supportY:{value:layout.threshold.y} }
  function dispose() {
    if (disposed) return; disposed = true; unregister()
    if (floor) { floor.onBeforeRender = () => {}; floor.dispose() }
    for (const resource of resources) resource.dispose()
    resources.clear(); group.removeFromParent(); group.clear()
  }
  try {
    floor = new Reflector(keep(groundGeometry(layout)), { color:groundColor, textureWidth: B.reflectionWidth, textureHeight: B.reflectionHeight, clipBias: .003, multisample: 0,
      shader: { name: '既有屋外地面 / 雨天湿润', uniforms: { color: { value: groundColor.clone() }, tDiffuse: { value: null }, textureMatrix: { value: new THREE.Matrix4() },
        time: { value: 0 }, rain: { value: 0 }, wet: { value: 0 }, night: { value: 0 }, eye: { value: new THREE.Vector3() },
        covers: { value: covers }, coverCount: { value: layout.covers.length }, texel: { value: new THREE.Vector2(1/B.reflectionWidth,1/B.reflectionHeight) } },
      vertexShader: `uniform mat4 textureMatrix;varying vec4 vUv;varying vec3 vWorld;void main(){vUv=textureMatrix*vec4(position,1.);vWorld=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `uniform sampler2D tDiffuse;uniform vec3 color;uniform float time;uniform float rain;uniform float wet;uniform float night;uniform vec3 eye;uniform vec2 texel;varying vec4 vUv;varying vec3 vWorld;
        ${coverGLSL}${hashGLSL}
        vec2 ripple(vec2 p){vec2 cell=floor(p),result=vec2(0.);for(int x=-1;x<=1;x++){for(int y=-1;y<=1;y++){
          vec2 c=cell+vec2(float(x),float(y));float seed=hash21(c);float age=fract(time*.59+seed*19.);
          vec2 center=c+vec2(hash21(c+.32),hash21(c+7.31)),delta=p-center;float dist=length(delta),radius=age*.85;
          float rd=(dist-radius)*27.;float envelope=exp(-rd*rd)*(1.-age)*(1.-age);
          result+=normalize(delta+.0001)*sin((dist-radius)*66.)*envelope*step(seed,clamp(rain*1.2,0.,1.));}}return result;}
        void main(){if(covered(vWorld.xz)>.5)discard;vec2 p=vWorld.xz;float macro=fbm(p*.2),grain=noise(p*48.);
          float puddle=smoothstep(.29,.51,macro+noise(p*.9)*.1);
          vec2 rip=ripple(p*1.5)*.0035*rain,rough=vec2(noise(p*8.),noise(p*8.+70.))-.5,uv=vUv.xy/vUv.w;
          float dist=length(eye-vWorld);uv+=(rough*.0012*(1.-puddle)+rip)*clamp(8./max(dist,.1),.16,1.);
          vec2 blur=texel*(1.2+3.5*(1.-puddle));vec3 reflection=texture2D(tDiffuse,uv).rgb*.40;
          reflection+=(texture2D(tDiffuse,uv+vec2(blur.x,blur.y)).rgb+texture2D(tDiffuse,uv-vec2(blur.x,blur.y)).rgb+texture2D(tDiffuse,uv+vec2(-blur.x,blur.y)).rgb+texture2D(tDiffuse,uv+vec2(blur.x,-blur.y)).rgb)*.15;
          float fresnel=pow(clamp(1.-normalize(eye-vWorld).y,0.,1.),3.);
          vec3 base=color*(.68+macro*.14+grain*.025)*(1.-night*.72);
          vec3 result=mix(base,reflection,(mix(.10,.46,puddle)+fresnel*.18)*(.65+.3*rain));
          result+=vec3(.07,.095,.092)*length(rip)*12.;gl_FragColor=vec4(result,wet*.85);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }` } })
    floor.name = '既有室外地面湿润覆盖'; floor.rotation.x = -Math.PI/2; floor.position.y = layout.groundY + .002
    floor.material.transparent = true; floor.material.depthWrite = false; floor.renderOrder = 1
    group.add(floor); unregister = registerReflection(renderer, floor)
    const reflect = floor.onBeforeRender
    floor.onBeforeRender = (r, s, camera) => { if (!disposed) withReflection(r, () => { reflect.call(floor,r,s,camera); updates++ }) }
    const rainData = weatherSeeds(B.rain, false, layout), splashData = weatherSeeds(B.splashes, true, layout)
    const rainGeo = keep(geometry(rainData)), splashGeo = keep(geometry(splashData, true))
    const rainMat = keep(new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.NormalBlending, uniforms,
      vertexShader: `attribute vec4 drop;uniform float time;uniform float rain;uniform float wind;uniform float groundY;uniform float night;uniform vec3 right;${supportGLSL}varying vec2 vUv;varying float vAlpha;varying vec3 vPos;
        void main(){float speed=10.+drop.w*7.+rain*4.,height=mod(drop.z*18.-time*speed,18.),drift=wind*3.8;
          vec3 p=vec3(drop.x+(18.-height)*drift/speed,groundY+height,drop.y);p.x+=sin(time*.38+drop.y*.15)*wind*.22;
          p.y=groundAt(p.xz)+height;
          float width=mix(.010+drop.w*.011,.008+drop.w*.009,night),len=.18+drop.w*.28+rain*.14;
          vec3 corner=p+right*position.x*width+vec3(-len*drift/speed,len,0.)*position.y;
          vec4 mv=modelViewMatrix*vec4(corner,1.);vUv=vec2(position.x+.5,position.y);vPos=corner;
          float dist=-mv.z;vAlpha=(.12+drop.w*.25)*mix(1.3,1.,night)*smoothstep(.5,3.,dist)*(1.-smoothstep(25.,78.,dist));gl_Position=projectionMatrix*mv;}`,
      fragmentShader: `varying vec2 vUv;varying float vAlpha;varying vec3 vPos;uniform float night;${coverGLSL}
        void main(){if(covered(vPos.xz)>.5)discard;float a=pow(max(1.-abs(vUv.x*2.-1.),0.),1.3)*sin(vUv.y*3.14159);
          float warm=exp(-length(vPos.xz-vec2(2.25,-3.4))*.32)*.28;
          // 白昼浅底使用灰蓝雨丝增加对比；夜晚保持原配色、宽度和透明度。
          vec3 tint=mix(vec3(.25,.36,.40),vec3(.66,.80,.80)*.73,night);
          gl_FragColor=vec4(mix(tint,vec3(1.,.76,.43),warm),a*vAlpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }` }))
    const splashMat = keep(new THREE.ShaderMaterial({ uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: `attribute vec4 drop;uniform float time;uniform float groundY;varying vec2 vUv;varying float vAge;varying float vAlpha;varying vec3 vPos;
        void main(){vAge=fract(time*(.58+drop.w*.4)+drop.z*7.);vUv=position.xy;float size=.12+vAge*.46;
          vec3 p=vec3(drop.x+position.x*size,groundY+.006,drop.y+position.y*size);vPos=p;vec4 mv=modelViewMatrix*vec4(p,1.);
          vAlpha=(1.-vAge)*(.12+drop.w*.16)*(1.-smoothstep(14.,44.,-mv.z));gl_Position=projectionMatrix*mv;}`,
      fragmentShader: `varying vec2 vUv;varying float vAge;varying float vAlpha;varying vec3 vPos;${coverGLSL}
        void main(){if(covered(vPos.xz)>.5)discard;float r=length(vUv),d1=(r-.78)*55.,d2=(r-.55)*65.;
          float ring=exp(-d1*d1),second=exp(-d2*d2)*.35,impact=exp(-r*24.)*(1.-smoothstep(0.,.15,vAge));
          gl_FragColor=vec4(.56,.72,.68,(ring+second+impact)*vAlpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }` }))
    const rainMesh = new THREE.Mesh(rainGeo,rainMat), splashMesh = new THREE.Mesh(splashGeo,splashMat)
    rainMesh.frustumCulled = splashMesh.frustumCulled = false; rainMesh.renderOrder = 3; splashMesh.renderOrder = 2
    group.add(rainMesh,splashMesh)
    // 天气层不参与家具拾取（原身份与遮挡列表不变）。
    for (const node of [floor,rainMesh,splashMesh]) node.raycast = () => {}
    scene.add(group)
    return { group, floor, rainMesh, splashMesh,
      update(time, rain, wet, night, camera) {
        if (disposed) return
        const n = weatherCounts(rain)
        uniforms.time.value = time; uniforms.rain.value = rain/100; uniforms.wind.value = .14+.38*Math.pow(rain/100,2); uniforms.night.value = night
        camera.updateMatrixWorld(); uniforms.right.value.setFromMatrixColumn(camera.matrixWorld,0)
        rainGeo.instanceCount = n.rain; splashGeo.instanceCount = n.splashes
        rainMesh.visible = n.rain>0; splashMesh.visible = n.splashes>0
        Object.assign(floor.material.uniforms.time, { value: time }); floor.material.uniforms.rain.value = rain/100
        floor.material.uniforms.wet.value = wet; floor.material.uniforms.night.value = night; floor.material.uniforms.eye.value.copy(camera.position)
      },
      stopDrops() { rainGeo.instanceCount = splashGeo.instanceCount = 0; rainMesh.visible = splashMesh.visible = false },
      stats() { return { rain: rainGeo.instanceCount, splashes: splashGeo.instanceCount, knownGeometryBytes: [...resources].filter(r=>r.isBufferGeometry).reduce((n,g)=>n+Object.values(g.attributes).reduce((a,b)=>a+b.array.byteLength,0)+(g.index?.array.byteLength||0),0),
        reflection: { width: floor.getRenderTarget().width, height: floor.getRenderTarget().height, samples: 0, callbackAttempts:updates, colorLogicalBytes: B.reflectionWidth*B.reflectionHeight*8 }, resources: resources.size+2 } },
      dispose }
  } catch (error) { dispose(); throw error }
}

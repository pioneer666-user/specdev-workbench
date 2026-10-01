import * as THREE from 'three';

// 所有陶瓷房间共用递归锁；离屏渲染期间不再触发另一面反射。
const reflectingRenderers = new WeakSet();

/** 只为水平地面服务的实时平面反射，保留物理材质原有的釉面照明。 */
export function createCeramicReflection({ surface, material, glazeTexture, renderer, scene }) {
  const target = new THREE.WebGLRenderTarget(1024, 1024, {
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: true,
    generateMipmaps: false,
  });
  target.texture.name = '陶瓷地面 / 实时线性反射';
  target.texture.colorSpace = THREE.LinearSRGBColorSpace;
  const uniforms = {
    roomReflection: { value: target.texture },
    roomReflectionMatrix: { value: new THREE.Matrix4() },
    roomGlaze: { value: glazeTexture },
    roomReflectionReady: { value: 0 },
    roomReflectionTexel: { value: new THREE.Vector2(1 / 1024, 1 / 1024) },
  };
  let mirrorCamera = new THREE.PerspectiveCamera();
  let disposed = false;
  let lastWidth = 1024;
  let lastHeight = 1024;
  const surfacePosition = new THREE.Vector3();
  const cameraPosition = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const view = new THREE.Vector3();
  const lookAt = new THREE.Vector3();
  const reflectedTarget = new THREE.Vector3();
  const rotation = new THREE.Matrix4();
  const plane = new THREE.Plane();
  const clip = new THREE.Vector4();
  const q = new THREE.Vector4();
  const projectionInverse = new THREE.Matrix4();
  const drawSize = new THREE.Vector2();
  const viewport = new THREE.Vector4();

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `
      #include <common>
      uniform mat4 roomReflectionMatrix;
      varying vec4 vRoomReflectionCoord;
    `).replace('#include <project_vertex>', `
      #include <project_vertex>
      vRoomReflectionCoord = roomReflectionMatrix * modelMatrix * vec4(transformed, 1.0);
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `
      #include <common>
      uniform sampler2D roomReflection;
      uniform sampler2D roomGlaze;
      uniform vec2 roomReflectionTexel;
      uniform float roomReflectionReady;
      varying vec4 vRoomReflectionCoord;
    `).replace('#include <opaque_fragment>', `
      // 真实镜像相机提供窗框、门与之后加入的家具；釉面起伏只扰动极少量坐标。
      vec2 reflectUv = vRoomReflectionCoord.xy / vRoomReflectionCoord.w;
      vec2 glazeSlope = texture2D(roomGlaze, vMapUv).rg * 2.0 - 1.0;
      reflectUv += glazeSlope * 0.0022;
      vec2 blurStep = roomReflectionTexel * 1.35;
      vec3 reflected = texture2D(roomReflection, reflectUv).rgb * 0.28;
      reflected += texture2D(roomReflection, reflectUv + vec2(blurStep.x, 0.0)).rgb * 0.12;
      reflected += texture2D(roomReflection, reflectUv - vec2(blurStep.x, 0.0)).rgb * 0.12;
      reflected += texture2D(roomReflection, reflectUv + vec2(0.0, blurStep.y)).rgb * 0.12;
      reflected += texture2D(roomReflection, reflectUv - vec2(0.0, blurStep.y)).rgb * 0.12;
      reflected += texture2D(roomReflection, reflectUv + blurStep).rgb * 0.055;
      reflected += texture2D(roomReflection, reflectUv - blurStep).rgb * 0.055;
      reflected += texture2D(roomReflection, reflectUv + vec2(blurStep.x, -blurStep.y)).rgb * 0.055;
      reflected += texture2D(roomReflection, reflectUv + vec2(-blurStep.x, blurStep.y)).rgb * 0.055;
      float viewGlance = 1.0 - clamp(dot(normal, geometryViewDir), 0.0, 1.0);
      float reflectAmount = (0.19 + 0.46 * pow(viewGlance, 3.0)) * roomReflectionReady;
      // 灰缝保持哑光；只有完整釉面承担倒影。
      reflectAmount *= smoothstep(0.12, 0.4, texture2D(roomGlaze, vMapUv).b);
      float edgeMask = step(0.001, reflectUv.x) * step(reflectUv.x, 0.999)
        * step(0.001, reflectUv.y) * step(reflectUv.y, 0.999);
      outgoingLight = mix(outgoingLight, reflected, reflectAmount * edgeMask);
      #include <opaque_fragment>
    `);
  };
  material.customProgramCacheKey = () => 'ceramic-room-planar-reflection-v1';

  surface.onBeforeRender = (activeRenderer, activeScene, camera) => {
    const render = renderer || activeRenderer;
    const world = scene || activeScene;
    if (disposed || !render || !world || !camera || reflectingRenderers.has(render)) return;
    if (!camera.isPerspectiveCamera && !camera.isOrthographicCamera) return;

    surface.updateWorldMatrix(true, false);
    camera.updateWorldMatrix(true, false);
    surfacePosition.setFromMatrixPosition(surface.matrixWorld);
    cameraPosition.setFromMatrixPosition(camera.matrixWorld);
    rotation.extractRotation(surface.matrixWorld);
    normal.set(0, 0, 1).transformDirection(rotation);
    view.subVectors(surfacePosition, cameraPosition);
    if (view.dot(normal) >= 0) { uniforms.roomReflectionReady.value = 0; return; }

    if (mirrorCamera.isOrthographicCamera !== camera.isOrthographicCamera) {
      mirrorCamera = camera.isOrthographicCamera ? new THREE.OrthographicCamera() : new THREE.PerspectiveCamera();
    }
    view.reflect(normal).negate().add(surfacePosition);
    rotation.extractRotation(camera.matrixWorld);
    lookAt.set(0, 0, -1).transformDirection(rotation).add(cameraPosition);
    reflectedTarget.subVectors(surfacePosition, lookAt).reflect(normal).negate().add(surfacePosition);
    mirrorCamera.position.copy(view);
    mirrorCamera.up.set(0, 1, 0).transformDirection(rotation).reflect(normal);
    mirrorCamera.lookAt(reflectedTarget);
    mirrorCamera.near = camera.near;
    mirrorCamera.far = camera.far;
    mirrorCamera.layers.mask = camera.layers.mask;
    mirrorCamera.projectionMatrix.copy(camera.projectionMatrix);
    mirrorCamera.updateMatrixWorld();
    mirrorCamera.matrixWorldInverse.copy(mirrorCamera.matrixWorld).invert();

    uniforms.roomReflectionMatrix.value.set(
      0.5, 0, 0, 0.5,
      0, 0.5, 0, 0.5,
      0, 0, 0.5, 0.5,
      0, 0, 0, 1,
    ).multiply(mirrorCamera.projectionMatrix).multiply(mirrorCamera.matrixWorldInverse);

    // 将地面变成镜像相机的近裁面，避免地台底面和房间外部倒灌进反射。
    plane.setFromNormalAndCoplanarPoint(normal, surfacePosition).applyMatrix4(mirrorCamera.matrixWorldInverse);
    clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    projectionInverse.copy(mirrorCamera.projectionMatrix).invert();
    q.set(Math.sign(clip.x), Math.sign(clip.y), 1, 1).applyMatrix4(projectionInverse);
    const denominator = clip.dot(q);
    if (Math.abs(denominator) < 0.000001) return;
    clip.multiplyScalar(2 / denominator);
    const projection = mirrorCamera.projectionMatrix.elements;
    projection[2] = clip.x - projection[3];
    projection[6] = clip.y - projection[7];
    projection[10] = clip.z - projection[11] - 0.0003;
    projection[14] = clip.w - projection[15];
    mirrorCamera.projectionMatrixInverse.copy(mirrorCamera.projectionMatrix).invert();

    render.getDrawingBufferSize(drawSize);
    const scale = Math.min(1, 1400 / Math.max(drawSize.x, drawSize.y));
    const width = Math.max(256, Math.round(drawSize.x * scale));
    const height = Math.max(256, Math.round(drawSize.y * scale));
    if (width !== lastWidth || height !== lastHeight) {
      target.setSize(width, height);
      uniforms.roomReflectionTexel.value.set(1 / width, 1 / height);
      lastWidth = width;
      lastHeight = height;
    }

    const previousTarget = render.getRenderTarget();
    const previousFace = render.getActiveCubeFace();
    const previousMip = render.getActiveMipmapLevel();
    const previousXR = render.xr.enabled;
    const previousShadowUpdate = render.shadowMap.autoUpdate;
    const previousAutoClear = render.autoClear;
    const previousVisibility = surface.visible;
    render.getCurrentViewport(viewport);
    reflectingRenderers.add(render);
    try {
      surface.visible = false;
      render.xr.enabled = false;
      render.shadowMap.autoUpdate = false;
      render.autoClear = true;
      render.setRenderTarget(target);
      // setRenderTarget 已用目标纹理的物理尺寸设置 viewport / scissor；
      // 此处不能再 setViewport，否则高 DPI 屏幕会被额外乘一次像素比例。
      render.state.buffers.depth.setMask(true);
      render.clear();
      render.render(world, mirrorCamera);
      uniforms.roomReflectionReady.value = 1;
    } finally {
      surface.visible = previousVisibility;
      render.xr.enabled = previousXR;
      render.shadowMap.autoUpdate = previousShadowUpdate;
      render.autoClear = previousAutoClear;
      render.setRenderTarget(previousTarget, previousFace, previousMip);
      render.state.viewport(viewport);
      reflectingRenderers.delete(render);
    }
  };

  return {
    target,
    dispose() {
      if (disposed) return;
      disposed = true;
      surface.onBeforeRender = () => {};
      target.dispose();
      uniforms.roomReflectionReady.value = 0;
    },
  };
}

import { Vector4 } from 'three'
// 两种水平反射共用 renderer 锁，采样时互相排除；晴天只有原陶瓷表面登记。
const renderers = new WeakMap()
const state = renderer => { let s = renderers.get(renderer); if (!s) { s = { active: false, surfaces: new Set(), viewport: new Vector4() }; renderers.set(renderer, s) } return s }
export const reflecting = renderer => state(renderer).active
export function registerReflection(renderer, surface) {
  const s = state(renderer); s.surfaces.add(surface)
  return () => { s.surfaces.delete(surface) }
}
export function withReflection(renderer, callback) {
  const s = state(renderer)
  if (s.active) return false
  const visibility = [...s.surfaces].map(surface => [surface, surface.visible])
  const target=renderer.getRenderTarget?.(),face=renderer.getActiveCubeFace?.(),mip=renderer.getActiveMipmapLevel?.(),xr=renderer.xr?.enabled,shadow=renderer.shadowMap?.autoUpdate,autoClear=renderer.autoClear
  renderer.getCurrentViewport?.(s.viewport)
  s.active = true
  try { for (const [surface] of visibility) surface.visible = false; callback(); return true }
  finally {
    for (const [surface, value] of visibility) surface.visible = value
    if(renderer.xr)renderer.xr.enabled=xr
    if(renderer.shadowMap)renderer.shadowMap.autoUpdate=shadow
    renderer.autoClear=autoClear
    renderer.setRenderTarget?.(target,face,mip)
    if(renderer.getCurrentViewport)renderer.state?.viewport?.(s.viewport)
    s.active=false
  }
}

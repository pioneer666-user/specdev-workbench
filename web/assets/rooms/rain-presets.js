export const RAIN_BASE = '/specdev-workbench/assets/audio/rain/'
export const RAIN_TRACKS = Object.freeze(['light', 'heavy'])
export const RAIN_LIMITS = Object.freeze({ cachedBuffers: 2, decoding: 1, sources: 2, duration: 22 })
// 原字节已在T43处理；仅产品混音基础电平不同，不再次加工素材。
export const RAIN_GAIN = .24
export function rainResource(key) {
  if (!RAIN_TRACKS.includes(key)) throw new TypeError('雨声资源不在固定目录')
  return RAIN_BASE + key + '.wav'
}
export function rainLevels(value) {
  const r = Math.max(0, Math.min(1, value/100)), cross = Math.max(0, Math.min(1,(r-.2)/.65))
  const amplitude = r ? .32+.68*Math.sqrt(r) : 0
  return [Math.cos(cross*Math.PI/2)*amplitude*RAIN_GAIN, Math.sin(cross*Math.PI/2)*amplitude*RAIN_GAIN]
}
export const RAIN_BACKGROUND_FADE_END = 30
// A1作者认可：小雨逐渐交接，30及以上背景目标精确归0。
export function rainBackground(value) {
  const t=Math.max(0,Math.min(1,value/RAIN_BACKGROUND_FADE_END))
  return 1-t*t*(3-2*t)
}

// T43 @2d975dc 的容量、密度、速度种子；产品承接面为既有室外四块地面 Y=0。
export const WEATHER_BUDGET = Object.freeze({ rain: 32000, splashes: 950, scale: .76, seed: 28173, height: 18, reflectionWidth: 1024, reflectionHeight: 768 })
export const WEATHER_TRANSITION_MS = 280
export function rainValue(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError('雨量必须是有限数字')
  return Math.max(0, Math.min(100, value))
}
export function weatherCounts(value) {
  const r = rainValue(value) / 100
  return { rain: r ? Math.floor((900 + Math.pow(r, 1.2) * (WEATHER_BUDGET.rain - 900)) * WEATHER_BUDGET.scale) : 0,
    splashes: Math.floor(WEATHER_BUDGET.splashes * r * WEATHER_BUDGET.scale) }
}
// 从现有墙体外缘/彩瓦门檐得出遮盖，独立于总览的裁墙可见性。
// 原房壳是剖看模型，没有可见整屋顶；建筑内投影保持干燥，门檐按真实两片瓦顶投影。
export function weatherLayout(template) {
  const b = template.interiorBounds
  if (!['fairy', 'ceramic'].includes(template.styleId)) throw new TypeError('未知天气房型')
  const wall = template.styleId === 'fairy' ? .26 : .18
  const covers = [{ minX: b.minX - wall, maxX: b.maxX + wall, minZ: b.minZ - wall, maxZ: b.maxZ + wall }]
  if (template.styleId === 'fairy') covers.push({ minX: 1.08, maxX: 3.42, minZ: -4.12, maxZ: -3.26 })
  const threshold = template.styleId === 'ceramic' ? {minX:1.55,maxX:2.95,minZ:-3.31,maxZ:-2.93,y:.0175} : {minX:1.4,maxX:3.1,minZ:-3.79,maxZ:-3.01,y:.004}
  return { covers, groundY: 0, threshold, outer: 60, interior: { minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ } }
}
export const supportHeight = (layout,x,z) => {const t=layout.threshold;return x>=t.minX&&x<=t.maxX&&z>=t.minZ&&z<=t.maxZ?t.y:layout.groundY}
export const covered = (layout, x, z, margin = 0) => layout.covers.some(b => x >= b.minX - margin && x <= b.maxX + margin && z >= b.minZ - margin && z <= b.maxZ + margin)
export const supported = (layout, x, z) => Math.abs(x) <= layout.outer && Math.abs(z) <= layout.outer && !(x > layout.interior.minX && x < layout.interior.maxX && z > layout.interior.minZ && z < layout.interior.maxZ)
export function weatherSeeds(count, splash, layout) {
  if (!Number.isInteger(count) || count < 0 || count > (splash ? WEATHER_BUDGET.splashes : WEATHER_BUDGET.rain)) throw new RangeError('天气实例超限')
  let seed = splash ? 91377 : WEATHER_BUDGET.seed
  const rng = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
  const data = new Float32Array(count * 4)
  for (let i = 0; i < count; i++) {
    let x, z
    do { if (rng() < .25) { x = rng() * 28 - 14; z = rng() * 12 - 16 } else { x = rng() * 56 - 28; z = rng() * 56 - 20 } }
    while (covered(layout, x, z, splash ? .7 : 0) || !supported(layout, x, z))
    data.set([x, z, rng(), rng()], i * 4)
  }
  return data
}

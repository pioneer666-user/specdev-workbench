// 固定运行时映射，室内边界消费模板；不是 room.json 的可编辑材质协议。
import { ROOM_FLOOR_SURFACES } from './floor-surfaces.js'
import { FOOTSTEP_GAINS } from './sound-mix.js'
export const FOOTSTEP_BASE = '/specdev-workbench/assets/audio/footsteps/'
// 只认八枚正式资源；在线、构建与离线均消费同一文件/MIME表。
export const FOOTSTEP_RESOURCES = Object.freeze(Object.fromEntries([
  ...[1, 2, 3, 4].map(i => [`tile-a1-${i}`, Object.freeze({ file: `tile-a1-${i}.mp3`, mime: 'audio/mpeg' })]),
  ...[1, 2, 3, 4].map(i => [`wood-a3-${i}`, Object.freeze({ file: `wood-a3-${i}.wav`, mime: 'audio/wav' })]),
]))
export const FOOTSTEP_SAMPLES = Object.freeze(Object.keys(FOOTSTEP_RESOURCES))
export function footstepResource(key) {
  if (typeof key !== 'string' || !Object.hasOwn(FOOTSTEP_RESOURCES, key)) throw new Error('脚步资源不在固定目录')
  return FOOTSTEP_RESOURCES[key]
}
const hard = Object.freeze(FOOTSTEP_SAMPLES.slice(0, 4)), wood = Object.freeze(FOOTSTEP_SAMPLES.slice(4))
export const FOOTSTEP_GROUPS = Object.freeze({
  tile: Object.freeze({ samples: hard, gain: FOOTSTEP_GAINS.tile }),
  wood: Object.freeze({ samples: wood, gain: FOOTSTEP_GAINS.wood }),
  stone: Object.freeze({ samples: hard, gain: FOOTSTEP_GAINS.stone }),
  neutral: Object.freeze({ samples: hard, gain: FOOTSTEP_GAINS.neutral }),
})
export const FOOTSTEP_PRESETS = Object.freeze({ crisp: 'tile', deep: 'wood', surface: null })

export function createFootstepSurface(template) {
  const b = template.interiorBounds, d = template.entry.door
  return position => {
    if (position.x >= b.minX && position.x <= b.maxX && position.z >= b.minZ && position.z <= b.maxZ) {
      return ROOM_FLOOR_SURFACES[template.styleId].interior
    }
    // 石门槛与底座同源；硬面区延至室内接缝，室内闭边界优先为木地面。
    const t = ROOM_FLOOR_SURFACES[template.styleId].threshold
    if (t && position.x >= t.x - t.width / 2 && position.x <= t.x + t.width / 2 && position.z >= t.z - t.depth / 2 && position.z <= d.centerZ) return t.surface
    return 'neutral'
  }
}

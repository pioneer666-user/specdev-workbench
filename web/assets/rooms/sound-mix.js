// T42静态平衡：自然底色退后；A3直接复用作者选中的A预配短片，木组只乘1.0。
// 输入SHA、旧值、新值与数值边界见 experiments/2026-10-12-T42-A木脚步接入。
export const AMBIENCE_GAINS = Object.freeze({
  'forest-day': .32, 'forest-night': .28,
  'ceramic-day': .32, 'ceramic-night': .38,
})
export const FOOTSTEP_GAINS = Object.freeze({ tile: .70, wood: 1.0, stone: .65, neutral: .44 })
export const MIX_RAMP_SECONDS = .04
export const RAIN_BACKGROUND_RAMP_SECONDS = .5

// 四个固定节点；分类各乘一次，总量再乘一次。环境雨天包络只作用于环境分类节点。
export function createSoundMix(context, { volume, footstepsVolume, masterVolume, rainVolume = 30 }) {
  let disposed = false
  let environmentVolume = volume, duck = 1
  const create = (initial, output) => {
    const node = context.createGain()
    node.gain.value = initial / 100; node.connect(output)
    let envelope = { from: initial / 100, to: initial / 100, start: context.currentTime, duration: 0 }
    return { node, set(value, duration = MIX_RAMP_SECONDS) {
      if (disposed) return
      const now = context.currentTime, e = envelope
      const progress=e.duration?Math.max(0,Math.min(1,(now-e.start)/e.duration)):1
      const from = e.from + (e.to - e.from) * progress
      node.gain.cancelScheduledValues(now); node.gain.setValueAtTime(from, now)
      node.gain.linearRampToValueAtTime(value / 100, now + duration)
      envelope = { from, to: value / 100, start: now, duration }
    } }
  }
  const master = create(masterVolume, context.destination)
  const ambience = create(volume, master.node), footsteps = create(footstepsVolume, master.node), rain = create(rainVolume, master.node)
  return {
    ambience: ambience.node, footsteps: footsteps.node, rain: rain.node,
    setVolume: value => { environmentVolume = value; ambience.set(value*duck) }, setFootstepsVolume: value => footsteps.set(value),
    setRainVolume: value => rain.set(value),
    setRainDuck(value) { if (value===duck) return; duck=value; ambience.set(environmentVolume*duck,RAIN_BACKGROUND_RAMP_SECONDS) },
    setMasterVolume: value => master.set(value),
    dispose() { if (disposed) return; disposed = true; ambience.node.disconnect(); footsteps.node.disconnect(); rain.node.disconnect(); master.node.disconnect() },
  }
}

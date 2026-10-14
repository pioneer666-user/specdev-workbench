import { FOOTSTEP_BASE, FOOTSTEP_GROUPS, FOOTSTEP_PRESETS, footstepResource } from './footstep-surfaces.js'
import { WALK_SPEED, WALK_RUN_SPEED } from './walk-frame.js'

export const FOOTSTEP_LIMITS = Object.freeze({ cachedBuffers: 8, decoding: 1, sources: 2, maxDuration: .4, maxSampleRate: 48000 })

/** 只消费已完成碰撞的水平位移。没有 RAF、排队播放或 resume；音频所有权在声音总控。 */
export function createRoomFootsteps({ context: getContext, output, resolveSurface = () => 'neutral',
  load = async (key, signal) => {
    const response = await fetch(FOOTSTEP_BASE + footstepResource(key).file, { signal })
    if (!response.ok) throw new Error('脚步文件未能加载')
    return response.arrayBuffer()
  }, random = Math.random, onChange = () => {} }) {
  let enabled = true, volume = 50, preset = 'crisp', available = false, disposed = false, revision = 0
  let distance = 0, threshold = .3, previous = null, status = 'off', message = '随总声音开启', retry = false
  let loading = null, abort = null, requestedGroup = null, failed = false
  const cache = new Map(), sources = new Set()
  const snapshot = () => ({ enabled, volume, preset, status, message, retry })
  const notify = (value, text, again = false) => { if (!disposed) { status = value; message = text; retry = again; onChange() } }
  const wanted = () => !disposed && available && enabled && volume > 0 && !failed
  const preferenceStatus = () => notify(!enabled ? 'off' : !volume ? 'muted' : !available ? 'off' : 'ready', !enabled ? '脚步已单独关闭' : !volume ? '脚步音量为 0' : !available ? '随总声音开启' : '实际走动时发声')
  const resetDistance = () => { distance = 0; threshold = .3 }
  function release(voice, stop = false) {
    if (!sources.delete(voice)) return
    voice.source.onended = null
    if (stop) { try { voice.source.stop() } catch {} }
    voice.source.disconnect(); voice.gain.disconnect()
    if (!stop) onChange()
  }
  function reset(stop = true) {
    resetDistance()
    if (stop) for (const voice of [...sources]) release(voice, true)
  }
  function invalidate(stop = true) { revision++; abort?.abort(); abort = null; requestedGroup = null; reset(stop) }
  function fail(error) {
    failed = true; invalidate()
    notify('error', `${error.message || '脚步未能播放'}；可点击继续播放重试脚步`, true)
  }
  async function prepare(group) {
    requestedGroup = group
    if (loading || !wanted()) return
    const current = revision, ctx = getContext(), controller = new AbortController()
    if (!ctx || ctx.state !== 'running') return
    abort = controller
    const operation = (async () => {
      // 同一短样一次解码；跨组只记最后目标，无每帧 Promise 排队。
      while (current === revision && wanted() && requestedGroup) {
        const target = requestedGroup; requestedGroup = null
        for (const key of FOOTSTEP_GROUPS[target].samples) {
          if (cache.has(key)) continue
          const bytes = await load(key, controller.signal)
          if (current !== revision || !wanted()) return
          const decoded = await ctx.decodeAudioData(bytes)
          if (current !== revision || !wanted()) return
          if (decoded.numberOfChannels !== 1 || !Number.isFinite(decoded.duration) || decoded.duration <= 0 || decoded.duration > FOOTSTEP_LIMITS.maxDuration || !Number.isFinite(decoded.sampleRate) || decoded.sampleRate > FOOTSTEP_LIMITS.maxSampleRate) throw new Error('脚步资源格式不符')
          cache.set(key, decoded)
        }
        if (current === revision && wanted()) notify('ready', '脚步已就绪 · 实际走动时发声')
      }
    })()
    loading = operation
    try { await operation } catch (error) { if (current === revision && wanted()) fail(error) }
    finally {
      if (loading === operation) loading = null
      if (abort === controller) abort = null
      // 旧不可取消解码收尾后，只准备当前组；没有历史脚步可补播。
      if (requestedGroup && wanted()) void prepare(requestedGroup)
    }
  }
  function move({ from, to, dt, elapsed }) {
    if (!wanted() || getContext()?.state !== 'running') { resetDistance(); return }
    if (!Number.isFinite(dt) || dt <= 0 || elapsed > .15) { reset(); return }
    const delta = Math.hypot(to.x - from.x, to.z - from.z)
    if (!Number.isFinite(delta) || delta < .00001) { resetDistance(); return }
    // 手选覆盖整个行走范围；自动模式才消费真实地面，不修改地面或调度器。
    const group = FOOTSTEP_PRESETS[preset] ?? resolveSurface(to), settings = FOOTSTEP_GROUPS[group]
    if (!settings) { resetDistance(); return }
    if (!settings.samples.every(key => cache.has(key))) {
      resetDistance()
      if (!loading || requestedGroup !== group) { notify('loading', '正在准备脚步…'); void prepare(group) }
      return
    }
    distance += delta
    if (distance < threshold) return
    // A1慢走/加速按真实速度形成约.78/.96米步长；两材质共用，声音不整体慢放。
    distance %= threshold
    threshold = .78 + Math.max(0, Math.min(1, (delta / dt - WALK_SPEED) / (WALK_RUN_SPEED - WALK_SPEED))) * .18
    if (sources.size >= FOOTSTEP_LIMITS.sources) return
    const choices = settings.samples.filter(key => key !== previous)
    const unit = () => Math.max(0, Math.min(.999999, random()))
    const key = choices[Math.floor(unit() * choices.length)]
    let source, gain, voice
    try {
      const ctx = getContext()
      source = ctx.createBufferSource(); gain = ctx.createGain()
      source.buffer = cache.get(key); source.playbackRate.value = .97 + unit() * .06
      gain.gain.value = settings.gain * (.96 + unit() * .08)
      source.connect(gain); gain.connect(output())
      voice = { source, gain }; sources.add(voice); source.onended = () => release(voice)
      source.start(); previous = key
    } catch (error) {
      if (voice) release(voice, true)
      else { source?.disconnect(); gain?.disconnect() }
      fail(error)
    }
  }
  return {
    get: snapshot, move, reset, hasSources: () => sources.size > 0,
    settled: () => loading || Promise.resolve(),
    setAvailable(value, text = '随总声音开启') {
      if (disposed || available === value) return
      available = value
      if (!available) { invalidate(); if (!enabled || !volume) preferenceStatus(); else notify('off', text) }
      else if (failed) notify('error', '脚步未能播放；可点击继续播放重试脚步', true)
      else if (!enabled) notify('off', '脚步已单独关闭')
      else if (!volume) notify('muted', '脚步音量为 0')
      else notify('ready', '实际走动时发声')
    },
    setEnabled(value) { if (disposed) return; enabled = value === true; failed = false; invalidate(); preferenceStatus() },
    setPreset(value) {
      if (disposed || typeof value !== 'string' || !Object.hasOwn(FOOTSTEP_PRESETS, value) || preset === value) return
      preset = value; invalidate()
      // 切换只清旧积步/短源/异步；不启声、不重试错误、不恢复上下文。
      if (failed) onChange(); else preferenceStatus()
    },
    setVolume(value) { if (disposed || !Number.isFinite(value)) return; volume = Math.max(0, Math.min(100, value)); if (!volume) invalidate(false); if (!failed) preferenceStatus() },
    retry() { if (!disposed) { failed = false; invalidate(); preferenceStatus() } },
    dispose() { if (disposed) return; disposed = true; invalidate(); cache.clear() },
  }
}

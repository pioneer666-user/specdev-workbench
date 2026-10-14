import { AMBIENCE_BASE, AMBIENCE_PRESETS, AMBIENCE_LOOP, defaultAmbience } from './ambience-presets.js'
import { createRoomFootsteps } from './footsteps.js'
import { createFootstepSurface } from './footstep-surfaces.js'
import { AMBIENCE_GAINS, createSoundMix } from './sound-mix.js'
import { createRainAudio } from './rain-audio.js'
import { rainBackground } from './rain-presets.js'

export const AMBIENCE_LIMITS = Object.freeze({ contexts: 1, cachedBuffers: 2, decoding: 1, sources: 2 })
const FADE = 1.5, QUIET = .12

/** 原生 Web Audio。静音没有调度循环；缓存最多两轨，加载/解码串行，旧异步不能复活播放。 */
export function createRoomAmbience({ style, period, template, footstepsOptions = {}, rainOptions = {}, load = async (key, signal) => {
  const response = await fetch(`${AMBIENCE_BASE}${key}.mp3`, { signal })
  if (!response.ok) throw new Error('声音文件未能加载')
  return response.arrayBuffer()
}, createContext = () => {
  const Constructor = globalThis.AudioContext || globalThis.webkitAudioContext
  if (!Constructor) throw new Error('当前环境不支持声音播放')
  return new Constructor({ sampleRate: 48000 })
}, later = (fn, ms) => setTimeout(fn, ms), cancelLater = id => clearTimeout(id), onChange = () => {} }) {
  if (!['day', 'night'].includes(period)) throw new TypeError('声音昼夜必须来自场景状态')
  let enabled = false, preset = defaultAmbience(style), volume = 50, masterVolume = 100, active = true, disposed = false
  let context = null, mix = null, revision = 0, loading = null, abort = null, settleTimer = null, resuming = 0
  let resumePending = null, rejectResume = null, suspendPending = null
  let status = 'off', message = '声音已关闭', retry = false
  let interrupted = false
  let closing = null
  const rain = createRainAudio({ ...rainOptions, context: () => context, output: () => mix.rain, onChange: () => {
    syncDuck(); onChange(snapshot())
    if (!wantedContext()) suspendContext()
  } })
  const footsteps = template ? createRoomFootsteps({ ...footstepsOptions, context: () => context, output: () => mix.footsteps, resolveSurface: createFootstepSurface(template), onChange: () => {
    onChange(snapshot())
    if (!wantedContext()) suspendContext()
  } }) : null
  const cache = new Map(), tracks = new Set(), timers = new Set()
  const wanted = () => !disposed && enabled && active && volume > 0 && preset !== 'none'
  const wantsSteps = () => footsteps?.get().enabled && footsteps.get().volume > 0 && footsteps.get().status !== 'error'
  const wantedContext = () => !disposed && enabled && active && !interrupted && (rain.wantsPlayback() || wantsSteps() || footsteps?.hasSources() || (wanted() && status !== 'error' && status !== 'blocked'))
  const syncSteps = () => footsteps?.setAvailable(!disposed && enabled && active && !interrupted && context?.state === 'running', !enabled ? '随总声音开启' : !active ? '房间在后台，脚步已暂停' : '声音已暂停，请点击继续播放')
  const syncDuck = () => mix?.setRainDuck(rain.get().playing ? rainBackground(rain.get().rain) : 1)
  const syncRain = () => { rain.setAvailable(!disposed && enabled && active && !interrupted && context?.state === 'running'); syncDuck() }
  const target = () => AMBIENCE_PRESETS[preset][period]
  const snapshot = () => ({ enabled, preset, volume, masterVolume, period, active, status, message, retry: retry || !!footsteps?.get().retry || rain.get().retry, footsteps: footsteps?.get() ?? null, rain: rain.get() })
  const notify = (state, text, again = false) => {
    if (disposed) return
    status = state; message = text; retry = again; onChange(snapshot())
  }
  const schedule = (fn, seconds) => {
    const id = later(() => { timers.delete(id); fn() }, seconds * 1000)
    timers.add(id); return id
  }
  function suspendContext() {
    if (!context || context.state === 'suspended' || context.state === 'closed' || suspendPending) return
    try { suspendPending = Promise.resolve(context.suspend()).catch(() => {}).finally(() => { suspendPending = null }) } catch {}
  }
  function stop(track) {
    if (!tracks.delete(track)) return
    if (track.timer !== null) { cancelLater(track.timer); timers.delete(track.timer) }
    try { track.source.stop() } catch {}
    track.source.disconnect(); track.gain.disconnect()
  }
  function level(track, now) {
    const e = track.envelope
    return e.duration ? e.from + (e.to - e.from) * Math.max(0, Math.min(1, (now - e.start) / e.duration)) : e.to
  }
  function ramp(track, to, seconds) {
    const now = context.currentTime, from = level(track, now), param = track.gain.gain
    const base = AMBIENCE_GAINS[track.key]
    param.cancelScheduledValues(now); param.setValueAtTime(from * base, now); param.linearRampToValueAtTime(to * base, now + seconds)
    track.envelope = { from, to, start: now, duration: seconds }
  }
  function clearTimers() {
    for (const id of timers) cancelLater(id)
    timers.clear(); settleTimer = null
    for (const track of tracks) track.timer = null
  }
  function quiet(immediate = false) {
    clearTimers()
    if (!context) return
    for (const track of [...tracks]) {
      if (immediate) stop(track)
      else { ramp(track, 0, QUIET); track.timer = schedule(() => stop(track), QUIET) }
    }
    const current = revision
    const suspend = () => {
      if (disposed || current !== revision || wantedContext()) return
      suspendContext()
    }
    if (immediate || !tracks.size) suspend(); else schedule(suspend, QUIET)
  }
  function invalidate() {
    revision++; abort?.abort(); abort = null
    if (settleTimer !== null) { cancelLater(settleTimer); timers.delete(settleTimer); settleTimer = null }
    return revision
  }
  function mutedStatus() {
    if (!enabled) notify('off', '声音已关闭')
    else if (!active) notify('paused', '房间在后台，声音已暂停')
    else if (!volume) notify('muted', '音量为 0，环境声静音')
    else notify('silent', '无背景声 · 不播放环境声')
  }
  async function resume() {
    // 在开启/重试事件的同步部分创建并调用 resume，保留浏览器的用户激活。
    if (!context) {
      context = createContext(); mix = createSoundMix(context, { volume, footstepsVolume: footsteps?.get().volume ?? 50, rainVolume: rain.get().volume, masterVolume })
      context.onstatechange = () => {
        if (!disposed && context.state === 'running' && !wantedContext()) {
          suspendContext(); return
        }
        // 首次加载/解码时也可能被设备中断，不能只检查已经存在的播放源。
        // 自己的resume尚在处理时由其结果决定；外部中断则停止旧源并留明确的手动入口。
        if (!disposed && enabled && active && !resuming && context.state !== 'running' && (status === 'loading' || status === 'playing' || wantsSteps() || rain.wantsPlayback())) {
          interrupted = true; syncSteps(); syncRain()
          clearTimers(); for (const track of [...tracks]) stop(track)
          notify('blocked', '声音已暂停，请点击继续播放', true)
        }
      }
    }
    if (context.state === 'closed') throw new Error('声音播放已不可用')
    if (context.state === 'running' && !suspendPending) return
    if (resumePending) return resumePending
    // 两通道与快速改选只共享一次在途恢复。超时属于恢复，不被环境转场清定时器误取消。
    resuming++
    let timeout
    const deadline = new Promise((_, reject) => {
      rejectResume = reject
      timeout = later(() => reject(new Error('浏览器暂停了声音，请点击继续播放')), 1500)
    })
    resumePending = (async () => {
      try {
        await Promise.race([Promise.all([suspendPending, context.resume()]), deadline])
        if (context.state !== 'running') throw new Error('浏览器暂停了声音，请点击继续播放')
      } finally { resuming--; cancelLater(timeout); rejectResume = null; resumePending = null }
    })()
    return resumePending
  }
  async function buffer(key, current) {
    // 无法取消 decodeAudioData；下一目标等待这一份收尾，而不并行分配解码内存。
    if (loading) { try { await loading } catch {} }
    if (disposed || current !== revision || !wanted()) return null
    if (cache.has(key)) { const value = cache.get(key); cache.delete(key); cache.set(key, value); return value }
    const controller = new AbortController(); abort = controller
    const operation = (async () => {
      const bytes = await load(key, controller.signal)
      if (disposed || current !== revision || !wanted()) return null
      const decoded = await context.decodeAudioData(bytes)
      if (disposed || current !== revision || !wanted()) return null
      if (decoded.numberOfChannels !== 2 || Math.abs(decoded.duration - AMBIENCE_LOOP.duration) > .05) throw new Error('声音资源格式不符，请重试')
      while (cache.size >= AMBIENCE_LIMITS.cachedBuffers) cache.delete(cache.keys().next().value)
      cache.set(key, decoded); return decoded
    })()
    loading = operation
    try { return await operation } finally { if (loading === operation) loading = null; if (abort === controller) abort = null }
  }
  function start(key, decoded, current) {
    if (disposed || current !== revision || !wanted()) return
    if (context.state !== 'running') { notify('blocked', '声音已暂停，请点击继续播放', true); return }
    clearTimers()
    const existing = [...tracks]
    // 快速改目标不排队。已有两轨转场时，先用120ms收拢，再只启动最后目标；不会叠出第三轨。
    if (existing.length === 2) {
      for (const track of existing) ramp(track, 0, QUIET)
      settleTimer = schedule(() => { for (const track of [...tracks]) stop(track); settleTimer = null; start(key, decoded, current) }, QUIET)
      return
    }
    const source = context.createBufferSource(), gain = context.createGain()
    source.buffer = decoded; source.loop = true; source.loopStart = AMBIENCE_LOOP.start; source.loopEnd = AMBIENCE_LOOP.end
    gain.gain.value = 0; source.connect(gain); gain.connect(mix.ambience)
    const track = { key, source, gain, timer: null, envelope: { from: 0, to: 0, start: context.currentTime, duration: 0 } }
    tracks.add(track); source.start(0, AMBIENCE_LOOP.start)
    for (const old of existing) { ramp(old, 0, FADE); old.timer = schedule(() => stop(old), FADE) }
    ramp(track, 1, FADE)
    notify('playing', `${AMBIENCE_PRESETS[preset].label} · ${period === 'day' ? '白天' : '夜晚'} · 播放中`)
  }
  function request(manual = false) {
    const current = invalidate()
    if (manual) interrupted = false
    syncSteps(); syncRain()
    if (!enabled || !active || (!wanted() && !wantsSteps() && !rain.wantsPlayback())) { quiet(!active); mutedStatus(); return Promise.resolve() }
    if (interrupted) { notify('blocked', '声音已暂停，请点击继续播放', true); return Promise.resolve() }
    if (!wanted()) {
      quiet(); mutedStatus()
      return (async () => {
        try {
          await resume()
          if (disposed || current !== revision) { if (!disposed && !wantedContext()) quiet(true); return }
          syncSteps(); syncRain()
        } catch (error) {
          if (disposed || current !== revision) return
          interrupted = true; syncSteps(); syncRain(); quiet(true)
          notify('blocked', `${error.message || '声音未能启用'}；点击继续播放可重试`, true)
        }
      })()
    }
    const key = target()
    const existing = [...tracks].find(track => track.key === key)
    // 同轨不重启，也不会把待停止的旧轨错当当前轨。
    if (existing && tracks.size === 1 && existing.envelope.to === 1 && context.state === 'running') {
      notify('playing', `${AMBIENCE_PRESETS[preset].label} · ${period === 'day' ? '白天' : '夜晚'} · 播放中`); return Promise.resolve()
    }
    notify('loading', '正在准备环境声…')
    return (async () => {
      try {
        await resume()
        if (disposed || current !== revision || !wanted()) { if (!disposed && !wantedContext()) quiet(true); return }
        syncSteps(); syncRain()
        const decoded = await buffer(key, current)
        if (decoded) start(key, decoded, current)
      } catch (error) {
        if (disposed || current !== revision || !wanted()) return
        notify('error', `${error.message || '环境声未能播放'}；点击继续播放可重试`, true)
        if (context?.state !== 'running') { interrupted = true; syncSteps(); syncRain() }
        quiet(true)
      }
    })()
  }
  function updateFootsteps(manual = false) {
    // 脚步偏好不失效环境加载、不清理转场或重启循环曲目。
    if (manual && interrupted && enabled && active && wantsSteps()) return request(true)
    syncSteps(); syncRain()
    if (!enabled || !active || !wantsSteps() || interrupted) return Promise.resolve()
    return (async () => {
      try {
        await resume()
        if (disposed) return
        syncSteps(); syncRain()
        if (!wantedContext()) suspendContext()
      } catch (error) {
        if (disposed || !enabled || !active || !wantsSteps()) return
        interrupted = true; syncSteps(); syncRain(); quiet(true)
        notify('blocked', `${error.message || '声音未能启用'}；点击继续播放可重试`, true)
      }
    })()
  }
  function updateRain(manual = false) {
    if (manual && interrupted && enabled && active && rain.wantsPlayback()) return request(true)
    syncRain()
    if (!enabled || !active || !rain.wantsPlayback() || interrupted) { if (!wantedContext()) suspendContext(); return Promise.resolve() }
    return (async () => {
      try { await resume(); if (!disposed) { syncSteps(); syncRain(); if (!wantedContext()) suspendContext() } }
      catch (error) {
        if (disposed || !enabled || !active || !rain.wantsPlayback()) return
        interrupted = true; syncSteps(); syncRain(); quiet(true)
        notify('blocked', `${error.message || '声音未能启用'}；点击继续播放可重试`, true)
      }
    })()
  }
  return {
    get: snapshot,
    setEnabled(value) { if (disposed) return; enabled = value === true; return request(true) },
    setPreset(value) { if (disposed || !Object.hasOwn(AMBIENCE_PRESETS, value)) return; preset = value; return request() },
    setPeriod(value) { if (disposed || !['day', 'night'].includes(value) || period === value) return; period = value; return request() },
    setVolume(value) {
      if (disposed || !Number.isFinite(value)) return
      const previous = volume; volume = Math.max(0, Math.min(100, value))
      mix?.setVolume(volume)
      if (!volume || !previous) return request()
      onChange(snapshot())
    },
    setMasterVolume(value) {
      if (disposed || !Number.isFinite(value)) return
      masterVolume = Math.max(0, Math.min(100, value)); mix?.setMasterVolume(masterVolume)
      // 总量0只是输出静音，不恢复通道、不调用resume，也不改分类偏好。
      onChange(snapshot())
    },
    setActive(value) { if (disposed || active === value) return; active = value; return request() },
    setFootstepsEnabled(value) { if (disposed) return; footsteps?.setEnabled(value); return updateFootsteps(value === true) },
    setFootstepsPreset(value) { if (!disposed) footsteps?.setPreset(value) },
    setFootstepsVolume(value) { if (disposed) return; footsteps?.setVolume(value); mix?.setFootstepsVolume(footsteps?.get().volume ?? 50); return updateFootsteps() },
    setRain(value) { if (disposed) return; rain.setRain(value); return updateRain() },
    setRainEnabled(value) { if (disposed) return; rain.setEnabled(value); return updateRain(value===true) },
    setRainVolume(value) { if (disposed || !Number.isFinite(value)) return; rain.setVolume(value); mix?.setRainVolume(rain.get().volume); return updateRain() },
    settleRain: () => rain.settled(),
    move(value) { if (!disposed) { try { footsteps?.move(value) } catch {} } },
    resetSteps() { footsteps?.reset() },
    retry() {
      if (disposed || !enabled) return
      const onlyFootsteps = footsteps?.get().retry && !retry && !interrupted
      const onlyRain = rain.get().retry && !retry && !footsteps?.get().retry && !interrupted
      footsteps?.retry()
      rain.retry()
      return onlyRain ? updateRain() : onlyFootsteps ? updateFootsteps() : request(true)
    },
    dispose() {
      if (closing) return closing
      disposed = true; invalidate(); clearTimers()
      rejectResume?.(new Error('声音已释放'))
      footsteps?.dispose()
      for (const track of [...tracks]) stop(track)
      cache.clear(); mix?.dispose()
      const waits = [loading, resumePending, rain.dispose(), footsteps?.settled()]
      if (context) { context.onstatechange = null; waits.push(Promise.resolve(context.close())) }
      closing = Promise.allSettled(waits).then(()=>{})
      return closing
    },
  }
}

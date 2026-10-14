import { RAIN_TRACKS, RAIN_LIMITS, rainLevels, rainResource } from './rain-presets.js'
import { rainValue } from './weather-layout.js'

// 只借用T42上下文与分类输出。两轨串行解码，一份在途；雨量改变只更新最后目标。
export function createRainAudio({ context: getContext, output, load = async (key, signal) => {
  const response = await globalThis.fetch(rainResource(key), { signal })
  if (!response.ok) throw new Error('雨声文件未能加载')
  return response.arrayBuffer()
}, onChange = () => {} }) {
  let enabled = true, volume = 30, rain = 0, available = false, disposed = false, failed = false, revision = 0, loading = null, abort = null, closing = null
  let status = 'off', message = '随雨量与总声音开启'
  const cache = new Map(), sources = []
  const wanted = () => !disposed && available && enabled && volume > 0 && rain > 0 && !failed
  const notify = (next, text) => { if (!disposed) { status = next; message = text; onChange() } }
  function stop() {
    for (const { source, gain } of sources.splice(0)) { try { source.stop() } catch {} source.disconnect(); gain.disconnect() }
  }
  function invalidate() { revision++; abort?.abort(); abort = null; stop() }
  function apply() {
    const ctx = getContext(), values = rainLevels(rain)
    if (!ctx || sources.length !== 2) return
    const now = ctx.currentTime // 两轨严格共用同一AudioParam坡道时刻。
    for (let i=0;i<2;i++) {
      const p = sources[i].gain.gain, e = sources[i].envelope
      const from = e.from+(e.to-e.from)*Math.max(0,Math.min(1,(now-e.start)/.1))
      p.cancelScheduledValues(now); p.setValueAtTime(from,now); p.linearRampToValueAtTime(values[i],now+.1)
      sources[i].envelope = { from, to:values[i], start:now }
    }
  }
  function preference() { notify(!enabled ? 'off' : !volume ? 'muted' : !rain ? 'dry' : !available ? 'paused' : failed ? 'error' : 'loading',
    !enabled ? '雨声已单独关闭' : !volume ? '雨声音量为 0' : !rain ? '晴天不播放雨声' : !available ? '随总声音开启；后台暂停' : failed ? '雨声加载失败，可点击继续播放重试' : '正在准备雨声…') }
  function start() {
    const ctx = getContext()
    if (!wanted() || ctx?.state !== 'running' || !RAIN_TRACKS.every(key=>cache.has(key))) return
    if (!sources.length) {
      try {
        for (const key of RAIN_TRACKS) {
          const source = ctx.createBufferSource(), gain = ctx.createGain()
          sources.push({ source, gain, envelope:{from:0,to:0,start:ctx.currentTime} })
          source.buffer = cache.get(key); source.loop = true; gain.gain.value = 0
          source.connect(gain); gain.connect(output()); source.start()
        }
      } catch (error) { stop(); throw error }
    }
    apply(); notify('playing','雨声播放中 · 随雨量平滑变化')
  }
  function request() {
    if (!wanted()) return
    if (sources.length) { apply(); onChange(); return }
    if (loading) return // 快调雨量不追加Promise/请求；在途收尾再取当前目标。
    const current = revision, controller = new AbortController(), ctx = getContext()
    if (!ctx || ctx.state !== 'running') return
    abort = controller; notify('loading','正在准备雨声…')
    const operation = (async () => {
      for (const key of RAIN_TRACKS) {
        if (cache.has(key)) continue
        const bytes = await load(key,controller.signal)
        if (!wanted() || current !== revision) return
        const decoded = await ctx.decodeAudioData(bytes)
        if (!wanted() || current !== revision) return
        if (decoded.numberOfChannels !== 2 || !Number.isFinite(decoded.duration) || Math.abs(decoded.duration-RAIN_LIMITS.duration)>.05) throw new Error('雨声资源格式不符')
        cache.set(key,decoded)
      }
      if (wanted() && current === revision) start()
    })()
    loading = operation
    void operation.catch(error => {
      if (!wanted() || current !== revision) return
      failed = true; stop(); notify('error',`${error.message || '雨声未能播放'}；可点击继续播放重试雨声`)
    }).finally(() => {
      if (loading === operation) loading = null
      if (abort === controller) abort = null
      if (wanted() && !sources.length) request()
    })
  }
  function sync() { if (!wanted()) { invalidate(); preference() } else request() }
  return {
    get: () => ({ enabled,volume,rain,status,message,retry:failed,playing:sources.length===2&&wanted(),sources:sources.length,cachedBuffers:cache.size,decoding:loading?1:0,
      decodedBytes:[...cache.values()].reduce((n,b)=>n+(b.length||Math.round(b.duration*b.sampleRate))*b.numberOfChannels*4,0) }),
    wantsPlayback: () => !disposed && enabled && volume>0 && rain>0 && !failed,
    setRain(value) { if (disposed) return; rain=rainValue(value); sync(); onChange() },
    setVolume(value) { if (disposed || !Number.isFinite(value)) return; volume=Math.max(0,Math.min(100,value)); sync(); onChange() },
    setEnabled(value) { if (disposed) return; enabled=value===true; sync(); onChange() },
    setAvailable(value) { if (disposed) return; if (available===value) { if (value) request(); return } available=value===true; sync() },
    retry() { if (disposed) return; failed=false; sync() },
    settled: () => loading || Promise.resolve(),
    dispose() {
      if (closing) return closing
      disposed=true; invalidate(); cache.clear()
      closing=Promise.resolve(loading).catch(()=>{}).then(()=>{cache.clear()})
      return closing
    },
  }
}

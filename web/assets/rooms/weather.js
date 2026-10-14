import { rainValue, weatherLayout, WEATHER_TRANSITION_MS } from './weather-layout.js'
import { createWeatherEffect } from './weather-effect.js'

// 复用房间帧循环；首次晴天不创建GPU对象。创建/释放同步，不存在迟到动态模块复活路径。
export function createRoomWeather({ scene, renderer, template, groundColor, createEffect = createWeatherEffect }) {
  const layout = weatherLayout(template)
  let target = 0, shown = 0, from = 0, elapsed = WEATHER_TRANSITION_MS, clock = null, time = 0, active = true, disposed = false, effect = null, created = 0, released = 0
  function release() { if (effect) { effect.dispose(); effect = null; released++ } }
  return {
    set(value) {
      if (disposed) return false
      const next = rainValue(value)
      if (target === next) return true
      if (next > 0 && !effect) { effect = createEffect({ scene, renderer, layout, groundColor }); created++ }
      from = shown; target = next; elapsed = 0
      if (!next) { effect?.stopDrops(); if (!active) { shown = 0; elapsed = WEATHER_TRANSITION_MS; release() } }
      return true
    },
    setActive(value) { if (disposed) return; active = value === true; clock = null; if (!active && !target) { shown=0;release() } if (effect) effect.group.visible = active },
    update(now, camera, night) {
      if (disposed || !active || !effect) return
      const dt = clock === null ? 0 : Math.max(0,now-clock); clock = now; time += Math.min(80,dt)/1000
      elapsed = Math.min(WEATHER_TRANSITION_MS,elapsed+dt)
      const t = elapsed/WEATHER_TRANSITION_MS, ease = t*t*(3-2*t)
      shown = from+(target-from)*ease
      if (target === 0 && elapsed === WEATHER_TRANSITION_MS) { shown = 0; release(); clock = null; return }
      effect.group.visible = true; effect.update(time, target ? shown : 0, shown/100, night, camera)
    },
    get() { return { value: target, rendered: effect && target ? shown : 0, active, created, released, live: effect ? effect.stats() : { rain:0,splashes:0,knownGeometryBytes:0,reflection:null,resources:0 }, layout } },
    dispose() { if (disposed) return; disposed = true; target = shown = 0; clock = null; release() },
  }
}

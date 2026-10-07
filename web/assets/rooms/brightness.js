// 亮度档位不是物理光强。所有曲线从绝对档位求值，往返拖动不会累计乘法漂移。
export const NIGHT_ENTER = 35
export const DAY_ENTER = 45
export const TRANSITION_MS = 280

export function normalizeBrightness(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError('亮度必须是有限数值')
  return Math.max(0, Math.min(100, value))
}

export function brightnessPeriod(value, previous) {
  const v = normalizeBrightness(value)
  if (v <= NIGHT_ENTER) return 'night'
  if (v >= DAY_ENTER) return 'day'
  return previous === 'night' ? 'night' : 'day'
}

const mix = (a, b, t) => a + (b - a) * t
// 每种房间分别校准舒适范围；底座内部窗灯、暖灯、玻璃与粒子也消费这份参数。
export function sampleBrightness(style, value, nightMix = 0) {
  const v = normalizeBrightness(value) / 100
  if (!['ceramic', 'fairy'].includes(style)) throw new TypeError('未知亮度风格')
  if (!Number.isFinite(nightMix)) throw new TypeError('昼夜混合必须有限')
  const n = Math.max(0, Math.min(1, nightMix))
  const fairy = style === 'fairy'
  const t = v * v * (3 - 2 * v)
  return {
    value: v * 100, nightMix: n,
    hemi: mix(fairy ? .72 : .65, fairy ? 1.55 : 1.75, t),
    key: mix(fairy ? 1.05 : .85, fairy ? 2.8 : 2.55, t),
    fill: mix(.45, fairy ? 1.05 : .95, t), bounce: mix(.22, .48, t),
    environment: mix(fairy ? .18 : .22, fairy ? .42 : .58, t),
    exposure: mix(fairy ? .88 : .78, fairy ? 1.02 : .92, t),
    windowFill: mix(3, 14, t), porcelainEnv: mix(.24, .62, t),
    fairyEmissive: mix(.65, 1, t), fairyLamp: n * mix(1, .6, t),
    // 持续混合天空，不在阈值处切换一整套颜色。
    skyNight: n,
  }
}

/** 用已有场景帧推进。新目标从当前呈现值追随，不排队；隐藏/缓存往返重置时钟。 */
export function createBrightnessTransition({ style, initial = 100, reducedMotion = false, apply }) {
  let value = normalizeBrightness(initial), period = brightnessPeriod(value)
  let shown = value, night = period === 'night' ? 1 : 0
  let from = shown, fromNight = night, elapsed = TRANSITION_MS, clock = null, disposed = false
  const paint = () => apply(sampleBrightness(style, shown, night))
  paint()
  function set(next, immediate = false) {
    if (disposed) return false
    const v = normalizeBrightness(next)
    const p = brightnessPeriod(v, period)
    if (value === v && period === p && !immediate) return true
    value = v; period = p
    from = shown; fromNight = night; elapsed = 0
    if (immediate || reducedMotion) {
      shown = value; night = period === 'night' ? 1 : 0; elapsed = TRANSITION_MS
      paint()
    }
    return true
  }
  return {
    set,
    get: () => ({ value, period }),
    update(now) {
      if (disposed || !Number.isFinite(now)) return
      const dt = clock === null ? 0 : Math.max(0, now - clock)
      clock = now
      if (elapsed >= TRANSITION_MS) return
      elapsed = Math.min(TRANSITION_MS, elapsed + dt)
      const t = elapsed / TRANSITION_MS, ease = t * t * (3 - 2 * t)
      shown = mix(from, value, ease); night = mix(fromNight, period === 'night' ? 1 : 0, ease)
      paint()
    },
    resetClock() { clock = null },
    dispose() { disposed = true; clock = null },
  }
}

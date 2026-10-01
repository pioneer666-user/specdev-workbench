// 建筑外观预设（纯数据＋纯函数，不引 Three.js，Node 可直接 import 测试）。
//
// 这一轮的外观参数全部集中在渲染器配置里，不进蓝图（蓝图只收 style 两个取值、拒绝未知字段）。
// 两套预设由模型已有的 style 值驱动：'warm-modern' 与 'chinese-timber'，不新增 style 取值。
// 两套共享同一套"微缩建筑模型"语言——同一块模型底座、同一种倒角尺度、同一套灯光结构、
// 同一种门牌版式——只在材质、细部与色温上分开，读起来是同一产品的两种饰面。
//
// 颜色的产品含义（由数据给出，渲染器不改写）：
//   · 构件底色一律取 part.color（数据已按 style 给了调色板），贴图只做明度上的细微调制；
//   · 房间地面色 = space.accent（按 accentStrength 与饰面底色轻度调和，色相保持可辨）；
//   · 墙的状态色 #e4b84e（已实现未完成）/ #a1c9d0（未实现）走独立的"状态材质"，
//     两套预设共用，不被饰面盖掉——"还没建"不能画得像"建好了"。

/** 蓝图契约允许的 style 取值（不在这里发明新值）。 */
export const STYLE_VALUES = Object.freeze(['warm-modern', 'chinese-timber'])

/** 数据里带产品含义的颜色（与服务端 presentBuilding 同口径；小写 #rrggbb）。 */
export const MEANINGFUL_COLORS = Object.freeze({
  statusInProgress: '#e4b84e',
  statusNotBuilt: '#a1c9d0',
  brick: '#938777',
  timber: '#a08060',
})

/**
 * 按颜色判定一块构件的"材质角色"。数据目前没有显式的状态字段，只能按颜色精确匹配——
 * 这是本轮最脆弱的一处，已在文档"输入契约建议"里提出加 part.finish / part.status。
 */
export function colorRole(color) {
  const hex = normalizeHex(color)
  if (hex === MEANINGFUL_COLORS.statusInProgress) return 'status-in-progress'
  if (hex === MEANINGFUL_COLORS.statusNotBuilt) return 'status-not-built'
  if (hex === MEANINGFUL_COLORS.brick) return 'brick'
  if (hex === MEANINGFUL_COLORS.timber) return 'timber'
  return 'palette'
}

export function normalizeHex(color) {
  const text = String(color || '').trim().toLowerCase()
  if (/^#[0-9a-f]{6}$/.test(text)) return text
  if (/^#[0-9a-f]{3}$/.test(text)) return `#${text[1]}${text[1]}${text[2]}${text[2]}${text[3]}${text[3]}`
  return '#b3bea8'
}

/** sRGB 空间里的线性插值（t=0 取 a，t=1 取 b）。 */
export function mixHex(a, b, t) {
  const pa = parseHex(a)
  const pb = parseHex(b)
  const out = pa.map((value, i) => Math.round(value + (pb[i] - value) * t))
  return `#${out.map((value) => value.toString(16).padStart(2, '0')).join('')}`
}

/** 明度缩放（factor<1 变暗，>1 变亮，按通道夹取）。 */
export function shadeHex(color, factor) {
  const out = parseHex(color).map((value) => Math.max(0, Math.min(255, Math.round(value * factor))))
  return `#${out.map((value) => value.toString(16).padStart(2, '0')).join('')}`
}

function parseHex(color) {
  const hex = normalizeHex(color)
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
}

// ── 两套预设共用的部分 ─────────────────────────────────────────────
// 尺寸单位一律为米；"倍数"类参数按建筑包络 span 缩放。
const SHARED = {
  // 倒角：只倒"整块"构件的边（整面墙、整块楼板、整根柱），不给墙的碎段各自倒角。
  edge: { wall: 0.02, slab: 0.025, member: 0.012, trim: 0.008, segments: 1 },
  // 模型底座：整栋楼放在一块两层的展示板上（微缩模型的"桌面感"来自这里）。
  base: { margin: 3.2, radius: 0.9, thickness: 0.3, underLayer: 0.1, underInset: 0.12 },
  // 状态材质（两套共用，不随饰面变化）：斜纹＝在建，蓝图格＝未实现。
  status: {
    inProgress: { stripe: '#c9982f', stripeWidth: 0.14, roughness: 0.8 },
    notBuilt: { line: '#6f98a1', grid: 0.5, roughness: 0.9 },
  },
  // 设计框架（design 等阶段的 frame/plan-floor）：制图格＋描边，保持"未建成"的读感。
  plan: { grid: 0.5, line: '#6c7d72', edgeOpacity: 0.55 },
  // fill：总览时底座外包在画面里占的比例（NDC，1 = 贴边）。
  camera: { orbitFov: 38, overviewDirection: [0.78, 0.66, 1.0], fill: 0.86 },
  shadow: { mapSize: 2048, radius: 2, walkHalfSize: 12, bias: -0.0005, normalBias: 0.025 },
  // 门牌：同一版式，两套只换配色。
  signLayout: { width: 1.9, projectWidth: 2.7, backingDepth: 0.05, backingPad: 0.07 },
}

// ── warm-modern：暖调现代——石灰白墙、浅色水磨石、直立锁边金属屋面、细木窗框 ────────
const WARM_MODERN = {
  id: 'warm-modern',
  label: '暖调现代',
  light: {
    sun: '#fff0da', sunIntensity: 2.6, sunElevation: 47, sunAzimuth: 322,
    hemiSky: '#eef2f2', hemiGround: '#cdbfab', hemiIntensity: 1.25,
    envIntensity: 0.32, exposure: 1.02,
  },
  sky: { top: '#d9e4e6', horizon: '#f3eee4', fogNear: 2.4, fogFar: 7.5 },
  ground: { color: '#ebe5da', grid: 1, gridColor: '#d9d1c3', aoStrength: 0.34, side: '#cfc5b5', under: '#6b675f' },
  plinth: { height: 0.24, outset: 0.07, color: '#d4ccbf', texture: 'concrete', topBand: null },
  wall: {
    texture: 'plaster', roughness: 0.93, bumpScale: 0.35, revealShade: 0.9,
    base: { height: 0.12, outset: 0.012, color: '#8f8a80', texture: 'concrete' },
  },
  frame: { texture: 'oak', roughness: 0.72, exposePosts: false, postOutset: 0, beamOutset: 0, beamDrop: 0, columnBase: null },
  opening: { sill: { height: 0.05, projection: 0.06, overhang: 0.08, color: '#d9d2c6' }, threshold: '#b9b0a2', mullion: { width: 0.05 }, lattice: null },
  glass: { tint: null, roughness: 0.06, envBoost: 1.6 },
  roof: {
    finish: 'seam', seamSpacing: 0.42, tileRoughness: 0.55, tileMetalness: 0.18, tileLayer: 0.05,
    soffit: '#ebe4d8', soffitTexture: 'plaster',
    fascia: { height: 0.2, depth: 0.05, shade: 0.82, texture: 'concrete' },
    barge: { height: 0.18, depth: 0.045, shade: 0.82 },
    ridge: { kind: 'cap', width: 0.18, height: 0.06, shade: 0.78, endBlock: null },
    eaveExtend: 0,
  },
  floor: {
    room: 'terrazzo', circulation: 'stone', yard: 'paving',
    accentStrength: 0.78, finishBase: '#e8e0d2', roughness: 0.82, slabEdge: '#dcd4c7',
  },
  band: { shade: 0.9, texture: 'concrete' },
  stair: { stringer: { height: 0.28, depth: 0.05, offset: 0.03 } },
  sign: {
    board: '#f8f5ee', ink: '#24302b', accent: '#4a7466', rule: '#d8d2c6', muted: '#5f6a63',
    backing: '#5e5a52', emissive: 0.22,
  },
}

// ── chinese-timber：中式木构——石台基、青砖裙墙、外露朱褐木柱与额枋、青瓦屋面、方格窗棂 ──
const CHINESE_TIMBER = {
  id: 'chinese-timber',
  label: '中式木构',
  light: {
    sun: '#ffe8c8', sunIntensity: 2.5, sunElevation: 40, sunAzimuth: 312,
    hemiSky: '#e9ece6', hemiGround: '#bcae96', hemiIntensity: 1.2,
    envIntensity: 0.26, exposure: 1.0,
  },
  sky: { top: '#d7ddd6', horizon: '#f1ebdf', fogNear: 2.4, fogFar: 7.5 },
  ground: { color: '#e6e0d3', grid: 0, gridColor: '#d6cebf', aoStrength: 0.38, side: '#c7bca9', under: '#5f594f' },
  plinth: { height: 0.45, outset: 0.12, color: '#b9b4aa', texture: 'ashlar', topBand: { height: 0.07, outset: 0.03, color: '#a9a397' } },
  wall: {
    texture: 'plaster', roughness: 0.95, bumpScale: 0.4, revealShade: 0.9,
    base: { height: 0.72, outset: 0.02, color: '#8e8c86', texture: 'brick' },
  },
  frame: { texture: 'lacquer', roughness: 0.6, exposePosts: true, postOutset: 0.04, beamOutset: 0.03, beamDrop: 0.12, columnBase: { size: 1.55, height: 0.14, color: '#aaa59b' } },
  opening: { sill: { height: 0.06, projection: 0.05, overhang: 0.06, color: '#9b978f' }, threshold: '#9f9a90', mullion: null, lattice: { bar: 0.035, spacing: 0.2 } },
  glass: { tint: '#e9dfc8', roughness: 0.35, envBoost: 0.6 },
  roof: {
    finish: 'tile', seamSpacing: 0.24, tileRoughness: 0.86, tileMetalness: 0, tileLayer: 0.07,
    soffit: '#8a6a52', soffitTexture: 'boards',
    fascia: { height: 0.22, depth: 0.06, shade: 0.72, texture: 'wood' },
    barge: { height: 0.26, depth: 0.06, shade: 0.7 },
    ridge: { kind: 'ridge', width: 0.26, height: 0.26, shade: 0.7, endBlock: { length: 0.32, height: 0.2 } },
    eaveExtend: 0.32,
  },
  floor: {
    room: 'square-brick', circulation: 'square-brick', yard: 'brick-paving',
    accentStrength: 0.68, finishBase: '#cfc8bb', roughness: 0.9, slabEdge: '#b3ada2',
  },
  band: { shade: 0.86, texture: 'wood' },
  stair: { stringer: { height: 0.3, depth: 0.06, offset: 0.03 } },
  sign: {
    board: '#3a2c24', ink: '#f1e6cf', accent: '#c8a764', rule: '#8d6f45', muted: '#c9b99a',
    backing: '#2a1f1a', emissive: 0.35,
  },
}

export const PRESETS = Object.freeze({ 'warm-modern': WARM_MODERN, 'chinese-timber': CHINESE_TIMBER })

/**
 * 取外观：style 决定预设；未知 style（蓝图不会给，但模型来自外部时要兜底）回落到
 * warm-modern 并标 fallback，调用方可以提示，不发明新预设。overrides 深合并（原型调试用）。
 */
export function resolveLook(style, overrides = null) {
  const known = STYLE_VALUES.includes(style)
  const preset = PRESETS[known ? style : 'warm-modern']
  const look = deepMerge(deepMerge({}, SHARED), preset)
  look.fallback = !known
  look.requestedStyle = style ?? null
  return overrides ? deepMerge(look, overrides) : look
}

function deepMerge(target, source) {
  for (const [key, value] of Object.entries(source || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      target[key] = deepMerge(target[key] && typeof target[key] === 'object' ? { ...target[key] } : {}, value)
    } else target[key] = Array.isArray(value) ? [...value] : value
  }
  return target
}

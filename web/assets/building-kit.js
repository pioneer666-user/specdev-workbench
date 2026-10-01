// 外观构件工具箱：把 building-plan.js 的规划与 present.parts 变成 Three.js 网格。
//
// 设计取舍（详见文档）：
//   · 连续感来自"世界坐标贴图"：所有构件的 UV 按世界坐标（米）投影，
//     同一种材质在相邻构件之间纹理连续，不会一段一段地重新起头；
//   · 倒角只倒整块构件（ExtrudeGeometry 的 1 段斜角），整面墙一次倒角，洞口得到斜面窗口；
//   · 贴图全部在运行时用 canvas 程序化生成（确定性随机种子），离线可用，不引入任何图片资源；
//   · 细节贴图只做"明度调制"，底色一律来自数据颜色——换 style 或换状态色，颜色含义不丢。
// 所有 GPU 资源都经 own() 登记，由场景在换建筑、销毁时逐项 dispose。
import * as THREE from 'three'
import { colorRole, mixHex, shadeHex, normalizeHex } from './building-look.js'

// ── 确定性随机与可平铺噪声 ─────────────────────────────────────────

function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 可平铺值噪声：u, v ∈ [0,1) 周期，gx×gy 个格点。 */
function tileNoise(rand, gx, gy = gx) {
  const grid = new Float32Array(gx * gy)
  for (let i = 0; i < grid.length; i += 1) grid[i] = rand()
  const at = (i, j) => grid[((j % gy + gy) % gy) * gx + ((i % gx + gx) % gx)]
  const smooth = (t) => t * t * (3 - 2 * t)
  return (u, v) => {
    const x = u * gx
    const y = v * gy
    const i = Math.floor(x)
    const j = Math.floor(y)
    const fx = smooth(x - i)
    const fy = smooth(y - j)
    const a = at(i, j) + (at(i + 1, j) - at(i, j)) * fx
    const b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * fx
    return a + (b - a) * fy
  }
}

function fbm(rand, gx, gy = gx, octaves = 4) {
  const layers = []
  for (let o = 0; o < octaves; o += 1) layers.push(tileNoise(rand, gx * 2 ** o, gy * 2 ** o))
  return (u, v) => {
    let sum = 0
    let norm = 0
    let amp = 1
    for (const layer of layers) {
      sum += layer(u, v) * amp
      norm += amp
      amp *= 0.5
    }
    return sum / norm
  }
}

const clamp01 = (value) => Math.max(0, Math.min(1, value))
const frac = (value) => value - Math.floor(value)

/** 逐像素画一张灰度图：fn(u, v) 返回 [明度, 高度]，高度用作凹凸贴图。 */
function paintGray(width, height, fn) {
  const color = document.createElement('canvas')
  const bump = document.createElement('canvas')
  color.width = bump.width = width
  color.height = bump.height = height
  const cctx = color.getContext('2d')
  const bctx = bump.getContext('2d')
  const cimg = cctx.createImageData(width, height)
  const bimg = bctx.createImageData(width, height)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [lum, h] = fn((x + 0.5) / width, (y + 0.5) / height)
      const i = (y * width + x) * 4
      const l = Math.round(clamp01(lum) * 255)
      const b = Math.round(clamp01(h ?? lum) * 255)
      cimg.data[i] = cimg.data[i + 1] = cimg.data[i + 2] = l
      cimg.data[i + 3] = 255
      bimg.data[i] = bimg.data[i + 1] = bimg.data[i + 2] = b
      bimg.data[i + 3] = 255
    }
  }
  cctx.putImageData(cimg, 0, 0)
  bctx.putImageData(bimg, 0, 0)
  return { color, bump }
}

/**
 * 砌体/铺地通用图案：cols×rows 块，隔行错缝 offset，灰缝宽 grout（占块尺寸比例）。
 * 每块有自己的明度偏移，块边略暗（像微缩模型里刻出来的缝）。
 */
function masonry(rand, { cols, rows, offset = 0.5, grout = 0.03, tone = 0.06, noise = 0.05, groutLum = 0.62, base = 0.93, size = 512 }) {
  const tones = []
  for (let i = 0; i < cols * rows * 2; i += 1) tones.push((rand() - 0.5) * 2 * tone)
  const n = fbm(rand, 6, 6, 3)
  return paintGray(size, size, (u, v) => {
    const row = Math.floor(v * rows)
    const shift = (row % 2) * offset / cols
    const cu = frac(u + shift) * cols
    const col = Math.floor(cu)
    const fu = cu - col
    const fv = v * rows - row
    const gu = grout * rows / cols
    const edge = Math.min(fu, 1 - fu) / gu
    const edgeV = Math.min(fv, 1 - fv) / grout
    const k = Math.min(edge, edgeV)
    const nv = n(u, v) - 0.5
    if (k < 1) return [groutLum + nv * 0.05, 0.25]
    const bevel = k < 2 ? 0.92 + 0.08 * (k - 1) : 1
    const lum = (base + tones[(row * cols + col) % tones.length] + nv * noise * 2) * bevel
    return [lum, 0.75 + nv * 0.3]
  })
}

// ── 贴图工厂（每栋建筑一份，随建筑一起销毁）───────────────────────

/**
 * 纹理登记：每种纹理只画一次 canvas；不同平铺尺寸/旋转用 clone（共享图像源）。
 * 返回 { map, bump }，UV 以米为单位，repeat = 1 / 平铺尺寸。
 */
// 画好的 canvas 在模块级缓存（只占 CPU 内存，确定性种子保证每次一样）：换建筑时只重新上传
// GPU 纹理，不重画像素。GPU 纹理仍随建筑登记、随建筑销毁。
const PAINTED = new Map()
export const paintTimings = {}

function createTextures(own, maxAnisotropy) {
  const cache = new Map()

  function source(name, painter) {
    if (!PAINTED.has(name)) {
      const start = globalThis.performance?.now?.() ?? 0
      PAINTED.set(name, painter(mulberry32(hash(name))))
      paintTimings[name] = Math.round((globalThis.performance?.now?.() ?? 0) - start)
    }
    return PAINTED.get(name)
  }

  function make(canvas, colorSpace, tileU, tileV, rotation) {
    const texture = own(new THREE.CanvasTexture(canvas))
    texture.colorSpace = colorSpace
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping
    texture.repeat.set(1 / tileU, 1 / tileV)
    texture.anisotropy = maxAnisotropy
    if (rotation) {
      texture.center.set(0.5, 0.5)
      texture.rotation = rotation
    }
    return texture
  }

  /** name：图案名；tile：[米, 米]；rotation：弧度（竖向木纹等）。 */
  function get(name, tile, rotation = 0) {
    const key = `${name}|${tile.join('x')}|${rotation}`
    if (cache.has(key)) return cache.get(key)
    const painter = PAINTERS[name]
    if (!painter) throw new Error(`未知纹理：${name}`)
    const canvas = source(name, painter)
    const set = {
      map: make(canvas.color, THREE.SRGBColorSpace, tile[0], tile[1], rotation),
      bump: canvas.bump ? make(canvas.bump, THREE.NoColorSpace, tile[0], tile[1], rotation) : null,
    }
    cache.set(key, set)
    return set
  }

  return { get }
}

function hash(text) {
  let h = 2166136261
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

const PAINTERS = {
  plaster: (rand) => {
    const n = fbm(rand, 4, 4, 5)
    const fine = tileNoise(rand, 96, 96)
    return paintGray(256, 256, (u, v) => {
      const a = n(u, v)
      return [0.93 + (a - 0.5) * 0.07 + (fine(u, v) - 0.5) * 0.025, a * 0.8 + fine(u, v) * 0.2]
    })
  },
  concrete: (rand) => {
    const n = fbm(rand, 8, 8, 4)
    const pores = tileNoise(rand, 140, 140)
    return paintGray(256, 256, (u, v) => {
      const pore = pores(u, v) > 0.93 ? -0.08 : 0
      return [0.92 + (n(u, v) - 0.5) * 0.1 + pore, n(u, v) + pore * 2]
    })
  },
  // 木纹沿 u 方向延伸（纹线平行于 u）；竖向构件用旋转 90° 的克隆。
  wood: (rand) => {
    const warp = fbm(rand, 2, 12, 3)
    const n = fbm(rand, 4, 24, 3)
    return paintGray(256, 256, (u, v) => {
      const ring = 0.5 + 0.5 * Math.sin((v * 22 + warp(u, v) * 5) * Math.PI * 2)
      return [0.8 + ring * 0.12 + (n(u, v) - 0.5) * 0.08, 0.5 + ring * 0.3]
    })
  },
  lacquer: (rand) => {
    const warp = fbm(rand, 2, 12, 3)
    const n = fbm(rand, 6, 6, 3)
    return paintGray(256, 256, (u, v) => {
      const ring = 0.5 + 0.5 * Math.sin((v * 18 + warp(u, v) * 4) * Math.PI * 2)
      return [0.93 + ring * 0.05 + (n(u, v) - 0.5) * 0.04, 0.5 + ring * 0.1]
    })
  },
  // 望板：顺坡的木板（板缝平行于 v），平铺 1m 含 5 块。
  boards: (rand) => {
    const warp = fbm(rand, 12, 2, 3)
    const tones = Array.from({ length: 5 }, () => (rand() - 0.5) * 0.1)
    return paintGray(256, 256, (u, v) => {
      const board = Math.floor(u * 5)
      const fu = u * 5 - board
      if (fu < 0.03 || fu > 0.97) return [0.6, 0.2]
      const ring = 0.5 + 0.5 * Math.sin((u * 60 + warp(u, v) * 5) * Math.PI * 2)
      return [0.84 + tones[board] + ring * 0.08, 0.6]
    })
  },
  // 青瓦：4 条筒瓦垄（沿 v 顺坡），4 道瓦搭接线。凹凸图给出圆垄的起伏。
  tile: (rand) => {
    const n = fbm(rand, 8, 8, 3)
    const tones = Array.from({ length: 16 }, () => (rand() - 0.5) * 0.08)
    return paintGray(512, 512, (u, v) => {
      const col = Math.floor(u * 4)
      const fu = u * 4 - col
      const row = Math.floor(v * 4)
      const fv = v * 4 - row
      const tone = tones[(row * 4 + col) % 16] + (n(u, v) - 0.5) * 0.06
      const d = (fu - 0.5) / 0.17
      if (Math.abs(d) < 1) {
        const h = Math.sqrt(1 - d * d)
        const lit = 0.72 + 0.3 * h - 0.1 * Math.max(0, d)
        const lap = fv > 0.88 ? 0.86 : 1
        return [(lit + tone) * lap, 0.55 + 0.45 * h]
      }
      const g = Math.abs(fu - 0.5)
      const trough = 0.8 - (g - 0.17) * 0.35
      const lap = fv > 0.9 ? 0.72 : fv > 0.84 ? 0.85 : 1
      return [(trough + tone) * lap, 0.25 + (fv > 0.9 ? -0.1 : 0)]
    })
  },
  // 直立锁边：一张图 2 道锁边（u 周期），面板带极轻的"油罐效应"明暗。
  seam: (rand) => {
    const n = fbm(rand, 4, 8, 3)
    return paintGray(256, 256, (u, v) => {
      const fu = frac(u * 2)
      if (fu < 0.035) return [1.02, 1]
      if (fu < 0.07) return [0.74, 0.35]
      const wave = 0.5 + 0.5 * Math.cos((fu - 0.5) * Math.PI * 2)
      return [0.9 + wave * 0.04 + (n(u, v) - 0.5) * 0.03, 0.45]
    })
  },
  terrazzo: (rand) => {
    const n = fbm(rand, 6, 6, 4)
    const size = 512
    const lum = new Float32Array(size * size).fill(1)
    const cover = new Float32Array(size * size)
    for (let i = 0; i < 2600; i += 1) {
      const cu = rand() * size
      const cv = rand() * size
      const radius = 0.8 + rand() ** 3 * 5
      const tone = 0.7 + rand() * 0.34
      const reach = Math.ceil(radius + 1)
      for (let dy = -reach; dy <= reach; dy += 1) {
        for (let dx = -reach; dx <= reach; dx += 1) {
          const alpha = clamp01(radius - Math.hypot(dx, dy) + 0.5)
          if (alpha <= 0) continue
          const x = ((Math.floor(cu) + dx) % size + size) % size
          const y = ((Math.floor(cv) + dy) % size + size) % size
          const k = y * size + x
          lum[k] = lum[k] * (1 - alpha) + tone * alpha
          cover[k] = Math.max(cover[k], alpha)
        }
      }
    }
    return paintGray(size, size, (u, v) => {
      const k = Math.min(size - 1, Math.floor(v * size)) * size + Math.min(size - 1, Math.floor(u * size))
      const base = 0.93 + (n(u, v) - 0.5) * 0.05
      return [base * lum[k], 0.5 + cover[k] * 0.08]
    })
  },
  'square-brick': (rand) => masonry(rand, { cols: 4, rows: 4, offset: 0, grout: 0.022, tone: 0.045, groutLum: 0.66 }),
  stone: (rand) => masonry(rand, { cols: 2, rows: 2, offset: 0.5, grout: 0.012, tone: 0.035, groutLum: 0.72, base: 0.95 }),
  paving: (rand) => masonry(rand, { cols: 2, rows: 4, offset: 0.5, grout: 0.02, tone: 0.05, groutLum: 0.7 }),
  'brick-paving': (rand) => masonry(rand, { cols: 4, rows: 4, offset: 0.5, grout: 0.05, tone: 0.06, groutLum: 0.66 }),
  ashlar: (rand) => masonry(rand, { cols: 2, rows: 2, offset: 0.5, grout: 0.035, tone: 0.05, groutLum: 0.68, noise: 0.08 }),
  brick: (rand) => masonry(rand, { cols: 4, rows: 4, offset: 0.5, grout: 0.13, tone: 0.07, groutLum: 0.74 }),
  // 状态：斜纹（在建）与蓝图格（未实现）。只调明度，底色仍是数据给的状态色。
  hatch: () => paintGray(128, 128, (u, v) => [frac((u + v) * 2) < 0.5 ? 1 : 0.8, 0.5]),
  blueprint: () => paintGray(256, 256, (u, v) => {
    const major = Math.min(frac(u * 2), 1 - frac(u * 2), frac(v * 2), 1 - frac(v * 2)) < 0.008
    const minor = Math.min(frac(u * 10), 1 - frac(u * 10), frac(v * 10), 1 - frac(v * 10)) < 0.025
    return [major ? 0.7 : minor ? 0.9 : 1, 0.5]
  }),
  plan: () => paintGray(256, 256, (u, v) => {
    const major = Math.min(frac(u * 2), 1 - frac(u * 2), frac(v * 2), 1 - frac(v * 2)) < 0.01
    const minor = Math.min(frac(u * 10), 1 - frac(u * 10), frac(v * 10), 1 - frac(v * 10)) < 0.03
    return [major ? 0.62 : minor ? 0.86 : 1, 0.5]
  }),
}

/** 窗棂：透明底上的方格木条（alphaTest 用），一格一张，UV 按窗洞等分。 */
function latticeCanvas(barRatio) {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const context = canvas.getContext('2d')
  context.clearRect(0, 0, size, size)
  context.fillStyle = '#ffffff'
  const bar = Math.max(2, Math.round(size * barRatio / 2))
  context.fillRect(0, 0, size, bar)
  context.fillRect(0, size - bar, size, bar)
  context.fillRect(0, 0, bar, size)
  context.fillRect(size - bar, 0, bar, size)
  return canvas
}

// ── 几何工具 ───────────────────────────────────────────────────

/**
 * 倒角方盒：ExtrudeGeometry（1 段斜角＝倒棱）。盖面（组 0）是上下两面，其余（组 1）是侧面与斜角，
 * 楼板与台基据此给顶面和侧边不同材质。r 过小直接退回 BoxGeometry（并补齐同样的分组）。
 */
export function chamferBox(sx, sy, sz, r, segments = 1) {
  const radius = Math.min(r, sx * 0.45, sy * 0.45, sz * 0.45)
  if (radius < 0.002) {
    const geometry = new THREE.BoxGeometry(sx, sy, sz)
    geometry.clearGroups()
    // BoxGeometry 面序：+x −x +y −y +z −z，每面 6 个索引。
    for (let face = 0; face < 6; face += 1) geometry.addGroup(face * 6, 6, face === 2 || face === 3 ? 0 : 1)
    return geometry
  }
  const shape = new THREE.Shape()
  const hx = sx / 2 - radius
  const hz = sz / 2 - radius
  shape.moveTo(-hx, -hz)
  shape.lineTo(hx, -hz)
  shape.lineTo(hx, hz)
  shape.lineTo(-hx, hz)
  shape.closePath()
  const depth = sy - radius * 2
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth, steps: 1, curveSegments: 1,
    bevelEnabled: true, bevelThickness: radius, bevelSize: radius, bevelSegments: segments,
  })
  geometry.translate(0, 0, -depth / 2)
  geometry.rotateX(-Math.PI / 2)
  return geometry
}

/** 按法线主方向把世界坐标（米）投成 UV：水平面取 (x, z)，立面取 (x 或 z, y)。 */
export function projectUV(geometry) {
  const position = geometry.attributes.position
  const normal = geometry.attributes.normal
  const uv = new Float32Array(position.count * 2)
  for (let i = 0; i < position.count; i += 1) {
    const nx = Math.abs(normal.getX(i))
    const ny = Math.abs(normal.getY(i))
    const nz = Math.abs(normal.getZ(i))
    const x = position.getX(i)
    const y = position.getY(i)
    const z = position.getZ(i)
    if (ny >= nx && ny >= nz) {
      uv[i * 2] = x
      uv[i * 2 + 1] = z
    } else if (nx >= nz) {
      uv[i * 2] = z
      uv[i * 2 + 1] = y
    } else {
      uv[i * 2] = x
      uv[i * 2 + 1] = y
    }
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  return geometry
}

/** 直角多边形向内偏移 r（ExtrudeGeometry 的倒角会再向外长 r，最终外形回到原尺寸）。 */
function offsetPolygon(points, r) {
  let area = 0
  for (let i = 0; i < points.length; i += 1) {
    const [x0, y0] = points[i]
    const [x1, y1] = points[(i + 1) % points.length]
    area += x0 * y1 - x1 * y0
  }
  const sign = area > 0 ? 1 : -1
  const count = points.length
  const normals = points.map((point, i) => {
    const next = points[(i + 1) % count]
    const dx = next[0] - point[0]
    const dy = next[1] - point[1]
    const length = Math.hypot(dx, dy) || 1
    return [(-dy / length) * sign, (dx / length) * sign]
  })
  return points.map((point, i) => {
    const a = normals[(i - 1 + count) % count]
    const b = normals[i]
    if (a[0] * b[0] + a[1] * b[1] > 0.99) return [point[0] + b[0] * r, point[1] + b[1] * r]
    return [point[0] + (a[0] + b[0]) * r, point[1] + (a[1] + b[1]) * r]
  })
}

/**
 * 一面墙（或山墙）的实体：墙面内的轮廓（u, y）→ 挤出为墙厚 → 放到世界坐标。
 * axis='x'：u 就是世界 x，墙厚沿 z；axis='z'：u 是世界 z，墙厚沿 x。
 */
function wallSolid(outline, holes, axis, at, thickness, r) {
  const flip = axis === 'z' ? -1 : 1
  const toShape = (points) => points.map(([u, y]) => new THREE.Vector2(u * flip, y))
  const shape = new THREE.Shape(toShape(offsetPolygon(outline, r)))
  for (const hole of holes) {
    const grown = [[hole.u0 - r, hole.y0 - r], [hole.u1 + r, hole.y0 - r], [hole.u1 + r, hole.y1 + r], [hole.u0 - r, hole.y1 + r]]
    shape.holes.push(new THREE.Path(toShape(grown)))
  }
  const depth = Math.max(0.001, thickness - r * 2)
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth, steps: 1, curveSegments: 1,
    bevelEnabled: r > 0.001, bevelThickness: r, bevelSize: r, bevelSegments: 1,
  })
  geometry.translate(0, 0, -depth / 2)
  if (axis === 'z') {
    geometry.rotateY(Math.PI / 2)
    geometry.translate(at, 0, 0)
  } else geometry.translate(0, 0, at)
  return projectUV(geometry)
}

/** 墙的外轮廓：外包矩形沿底边挖出门的缺口，逆时针。 */
function wallOutline(wall) {
  const u0 = wall.u0 - wall.extendLo
  const u1 = wall.u1 + wall.extendHi
  const points = [[u0, wall.y0]]
  for (const notch of wall.notches) {
    points.push([notch.u0, wall.y0], [notch.u0, notch.y1], [notch.u1, notch.y1], [notch.u1, wall.y0])
  }
  points.push([u1, wall.y0], [u1, wall.y1], [u0, wall.y1])
  return points
}

// ── 构件工厂 ───────────────────────────────────────────────────

/**
 * 为一栋建筑创建工具箱。own(resource) 负责登记资源；返回 build(plan, model, present) → Object3D[]。
 * 每个顶层对象的 userData 带 kind / spaceIds / lowY / opacity / cutAs，剖看与拾取都只读这些。
 */
export function createKit({ look, own, maxAnisotropy = 4 }) {
  const textures = createTextures(own, maxAnisotropy)
  const materials = new Map()
  const edge = look.edge

  function material(key, factory) {
    if (!materials.has(key)) materials.set(key, own(factory()))
    return materials.get(key)
  }

  function standard(color, opacity, { texture = null, tile = [1, 1], rotation = 0, roughness = 0.9, metalness = 0, bumpScale = 0.5, extra = {} } = {}) {
    const key = `std|${normalizeHex(color)}|${opacity}|${texture}|${tile}|${rotation}|${roughness}|${metalness}|${bumpScale}|${JSON.stringify(extra)}`
    return material(key, () => {
      const set = texture ? textures.get(texture, tile, rotation) : null
      return new THREE.MeshStandardMaterial({
        color: normalizeHex(color),
        map: set?.map ?? null,
        bumpMap: set?.bump ?? null,
        bumpScale: set?.bump ? bumpScale : 1,
        roughness,
        metalness,
        opacity,
        transparent: opacity < 1,
        depthWrite: opacity >= 0.6,
        // 阴影图写正面（默认写背面）：墙与墙相接处的受光点离背面只有几毫米，写背面会漏出一条亮缝；
        // 写正面后遮挡深度落在墙的另一侧，缝就没了，代价是受光面需要 normalBias 防自阴影。
        shadowSide: THREE.FrontSide,
        ...extra,
      })
    })
  }

  /** 按颜色角色选材质：状态色走状态材质（两套共用），其余按饰面。 */
  function surfaceMaterial(color, opacity, { finish = 'plaster', tile = [2, 2], roughness = 0.92, bumpScale = 0.6 } = {}) {
    const role = colorRole(color)
    if (role === 'status-in-progress') return standard(color, opacity, { texture: 'hatch', tile: [0.7, 0.7], roughness: look.status.inProgress.roughness, bumpScale: 0 })
    if (role === 'status-not-built') return standard(color, opacity, { texture: 'blueprint', tile: [1, 1], roughness: look.status.notBuilt.roughness, bumpScale: 0 })
    if (role === 'brick') return standard(color, opacity, { texture: 'brick', tile: [0.96, 0.24], roughness: 0.9, bumpScale: 1 })
    if (role === 'timber') return standard(color, opacity, { texture: 'boards', tile: [1, 1], rotation: Math.PI / 2, roughness: 0.8, bumpScale: 0.6 })
    return standard(color, opacity, { texture: finish, tile, roughness, bumpScale })
  }

  const isStatus = (color) => colorRole(color).startsWith('status')

  function woodMaterial(color, opacity, vertical) {
    const texture = look.frame.texture === 'lacquer' ? 'lacquer' : 'wood'
    return standard(color, opacity, { texture, tile: [1.2, 1.2], rotation: vertical ? Math.PI / 2 : 0, roughness: look.frame.roughness, bumpScale: 0.3 })
  }

  function mesh(geometry, mat, { cast = true, receive = true } = {}) {
    const object = new THREE.Mesh(own(geometry), mat)
    object.castShadow = cast && (Array.isArray(mat) ? mat[0] : mat).opacity > 0.7
    object.receiveShadow = receive
    return object
  }

  function tag(object, { kind, spaceIds = [], lowY = 0, opacity = 1, cutAs = null, environment = false }) {
    object.userData = { ...object.userData, kind, spaceIds, lowY, opacity, cutAs, environment }
    return object
  }

  /** 轴对齐（或带旋转）的方盒构件：位置、尺寸、旋转都照搬数据。 */
  function boxAt(size, position, rotation, r) {
    const geometry = chamferBox(size.x, size.y, size.z, r)
    if (rotation) geometry.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rotation.x || 0, rotation.y || 0, rotation.z || 0)))
    geometry.translate(position.x, position.y, position.z)
    return projectUV(geometry)
  }

  const partLowY = (part) => part.position.y - part.size.y / 2

  // ── 墙 ──
  function buildWall(wall) {
    const opacity = wall.opacity
    const face = surfaceMaterial(wall.color, opacity, { finish: look.wall.texture, tile: [2, 2], roughness: look.wall.roughness, bumpScale: look.wall.bumpScale })
    const reveal = isStatus(wall.color) ? face : surfaceMaterial(shadeHex(wall.color, look.wall.revealShade), opacity, { finish: look.wall.texture, tile: [2, 2], roughness: look.wall.roughness, bumpScale: look.wall.bumpScale })
    const group = new THREE.Group()
    group.add(mesh(wallSolid(wallOutline(wall), wall.holes, wall.axis, wall.at, wall.thickness, edge.wall), [face, reveal]))
    // 墙裙（踢脚／青砖裙墙）：只给有饰面的墙，状态墙不加——"未完成"不配完工细部。
    const base = look.wall.base
    if (base && !isStatus(wall.color) && opacity >= 1) {
      const lowestHole = Math.min(...wall.holes.map((hole) => hole.y0), Infinity)
      const height = Math.min(base.height, lowestHole - wall.y0 - 0.06)
      if (height > 0.04) {
        const u0 = wall.u0 - wall.extendLo
        const u1 = wall.u1 + wall.extendHi
        const spans = []
        let cursor = u0
        for (const notch of wall.notches) {
          spans.push([cursor, notch.u0])
          cursor = notch.u1
        }
        spans.push([cursor, u1])
        const baseMat = standard(base.color, 1, { texture: base.texture, tile: base.texture === 'brick' ? [0.96, 0.24] : [1.2, 1.2], roughness: 0.9, bumpScale: 0.8 })
        for (const [a, b] of spans) {
          if (b - a < 0.02) continue
          const depth = wall.thickness + base.outset * 2
          const size = wall.axis === 'x' ? { x: b - a, y: height, z: depth } : { x: depth, y: height, z: b - a }
          const center = wall.axis === 'x'
            ? { x: (a + b) / 2, y: wall.y0 + height / 2, z: wall.at }
            : { x: wall.at, y: wall.y0 + height / 2, z: (a + b) / 2 }
          group.add(mesh(boxAt(size, center, null, edge.trim), baseMat))
        }
      }
    }
    return tag(group, { kind: 'wall', spaceIds: wall.spaceIds, lowY: wall.y0, opacity })
  }

  function buildLooseWall(part) {
    const mat = surfaceMaterial(part.color, part.opacity ?? 1, { finish: look.wall.texture, tile: [2, 2], roughness: look.wall.roughness, bumpScale: look.wall.bumpScale })
    return tag(mesh(boxAt(part.size, part.position, part.rotation, edge.trim), mat), { kind: 'wall', spaceIds: part.spaceIds || [], lowY: partLowY(part), opacity: part.opacity ?? 1 })
  }

  function buildGable(gable) {
    const face = surfaceMaterial(gable.color, gable.opacity, { finish: look.wall.texture, tile: [2, 2], roughness: look.wall.roughness, bumpScale: look.wall.bumpScale })
    const reveal = isStatus(gable.color) ? face : surfaceMaterial(shadeHex(gable.color, look.wall.revealShade), gable.opacity, { finish: look.wall.texture, tile: [2, 2] })
    const object = mesh(wallSolid(gable.polygon, [], gable.axis, gable.at, gable.thickness, 0), [face, reveal])
    return tag(object, { kind: 'wall', spaceIds: gable.spaceIds, lowY: gable.lowY, opacity: gable.opacity, cutAs: 'roof' })
  }

  // ── 屋顶 ──
  function roofEndsShared(roof, roofs) {
    // 两个屋顶在山墙端头相接（院落里常见）：那一端不装博风板和脊端，免得互相戳穿。
    const shared = { lo: false, hi: false }
    if (!roof.slopeAxis) return shared
    for (const other of roofs) {
      if (other === roof || other.slopeAxis !== roof.slopeAxis || !other.ridgeRange) continue
      const overlap = Math.min(roof.slopeRange[1], other.slopeRange[1]) - Math.max(roof.slopeRange[0], other.slopeRange[0])
      if (overlap < 0.3) continue
      if (Math.abs(other.ridgeRange[1] - roof.ridgeRange[0]) < 0.02) shared.lo = true
      if (Math.abs(other.ridgeRange[0] - roof.ridgeRange[1]) < 0.02) shared.hi = true
    }
    return shared
  }

  function buildRoof(roof, roofs) {
    const group = new THREE.Group()
    const status = isStatus(roof.color)
    const opacity = roof.opacity
    const spec = look.roof
    const tileMat = status
      ? surfaceMaterial(roof.color, opacity)
      : standard(roof.color, opacity, {
        texture: spec.finish, tile: spec.finish === 'tile' ? [0.96, 1.2] : [spec.seamSpacing * 2, 2],
        roughness: spec.tileRoughness, metalness: spec.tileMetalness, bumpScale: spec.finish === 'tile' ? 2.2 : 0.8,
      })
    const soffitMat = status ? tileMat : standard(spec.soffit, opacity, { texture: spec.soffitTexture, tile: [1, 1], roughness: 0.85, bumpScale: 0.4 })
    const trimColor = (shade) => shadeHex(roof.color, shade)
    const shared = roofEndsShared(roof, roofs)
    const ridgeAxisIndex = roof.slopeAxis === 'x' ? 2 : 0

    for (const { part, frame } of roof.slabs) {
      // 规范坐标：X 沿屋脊、Y 沿坡面法线、Z 沿上坡。保证右手系后得到一次刚体变换。
      let ridge = new THREE.Vector3(...frame.ridgeDir)
      const up = new THREE.Vector3(...frame.normal)
      const dir = new THREE.Vector3(...frame.dir)
      if (new THREE.Vector3().crossVectors(ridge, up).dot(dir) < 0) ridge = ridge.negate()
      const basis = new THREE.Matrix4().makeBasis(ridge, up, dir)
      basis.setPosition(frame.center[0], frame.center[1], frame.center[2])
      const place = (geometry, localUV = true) => {
        if (localUV) projectUV(geometry)
        geometry.applyMatrix4(basis)
        if (!localUV) projectUV(geometry)
        return geometry
      }
      const extend = frame.slope ? roof.eaveExtend : 0
      const L = frame.L + extend
      const zMid = -extend / 2
      const th = frame.th
      const tileLayer = status ? th : Math.min(spec.tileLayer, th * 0.6)
      // 以山墙那一端是否与别的屋顶相接，决定两端各放不放博风板（规范坐标 ±X 端对应世界里的低/高端）。
      const endShared = (sign) => (sign * ridge.getComponent(ridgeAxisIndex) < 0 ? shared.lo : shared.hi)
      // 瓦面层（略伸出下层，形成檐口的层次）
      const tileGeometry = chamferBox(frame.W + (status ? 0 : 0.04), tileLayer, L + (status ? 0 : 0.05), edge.member)
      tileGeometry.translate(0, th / 2 - tileLayer / 2, zMid - (status ? 0 : 0.025))
      group.add(mesh(place(tileGeometry), tileMat))
      if (!status) {
        // 望板／檐底层
        const sheath = chamferBox(frame.W, th - tileLayer, L, edge.member)
        sheath.translate(0, -tileLayer / 2, zMid)
        group.add(mesh(place(sheath), soffitMat))
        // 檐口封檐板
        const fascia = chamferBox(frame.W + 0.02, spec.fascia.height, spec.fascia.depth, edge.trim)
        fascia.translate(0, th / 2 - spec.fascia.height / 2 + 0.01, -frame.L / 2 - extend - 0.03 - spec.fascia.depth / 2)
        group.add(mesh(place(fascia, false), standard(trimColor(spec.fascia.shade), opacity, { texture: spec.fascia.texture, tile: [1.2, 1.2], roughness: 0.8, bumpScale: 0.2 })))
        // 博风板（山墙端的斜边）
        const bargeMat = standard(trimColor(spec.barge.shade), opacity, { texture: spec.fascia.texture, tile: [1.2, 1.2], roughness: 0.8, bumpScale: 0.2 })
        for (const sign of [-1, 1]) {
          if (endShared(sign)) continue
          const barge = chamferBox(spec.barge.depth, spec.barge.height, L + 0.08, edge.trim)
          barge.translate(sign * (frame.W / 2 + 0.02 + spec.barge.depth / 2), th / 2 - spec.barge.height / 2 + 0.03, zMid - 0.03)
          group.add(mesh(place(barge, false), bargeMat))
        }
      }
    }

    if (roof.kind === 'gable' && roof.ridge && !status) {
      const ridgeSpec = spec.ridge
      const ridgeMat = standard(trimColor(ridgeSpec.shade), opacity, { texture: ridgeSpec.kind === 'ridge' ? 'brick' : 'concrete', tile: [0.96, 0.24], roughness: 0.85, bumpScale: 0.5 })
      const dir = new THREE.Vector3(...roof.ridge.dir).normalize()
      const center = new THREE.Vector3(...roof.ridge.center)
      const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir)
      const put = (geometry, offsetAlong, y) => {
        geometry.applyQuaternion(quaternion)
        const position = center.clone().addScaledVector(dir, offsetAlong)
        geometry.translate(position.x, y, position.z)
        return projectUV(geometry)
      }
      const length = roof.ridge.length + 0.06
      const bottom = roof.ridge.topY - (ridgeSpec.kind === 'ridge' ? 0.1 : 0.02)
      group.add(mesh(put(chamferBox(length, ridgeSpec.height, ridgeSpec.width, edge.member), 0, bottom + ridgeSpec.height / 2), ridgeMat))
      if (ridgeSpec.endBlock) {
        for (const sign of [-1, 1]) {
          if (sign * dir.getComponent(ridgeAxisIndex) < 0 ? shared.lo : shared.hi) continue
          const block = chamferBox(ridgeSpec.endBlock.length, ridgeSpec.height + ridgeSpec.endBlock.height, ridgeSpec.width * 0.9, edge.member)
          const along = sign * (length / 2 - ridgeSpec.endBlock.length / 2)
          group.add(mesh(put(block, along, bottom + (ridgeSpec.height + ridgeSpec.endBlock.height) / 2), ridgeMat))
        }
      }
    }
    const lowY = Math.min(...roof.slabs.map(({ part }) => partLowY(part)))
    return tag(group, { kind: 'roof', spaceIds: roof.spaceIds, lowY, opacity })
  }

  // ── 楼板、台基、地面 ──
  function floorFinish(part, model) {
    const space = model.spaces.find((item) => item.id === part.spaceIds?.[0])
    const kind = space?.kind === 'room' ? 'room' : space?.kind === 'yard' ? 'yard' : 'circulation'
    const name = look.floor[kind]
    const tiles = { terrazzo: [1.4, 1.4], stone: [1.8, 1.2], paving: [2.4, 1.6], 'square-brick': [2.4, 2.4], 'brick-paving': [1.2, 0.6] }
    return { texture: name, tile: tiles[name] || [2, 2] }
  }

  function buildFloor(part, model) {
    const opacity = part.opacity ?? 1
    const finish = floorFinish(part, model)
    const status = isStatus(part.color)
    // 地面色 = 数据色（房间是 space.accent）与饰面底色按 accentStrength 调和：色相仍可辨认。
    const tint = status ? part.color : mixHex(look.floor.finishBase, part.color, look.floor.accentStrength)
    const top = status ? surfaceMaterial(part.color, opacity) : standard(tint, opacity, { texture: finish.texture, tile: finish.tile, roughness: look.floor.roughness, bumpScale: 0.5 })
    const side = status ? top : standard(look.floor.slabEdge, opacity, { texture: 'concrete', tile: [1.2, 1.2], roughness: 0.9, bumpScale: 0.3 })
    const object = mesh(boxAt(part.size, part.position, part.rotation, edge.slab), [top, side])
    object.castShadow = false
    return tag(object, { kind: part.kind, spaceIds: part.spaceIds || [], lowY: partLowY(part), opacity })
  }

  function buildPlanFloor(part) {
    const opacity = part.opacity ?? 1
    const mat = standard(part.color, opacity, { texture: 'plan', tile: [1, 1], roughness: 0.95, bumpScale: 0 })
    const object = mesh(boxAt(part.size, part.position, part.rotation, 0), mat, { cast: false })
    const edges = new THREE.LineSegments(own(new THREE.EdgesGeometry(object.geometry, 30)), material(`line|${look.plan.line}`, () => new THREE.LineBasicMaterial({ color: look.plan.line, transparent: true, opacity: look.plan.edgeOpacity })))
    object.add(edges)
    return tag(object, { kind: part.kind, spaceIds: part.spaceIds || [], lowY: partLowY(part), opacity })
  }

  function buildPlinth(plinth, groundY) {
    const spec = look.plinth
    const height = plinth.top - groundY
    if (height <= 0.01) return null
    const group = new THREE.Group()
    const sideMat = standard(spec.color, 1, { texture: spec.texture, tile: spec.texture === 'ashlar' ? [2.4, 0.45] : [1.2, 1.2], roughness: 0.92, bumpScale: 0.9 })
    const topMat = standard(shadeHex(spec.color, 1.04), 1, { texture: 'concrete', tile: [1.2, 1.2], roughness: 0.9, bumpScale: 0.4 })
    const size = { x: plinth.x1 - plinth.x0 + spec.outset * 2, y: height, z: plinth.z1 - plinth.z0 + spec.outset * 2 }
    const center = { x: (plinth.x0 + plinth.x1) / 2, y: groundY + height / 2, z: (plinth.z0 + plinth.z1) / 2 }
    group.add(mesh(boxAt(size, center, null, edge.slab), [topMat, sideMat]))
    if (spec.topBand) {
      const band = spec.topBand
      const bandMat = standard(band.color, 1, { texture: 'ashlar', tile: [2.4, 0.45], roughness: 0.88, bumpScale: 0.6 })
      const bandSize = { x: size.x + band.outset * 2, y: band.height, z: size.z + band.outset * 2 }
      group.add(mesh(boxAt(bandSize, { x: center.x, y: plinth.top - band.height / 2, z: center.z }, null, edge.member), [bandMat, bandMat]))
    }
    return tag(group, { kind: 'plinth', spaceIds: plinth.spaceIds, lowY: groundY, opacity: 1 })
  }

  // ── 梁柱、门窗框、楼梯、层间带 ──
  function buildFrame(part, envelope, wallThickness) {
    const opacity = part.opacity ?? 1
    const vertical = part.size.y > 2.5 * Math.max(part.size.x, part.size.z)
    const minSection = Math.min(part.size.x, part.size.z, vertical ? Infinity : part.size.y)
    const expose = look.frame.exposePosts && envelope && !part.rotation && minSection >= 0.1 && !isStatus(part.color)
    const size = { ...part.size }
    const position = { ...part.position }
    const group = new THREE.Group()
    if (expose) {
      // 中式：柱与额枋比墙厚出一圈，立面上读得出木构架；柱脚落一个石柱础。
      if (vertical) {
        const section = Math.max(part.size.x, wallThickness + look.frame.postOutset * 2)
        size.x = size.z = section
      } else {
        const alongX = part.size.x >= part.size.z
        const depth = Math.max(alongX ? part.size.z : part.size.x, wallThickness + look.frame.beamOutset * 2)
        if (alongX) size.z = depth
        else size.x = depth
        size.y = part.size.y + look.frame.beamDrop
        position.y = part.position.y - look.frame.beamDrop / 2
      }
    }
    group.add(mesh(boxAt(size, position, part.rotation, edge.member), woodMaterial(part.color, opacity, vertical)))
    if (expose && vertical && look.frame.columnBase) {
      const spec = look.frame.columnBase
      const side = size.x * spec.size
      const baseMat = standard(spec.color, 1, { texture: 'concrete', tile: [1.2, 1.2], roughness: 0.9, bumpScale: 0.5 })
      group.add(mesh(boxAt({ x: side, y: spec.height, z: side }, { x: position.x, y: partLowY(part) + spec.height / 2, z: position.z }, null, 0.03), baseMat))
    }
    return tag(group, { kind: part.kind, spaceIds: part.spaceIds || [], lowY: partLowY(part), opacity })
  }

  function buildTrim(part) {
    const opacity = part.opacity ?? 1
    const vertical = part.size.y > Math.max(part.size.x, part.size.z)
    return tag(mesh(boxAt(part.size, part.position, part.rotation, edge.trim), woodMaterial(part.color, opacity, vertical)), { kind: part.kind, spaceIds: part.spaceIds || [], lowY: partLowY(part), opacity })
  }

  function buildGlass(part) {
    const opacity = part.opacity ?? 1
    const color = look.glass.tint ? mixHex(part.color, look.glass.tint, 0.35) : part.color
    const mat = material(`glass|${color}|${opacity}`, () => new THREE.MeshStandardMaterial({
      color, opacity, transparent: opacity < 1, depthWrite: opacity >= 0.6,
      roughness: look.glass.roughness, metalness: 0, envMapIntensity: look.glass.envBoost,
    }))
    const object = mesh(boxAt(part.size, part.position, part.rotation, 0), mat, { cast: false })
    return tag(object, { kind: part.kind, spaceIds: part.spaceIds || [], lowY: partLowY(part), opacity })
  }

  function buildWindowDetail(window, trimColor) {
    const group = new THREE.Group()
    const spec = look.opening
    const put = (along, y, width, height, depth) => (window.axis === 'x'
      ? { size: { x: width, y: height, z: depth }, position: { x: along, y, z: window.at } }
      : { size: { x: depth, y: height, z: width }, position: { x: window.at, y, z: along } })
    if (spec.sill && !isStatus(window.wallColor)) {
      const s = spec.sill
      const box = put(window.uc, window.y0 - s.height / 2, window.width + s.overhang * 2, s.height, window.thickness + s.projection * 2)
      group.add(mesh(boxAt(box.size, box.position, null, edge.trim), standard(s.color, 1, { texture: 'concrete', tile: [1.2, 1.2], roughness: 0.85, bumpScale: 0.3 })))
    }
    if (spec.mullion && window.width > 1.2) {
      const box = put(window.uc, (window.y0 + window.y1) / 2, spec.mullion.width, window.y1 - window.y0, 0.06)
      group.add(mesh(boxAt(box.size, box.position, null, edge.trim), woodMaterial(trimColor, 1, true)))
    }
    if (spec.lattice) {
      const cellsU = Math.max(1, Math.round(window.width / spec.lattice.spacing))
      const cellsV = Math.max(1, Math.round((window.y1 - window.y0) / spec.lattice.spacing))
      const texture = material(`lattice|${spec.lattice.bar}`, () => {
        const map = new THREE.CanvasTexture(latticeCanvas(spec.lattice.bar / spec.lattice.spacing))
        map.colorSpace = THREE.SRGBColorSpace
        map.wrapS = map.wrapT = THREE.RepeatWrapping
        map.anisotropy = maxAnisotropy
        return map
      })
      const box = put(window.uc, (window.y0 + window.y1) / 2, window.width, window.y1 - window.y0, 0.03)
      const geometry = chamferBox(box.size.x, box.size.y, box.size.z, 0)
      geometry.translate(box.position.x, box.position.y, box.position.z)
      // 窗棂 UV 按窗洞等分：格子整齐落在窗框里，不从半格起头。
      const position = geometry.attributes.position
      const uv = new Float32Array(position.count * 2)
      const start = window.uc - window.width / 2
      for (let i = 0; i < position.count; i += 1) {
        const along = window.axis === 'x' ? position.getX(i) : position.getZ(i)
        uv[i * 2] = ((along - start) / window.width) * cellsU
        uv[i * 2 + 1] = ((position.getY(i) - window.y0) / (window.y1 - window.y0)) * cellsV
      }
      geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
      const mat = material(`latticeMat|${trimColor}`, () => new THREE.MeshStandardMaterial({
        color: trimColor, map: texture, alphaTest: 0.5, roughness: 0.7, side: THREE.DoubleSide,
      }))
      const lattice = mesh(geometry, mat)
      // 窗棂算作窗的一部分：拾取时和玻璃同口径，不挡门牌。
      lattice.userData.opacity = window.part.opacity ?? 1
      group.add(lattice)
    }
    return tag(group, { kind: 'window-detail', spaceIds: window.spaceIds, lowY: window.y0, opacity: window.part.opacity ?? 1 })
  }

  function buildThreshold(threshold) {
    const box = threshold.axis === 'x'
      ? { size: { x: threshold.u1 - threshold.u0, y: 0.012, z: threshold.thickness + 0.06 }, position: { x: (threshold.u0 + threshold.u1) / 2, y: threshold.y + 0.006, z: threshold.at } }
      : { size: { x: threshold.thickness + 0.06, y: 0.012, z: threshold.u1 - threshold.u0 }, position: { x: threshold.at, y: threshold.y + 0.006, z: (threshold.u0 + threshold.u1) / 2 } }
    const object = mesh(boxAt(box.size, box.position, null, 0.004), standard(look.opening.threshold, 1, { texture: 'concrete', tile: [1.2, 1.2], roughness: 0.8, bumpScale: 0.2 }), { cast: false })
    return tag(object, { kind: 'threshold', spaceIds: threshold.spaceIds, lowY: threshold.y, opacity: 1 })
  }

  function buildStep(part) {
    const opacity = part.opacity ?? 1
    return tag(mesh(boxAt(part.size, part.position, part.rotation, edge.member), woodMaterial(part.color, opacity, false)), { kind: part.kind, spaceIds: part.spaceIds || [], lowY: partLowY(part), opacity })
  }

  function buildStringers(stair) {
    const group = new THREE.Group()
    const mat = woodMaterial(shadeHex(stair.color, 0.86), stair.opacity, false)
    for (const stringer of stair.stringers) {
      const geometry = chamferBox(stringer.length, stringer.height, stringer.depth, edge.member)
      geometry.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0, stair.yaw, stair.pitch, 'YZX')))
      geometry.translate(...stringer.center)
      group.add(mesh(projectUV(geometry), mat))
    }
    return tag(group, { kind: 'stair', spaceIds: stair.spaceIds, lowY: stair.lowY, opacity: stair.opacity })
  }

  function buildBand(part) {
    const opacity = part.opacity ?? 1
    const color = shadeHex(part.color, look.band.shade)
    const mat = isStatus(part.color) ? surfaceMaterial(part.color, opacity) : standard(color, opacity, { texture: look.band.texture, tile: [1.2, 1.2], roughness: 0.85, bumpScale: 0.4 })
    return tag(mesh(boxAt(part.size, part.position, part.rotation, edge.member), mat), { kind: part.kind, spaceIds: part.spaceIds || [], lowY: partLowY(part), opacity })
  }

  function buildGeneric(part) {
    const opacity = part.opacity ?? 1
    const mat = isStatus(part.color) ? surfaceMaterial(part.color, opacity) : standard(part.color, opacity, { roughness: 0.85 })
    return tag(mesh(boxAt(part.size, part.position, part.rotation, edge.trim), mat), { kind: part.kind, spaceIds: part.spaceIds || [], lowY: partLowY(part), opacity })
  }

  /** 主装配：规划 → 顶层对象数组。present.parts 每一块都有归宿（合并墙、屋顶组或逐块）。 */
  function build(plan, model, present) {
    const objects = []
    const wallThickness = model?.defaults?.wallThickness ?? 0.18
    const trimColor = present.parts.find((part) => part.kind === 'opening-frame')?.color
      ?? present.parts.find((part) => part.kind === 'frame')?.color ?? '#a88059'
    for (const wall of plan.walls.merged) objects.push(buildWall(wall))
    for (const part of plan.walls.loose) objects.push(buildLooseWall(part))
    for (const gable of plan.gables) objects.push(buildGable(gable))
    for (const roof of plan.roofs) objects.push(buildRoof(roof, plan.roofs))
    for (const plinth of plan.plinths) {
      const object = buildPlinth(plinth, plan.groundY)
      if (object) objects.push(object)
    }
    for (const window of plan.windows) objects.push(buildWindowDetail(window, trimColor))
    for (const threshold of plan.thresholds) objects.push(buildThreshold(threshold))
    for (const stair of plan.stairs) objects.push(buildStringers(stair))
    for (const part of plan.rest) {
      switch (part.kind) {
        case 'floor': objects.push(buildFloor(part, model)); break
        case 'plan-floor': objects.push(buildPlanFloor(part)); break
        case 'frame': objects.push(buildFrame(part, plan.envelope, wallThickness)); break
        case 'opening-frame':
        case 'roof-frame':
        case 'floor-joint-frame': objects.push(buildTrim(part)); break
        case 'glass': objects.push(buildGlass(part)); break
        case 'stair': objects.push(buildStep(part)); break
        case 'floor-joint': objects.push(buildBand(part)); break
        default: objects.push(buildGeneric(part))
      }
    }
    return objects
  }

  return { build, standard, textures, tag, mesh, chamferBox, projectUV }
}

// ── 环境：底座、天空、环境光照 ────────────────────────────────────

let grain = null
function grainCanvas() {
  if (grain) return grain
  const size = 256
  grain = document.createElement('canvas')
  grain.width = grain.height = size
  const context = grain.getContext('2d')
  const image = context.createImageData(size, size)
  const rand = mulberry32(7)
  for (let i = 0; i < image.data.length; i += 4) {
    const value = Math.round(rand() * 255)
    image.data[i] = image.data[i + 1] = image.data[i + 2] = value
    image.data[i + 3] = 255
  }
  context.putImageData(image, 0, 0)
  return grain
}

/** 模型底座的顶面贴图：纸感底色＋（可选）细网格＋首层轮廓下的柔和接触阴影＋内框线。 */
export function groundCanvas(look, rect, footprints) {
  const width = 1024
  const height = Math.max(64, Math.min(1024, Math.round(width * rect.depth / rect.width)))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  const sx = width / rect.width
  const sz = height / rect.depth
  context.fillStyle = look.ground.color
  context.fillRect(0, 0, width, height)
  // 纸感颗粒：用缓存的颗粒图平铺叠加（不读回像素——getImageData 会逼 GPU 同步，换建筑时卡顿）。
  context.save()
  context.globalAlpha = 0.05
  context.fillStyle = context.createPattern(grainCanvas(), 'repeat')
  context.fillRect(0, 0, width, height)
  context.restore()
  if (look.ground.grid) {
    context.strokeStyle = look.ground.gridColor
    context.globalAlpha = 0.55
    context.lineWidth = 1
    const step = look.ground.grid
    for (let x = Math.ceil(rect.x0 / step) * step; x <= rect.x0 + rect.width; x += step) {
      const px = Math.round((x - rect.x0) * sx) + 0.5
      context.beginPath(); context.moveTo(px, 0); context.lineTo(px, height); context.stroke()
    }
    for (let z = Math.ceil(rect.z0 / step) * step; z <= rect.z0 + rect.depth; z += step) {
      const pz = Math.round((z - rect.z0) * sz) + 0.5
      context.beginPath(); context.moveTo(0, pz); context.lineTo(width, pz); context.stroke()
    }
    context.globalAlpha = 1
  }
  // 内框线：像模型底板上刻的一道边线。
  context.strokeStyle = shadeHex(look.ground.color, 0.86)
  context.lineWidth = 2
  const inset = 0.45
  context.strokeRect(inset * sx, inset * sz, width - inset * 2 * sx, height - inset * 2 * sz)
  if (footprints.length && look.ground.aoStrength > 0) {
    context.save()
    context.filter = `blur(${Math.max(4, Math.round(0.5 * sx))}px)`
    context.fillStyle = `rgba(40, 32, 20, ${look.ground.aoStrength})`
    for (const f of footprints) {
      const grow = 0.25
      context.fillRect((f.x0 - grow - rect.x0) * sx, (f.z0 - grow - rect.z0) * sz, (f.x1 - f.x0 + grow * 2) * sx, (f.z1 - f.z0 + grow * 2) * sz)
    }
    context.restore()
  }
  return canvas
}

/** 圆角矩形底座（两层：面板＋深色垫层），顶面 UV 覆盖整块板以贴底座贴图。 */
export function baseBoard(look, rect, top, own, groundTexture) {
  const group = new THREE.Group()
  const make = (x0, z0, w, d, thickness, radius, bevel) => {
    const shape = new THREE.Shape()
    const r = Math.min(radius, w / 2 - 0.01, d / 2 - 0.01)
    shape.moveTo(x0 + r, z0)
    shape.lineTo(x0 + w - r, z0)
    shape.quadraticCurveTo(x0 + w, z0, x0 + w, z0 + r)
    shape.lineTo(x0 + w, z0 + d - r)
    shape.quadraticCurveTo(x0 + w, z0 + d, x0 + w - r, z0 + d)
    shape.lineTo(x0 + r, z0 + d)
    shape.quadraticCurveTo(x0, z0 + d, x0, z0 + d - r)
    shape.lineTo(x0, z0 + r)
    shape.quadraticCurveTo(x0, z0, x0 + r, z0)
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: thickness - bevel * 2, curveSegments: 10, steps: 1,
      bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2,
    })
    // 形状画在 XY（y 当作 z），挤出沿 Z；转成水平板：y' = z，z' = y（镜像）后再修正朝向。
    geometry.rotateX(Math.PI / 2)
    geometry.translate(0, thickness - bevel, 0)
    const position = geometry.attributes.position
    const uv = new Float32Array(position.count * 2)
    for (let i = 0; i < position.count; i += 1) {
      uv[i * 2] = (position.getX(i) - rect.x0) / rect.width
      uv[i * 2 + 1] = (position.getZ(i) - rect.z0) / rect.depth
    }
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    return geometry
  }
  const bevel = 0.04
  const board = make(rect.x0 + bevel, rect.z0 + bevel, rect.width - bevel * 2, rect.depth - bevel * 2, look.base.thickness, look.base.radius, bevel)
  board.translate(0, top - look.base.thickness, 0)
  const topMat = own(new THREE.MeshStandardMaterial({ color: '#ffffff', map: groundTexture, roughness: 0.95 }))
  const sideMat = own(new THREE.MeshStandardMaterial({ color: look.ground.side, roughness: 0.9 }))
  const boardMesh = new THREE.Mesh(own(board), [topMat, sideMat])
  boardMesh.receiveShadow = true
  group.add(boardMesh)
  const inset = look.base.underInset
  const under = make(rect.x0 + inset, rect.z0 + inset, rect.width - inset * 2, rect.depth - inset * 2, look.base.underLayer, Math.max(0.1, look.base.radius - inset), 0.02)
  under.translate(0, top - look.base.thickness - look.base.underLayer, 0)
  const underMat = own(new THREE.MeshStandardMaterial({ color: look.ground.under, roughness: 0.8 }))
  group.add(new THREE.Mesh(own(under), underMat))
  return group
}

/** 天空底色：竖向渐变（屏幕空间背景，不随相机旋转产生接缝）。 */
export function skyTexture(look) {
  const canvas = document.createElement('canvas')
  canvas.width = 4
  canvas.height = 256
  const context = canvas.getContext('2d')
  const gradient = context.createLinearGradient(0, 0, 0, 256)
  gradient.addColorStop(0, look.sky.top)
  gradient.addColorStop(0.72, look.sky.horizon)
  gradient.addColorStop(1, look.sky.horizon)
  context.fillStyle = gradient
  context.fillRect(0, 0, 4, 256)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/**
 * 环境光照（给玻璃与金属屋面一点反射）：用一个小的渐变天球场景现场生成 PMREM，
 * 不需要 HDR 文件，也不需要 RoomEnvironment 插件。
 */
export function environmentTexture(renderer, look) {
  const pmrem = new THREE.PMREMGenerator(renderer)
  const envScene = new THREE.Scene()
  const geometry = new THREE.SphereGeometry(10, 32, 16)
  const colors = []
  const top = new THREE.Color(look.sky.top)
  const horizon = new THREE.Color(look.sky.horizon)
  const ground = new THREE.Color(look.ground.color).multiplyScalar(0.7)
  const position = geometry.attributes.position
  for (let i = 0; i < position.count; i += 1) {
    const y = position.getY(i) / 10
    const color = y > 0 ? horizon.clone().lerp(top, Math.min(1, y * 1.4)) : horizon.clone().lerp(ground, Math.min(1, -y * 3))
    colors.push(color.r, color.g, color.b)
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  const sphereMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })
  envScene.add(new THREE.Mesh(geometry, sphereMat))
  const sunGeometry = new THREE.SphereGeometry(0.9, 16, 8)
  const sunMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(look.light.sun).multiplyScalar(6) })
  const sun = new THREE.Mesh(sunGeometry, sunMat)
  const el = THREE.MathUtils.degToRad(look.light.sunElevation)
  const az = THREE.MathUtils.degToRad(look.light.sunAzimuth)
  sun.position.set(Math.cos(el) * Math.sin(az) * 8, Math.sin(el) * 8, Math.cos(el) * Math.cos(az) * 8)
  envScene.add(sun)
  const target = pmrem.fromScene(envScene, 0.04)
  geometry.dispose(); sphereMat.dispose(); sunGeometry.dispose(); sunMat.dispose()
  pmrem.dispose()
  return target
}

// ── 门牌 ─────────────────────────────────────────────────────

const FONT = '"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", "Source Han Sans SC", sans-serif'

function wrappedText(context, text, x, y, maxWidth, lineHeight, maxLines) {
  let line = ''
  let count = 0
  const chars = Array.from(String(text || ''))
  for (let i = 0; i < chars.length; i += 1) {
    const candidate = line + chars[i]
    if (context.measureText(candidate).width > maxWidth && line) {
      context.fillText(count === maxLines - 1 ? `${line.slice(0, -1)}…` : line, x, y + count * lineHeight)
      count += 1
      if (count >= maxLines) return
      line = chars[i]
    } else line = candidate
  }
  if (line && count < maxLines) context.fillText(line, x, y + count * lineHeight)
}

/** 门牌画面：内容（标题、副标题）全部来自模型；版式两套相同，只换配色与边框做法。 */
export function signCanvas(sign, { project, look }) {
  const spec = look.sign
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = project ? 400 : 340
  const context = canvas.getContext('2d')
  context.fillStyle = spec.board
  context.fillRect(0, 0, canvas.width, canvas.height)
  if (look.id === 'chinese-timber') {
    context.strokeStyle = spec.accent
    context.lineWidth = 5
    context.strokeRect(22, 22, canvas.width - 44, canvas.height - 44)
    context.strokeStyle = spec.rule
    context.lineWidth = 2
    context.strokeRect(36, 36, canvas.width - 72, canvas.height - 72)
  } else {
    context.fillStyle = spec.accent
    context.fillRect(0, 0, 12, canvas.height)
    context.strokeStyle = spec.rule
    context.lineWidth = 2
    context.strokeRect(28, 28, canvas.width - 56, canvas.height - 56)
  }
  context.fillStyle = spec.accent
  context.font = `600 27px ${FONT}`
  context.fillText(project ? 'ARCHIFY · 项目牌' : '业务门牌', 66, 88)
  context.fillStyle = spec.ink
  context.font = `700 ${project ? 70 : 66}px ${FONT}`
  wrappedText(context, sign.title, 64, project ? 180 : 176, 896, 76, 1)
  context.fillStyle = spec.muted
  context.font = `500 28px ${FONT}`
  wrappedText(context, sign.subtitle || '', 66, project ? 262 : 250, 892, 38, project ? 3 : 2)
  return canvas
}

/** 立一块门牌：面板＋背板（带厚度的"牌匾"），都按模型给的贴墙位置与朝向。 */
export function buildSign(sign, { project, look, own, maxAnisotropy }) {
  const spec = look.signLayout
  const canvas = signCanvas(sign, { project, look })
  const texture = own(new THREE.CanvasTexture(canvas))
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = maxAnisotropy
  const width = project ? spec.projectWidth : spec.width
  const height = width * (canvas.height / canvas.width)
  const group = new THREE.Group()
  const faceMat = own(new THREE.MeshStandardMaterial({
    map: texture, roughness: 0.92, emissive: '#ffffff', emissiveMap: texture, emissiveIntensity: look.sign.emissive,
  }))
  const face = new THREE.Mesh(own(new THREE.PlaneGeometry(width, height)), faceMat)
  face.position.z = 0.002
  group.add(face)
  const backing = new THREE.Mesh(
    own(chamferBox(width + spec.backingPad * 2, spec.backingDepth, height + spec.backingPad * 2, 0.012)),
    own(new THREE.MeshStandardMaterial({ color: look.sign.backing, roughness: 0.6 })),
  )
  backing.rotation.x = Math.PI / 2
  backing.position.z = -spec.backingDepth / 2
  backing.castShadow = true
  group.add(backing)
  const position = new THREE.Vector3(sign.position.x, sign.position.y, sign.position.z)
  group.position.copy(position)
  group.lookAt(position.clone().add(new THREE.Vector3(sign.normal.x, sign.normal.y, sign.normal.z)))
  group.userData = {
    kind: 'sign',
    spaceIds: sign.spaceId ? [sign.spaceId] : [],
    lowY: sign.position.y - height / 2,
    opacity: 1,
  }
  return group
}

// 外观规划（纯函数，不引 Three.js，Node 可直接 import 测试）。
//
// 输入是服务端给的 model 与 present（只读，绝不修改）；输出是"怎么画"的规划：
//   · 墙：把同一面墙被门窗切开的碎段重新拼回一整面带洞口的墙（整面倒角、整面贴图），
//     拼不回去的（段不共面、颜色不一、洞口贴边等）原样按段画，不猜；
//   · 屋顶：识别双坡对、屋脊线、檐口线，供檐口板、博风板、脊、山墙填充使用；
//   · 楼梯：从踏步推出两侧斜梁；
//   · 窗：从玻璃推出窗台与窗棂位置；门：从墙底缺口推出门槛；
//   · 台基：从首层楼板推出（只认完整外观的 floor，不认设计框架的 plan-floor——
//     设计阶段画出石台基等于谎称地基已落）。
// 规划只描述"看得见的东西"。present.colliders 与 present.surfaces 不在这里读写，
// 派生构件一律不进碰撞与行走数据；派生件只落在墙面上、楼板下、头顶以上，
// 不在行走身体高度的空地上凭空立东西（见文档"派生规则"）。

const R = (value) => Math.round(value * 1e4) / 1e4
const near = (a, b, tolerance = 1e-3) => Math.abs(a - b) <= tolerance
const hasRotation = (part) => Boolean(part.rotation) && ['x', 'y', 'z'].some((key) => Math.abs(part.rotation[key] || 0) > 1e-6)
const hex = (color) => String(color || '').trim().toLowerCase()

/** 规划入口。look 来自 building-look.js 的 resolveLook。 */
export function planBuilding(model, present, look) {
  const parts = Array.isArray(present?.parts) ? present.parts : []
  const kinds = new Set(parts.map((part) => part.kind))
  // 完整外观（围护已出现）与设计框架的区分只看数据里出现了哪些构件，不看开关状态：
  // 中间施工阶段可能只出现一部分墙——那就只给那部分墙配细部。
  const envelope = ['wall', 'roof', 'glass', 'floor'].some((kind) => kinds.has(kind))
  const consumed = new Set()

  const walls = planWalls(parts.filter((part) => part.kind === 'wall'), consumed)
  const roofs = planRoofs(parts.filter((part) => part.kind === 'roof'), look, consumed)
  const gables = planGables(roofs, walls.merged)
  const stairs = planStairs(parts.filter((part) => part.kind === 'stair'), look)
  const windows = planWindows(parts.filter((part) => part.kind === 'glass'), walls.merged, model)
  const thresholds = walls.merged.flatMap((wall) => wall.notches.map((notch) => ({
    id: `threshold:${wall.id}:${notch.u0}`,
    axis: wall.axis, at: wall.at, u0: notch.u0, u1: notch.u1, y: wall.y0, thickness: wall.thickness,
    spaceIds: wall.spaceIds,
  })))
  const lowest = lowestLevel(model, parts)
  const plinths = parts
    .filter((part) => part.kind === 'floor' && !hasRotation(part) && near(part.position.y + part.size.y / 2, lowest, 0.02))
    .map((part) => ({
      id: `plinth:${part.id}`,
      x0: part.position.x - part.size.x / 2, x1: part.position.x + part.size.x / 2,
      z0: part.position.z - part.size.z / 2, z1: part.position.z + part.size.z / 2,
      top: part.position.y - part.size.y / 2,
      spaceIds: part.spaceIds || [],
    }))
  const bounds = model?.bounds || { x0: -10, x1: 10, z0: -10, z1: 10, y0: 0, y1: 4 }
  const groundY = R((bounds.y0 ?? 0) - (look?.plinth?.height ?? 0.24))
  return {
    envelope,
    walls,
    roofs,
    gables,
    stairs,
    windows,
    thresholds,
    plinths,
    groundY,
    lowest,
    rest: parts.filter((part) => !consumed.has(part.id)),
  }
}

/** 首层地坪：模型最低楼层标高（缺失时取楼板顶面最低值）。 */
function lowestLevel(model, parts) {
  const floors = (model?.floors || []).map((floor) => floor.y ?? floor.elevation).filter(Number.isFinite)
  if (floors.length) return Math.min(...floors)
  const tops = parts.filter((part) => part.kind === 'floor' || part.kind === 'plan-floor').map((part) => part.position.y + part.size.y / 2)
  return tops.length ? Math.min(...tops) : 0
}

// ── 墙：碎段拼回整面 ──────────────────────────────────────────────

/** 同一面墙的碎段 id 形如 "<墙id>:piece:<序号>"；不合这个形状的段自成一组。 */
export function wallGroupKey(part) {
  const match = /^(.*):piece:\d+$/.exec(String(part.id))
  return match ? match[1] : String(part.id)
}

export function planWalls(wallParts, consumed = new Set()) {
  const groups = new Map()
  for (const part of wallParts) {
    const key = wallGroupKey(part)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(part)
  }
  const merged = []
  const loose = []
  const reasons = new Map()
  for (const [key, pieces] of groups) {
    const result = mergeWall(key, pieces)
    if (result.ok) {
      merged.push(result.wall)
    } else {
      reasons.set(key, result.reason)
      // 拼不回去就按段画：这一段走 loose 这条绘制路径。
      loose.push(...pieces)
    }
    // 无论拼成没拼成，碎段都算有归宿（loose 也是归宿）：漏记就会同时落进 rest，
    // 让 kit 从 loose、rest 各画一遍——洞口的墙段凭空厚一层，还会叠一次明暗。
    for (const piece of pieces) consumed.add(piece.id)
  }
  extendCorners(merged)
  return { merged, loose, failures: [...reasons].map(([id, reason]) => ({ id, reason })) }
}

/**
 * 一组碎段 → 一面墙。条件：无旋转、同色同不透明度、共面同厚度；
 * 未覆盖区域只能是"墙内洞口"（窗）或"贴墙底的缺口"（门），且都是矩形。
 * 任何一条不满足就返回原因，调用方按段画——宁可退回旧画法，也不猜几何。
 */
export function mergeWall(id, pieces) {
  if (!pieces.length) return { ok: false, reason: 'empty' }
  const first = pieces[0]
  if (pieces.some(hasRotation)) return { ok: false, reason: 'rotated' }
  if (pieces.some((piece) => hex(piece.color) !== hex(first.color) || (piece.opacity ?? 1) !== (first.opacity ?? 1))) {
    return { ok: false, reason: 'mixed-appearance' }
  }
  const alongX = pieces.every((piece) => near(piece.position.z, first.position.z) && near(piece.size.z, first.size.z))
  const alongZ = pieces.every((piece) => near(piece.position.x, first.position.x) && near(piece.size.x, first.size.x))
  let axis = null
  if (alongX && alongZ) axis = first.size.x >= first.size.z ? 'x' : 'z'
  else if (alongX) axis = 'x'
  else if (alongZ) axis = 'z'
  if (!axis) return { ok: false, reason: 'not-coplanar' }
  const thickness = axis === 'x' ? first.size.z : first.size.x
  const at = axis === 'x' ? first.position.z : first.position.x
  const rects = pieces.map((piece) => {
    const center = axis === 'x' ? piece.position.x : piece.position.z
    const length = axis === 'x' ? piece.size.x : piece.size.z
    return {
      u0: R(center - length / 2), u1: R(center + length / 2),
      y0: R(piece.position.y - piece.size.y / 2), y1: R(piece.position.y + piece.size.y / 2),
    }
  })
  if (rects.some((rect) => rect.u1 - rect.u0 <= 0 || rect.y1 - rect.y0 <= 0)) return { ok: false, reason: 'degenerate' }
  const voids = findVoids(rects)
  if (!voids.ok) return { ok: false, reason: voids.reason }
  const u0 = Math.min(...rects.map((rect) => rect.u0))
  const u1 = Math.max(...rects.map((rect) => rect.u1))
  const y0 = Math.min(...rects.map((rect) => rect.y0))
  const y1 = Math.max(...rects.map((rect) => rect.y1))
  const spaceIds = [...new Set(pieces.flatMap((piece) => piece.spaceIds || []))]
  return {
    ok: true,
    wall: {
      id, axis, at: R(at), thickness: R(thickness), u0, u1, y0, y1,
      holes: voids.holes, notches: voids.notches,
      extendLo: 0, extendHi: 0,
      color: first.color, opacity: first.opacity ?? 1,
      spaceIds, partIds: pieces.map((piece) => piece.id),
    },
  }
}

/** 在碎段外包矩形里找没被覆盖的区域：按所有边界切网格，连通的空格子就是一个洞。 */
export function findVoids(rects) {
  const us = [...new Set(rects.flatMap((rect) => [rect.u0, rect.u1]))].sort((a, b) => a - b)
  const ys = [...new Set(rects.flatMap((rect) => [rect.y0, rect.y1]))].sort((a, b) => a - b)
  const nu = us.length - 1
  const ny = ys.length - 1
  const covered = (i, j) => {
    const cu = (us[i] + us[i + 1]) / 2
    const cy = (ys[j] + ys[j + 1]) / 2
    return rects.some((rect) => cu > rect.u0 && cu < rect.u1 && cy > rect.y0 && cy < rect.y1)
  }
  const empty = new Set()
  for (let i = 0; i < nu; i += 1) for (let j = 0; j < ny; j += 1) if (!covered(i, j)) empty.add(`${i},${j}`)
  const holes = []
  const notches = []
  const seen = new Set()
  for (const start of empty) {
    if (seen.has(start)) continue
    const stack = [start]
    const cells = []
    seen.add(start)
    while (stack.length) {
      const cell = stack.pop()
      cells.push(cell)
      const [i, j] = cell.split(',').map(Number)
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const next = `${i + di},${j + dj}`
        if (empty.has(next) && !seen.has(next)) {
          seen.add(next)
          stack.push(next)
        }
      }
    }
    const is = cells.map((cell) => Number(cell.split(',')[0]))
    const js = cells.map((cell) => Number(cell.split(',')[1]))
    const i0 = Math.min(...is), i1 = Math.max(...is), j0 = Math.min(...js), j1 = Math.max(...js)
    if (cells.length !== (i1 - i0 + 1) * (j1 - j0 + 1)) return { ok: false, reason: 'non-rectangular-opening' }
    const touchesLeft = i0 === 0
    const touchesRight = i1 === nu - 1
    const touchesBottom = j0 === 0
    const touchesTop = j1 === ny - 1
    const rect = { u0: us[i0], u1: us[i1 + 1], y0: ys[j0], y1: ys[j1 + 1] }
    if (touchesLeft || touchesRight || touchesTop) return { ok: false, reason: 'opening-at-edge' }
    if (touchesBottom) notches.push({ u0: rect.u0, u1: rect.u1, y1: rect.y1 })
    else holes.push(rect)
  }
  notches.sort((a, b) => a.u0 - b.u0)
  holes.sort((a, b) => a.u0 - b.u0 || a.y0 - b.y0)
  return { ok: true, holes, notches }
}

/**
 * 转角补齐：墙按中心线切分，两面垂直墙在外角会各缺半个墙厚。墙端碰到另一面垂直墙
 * （同层、高度有重叠）且同一端没有共线的续墙时，把端头延长到对方墙面（少 2 毫米防闪面）。
 * 这是纯视觉延长，碰撞盒不变（碰撞数据根本不经过这里）。
 */
function extendCorners(walls) {
  for (const wall of walls) {
    for (const end of ['lo', 'hi']) {
      const endU = end === 'lo' ? wall.u0 : wall.u1
      const collinear = walls.some((other) => other !== wall && other.axis === wall.axis && near(other.at, wall.at, 0.01)
        && (end === 'lo' ? near(other.u1, endU, 0.01) : near(other.u0, endU, 0.01)) && overlapY(other, wall))
      if (collinear) continue
      let extend = 0
      for (const other of walls) {
        if (other === wall || other.axis === wall.axis || !overlapY(other, wall)) continue
        if (!near(other.at, endU, 0.01)) continue
        if (wall.at < other.u0 - 0.01 || wall.at > other.u1 + 0.01) continue
        extend = Math.max(extend, other.thickness / 2 - 0.002)
      }
      if (end === 'lo') wall.extendLo = R(extend)
      else wall.extendHi = R(extend)
    }
  }
}

const overlapY = (a, b) => Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 0.1

// ── 屋顶：坡板、屋脊、檐口 ────────────────────────────────────────

/** Euler XYZ（Three.js 默认顺序）→ 3×3 旋转矩阵，行主序。 */
export function eulerMatrix({ x = 0, y = 0, z = 0 } = {}) {
  const a = Math.cos(x), b = Math.sin(x)
  const c = Math.cos(y), d = Math.sin(y)
  const e = Math.cos(z), f = Math.sin(z)
  const ae = a * e, af = a * f, be = b * e, bf = b * f
  return [
    [c * e, -c * f, d],
    [af + be * d, ae - bf * d, -b * c],
    [bf - ae * d, be + af * d, a * c],
  ]
}

const column = (m, i) => [m[0][i], m[1][i], m[2][i]]
const scale3 = (v, s) => v.map((value) => value * s)
const add3 = (a, b) => a.map((value, i) => value + b[i])

/** 一块坡板的几何框架：上坡方向、屋脊方向、坡长、高低两条边的中点。平板返回 slope=false。 */
export function slabFrame(part) {
  const m = eulerMatrix(part.rotation || {})
  const ax = column(m, 0)
  const ay = column(m, 1)
  const az = column(m, 2)
  const center = [part.position.x, part.position.y, part.position.z]
  const slopeLocal = Math.abs(ax[1]) > Math.abs(az[1]) ? 'x' : 'z'
  let dir = slopeLocal === 'x' ? ax : az
  const ridgeDir = slopeLocal === 'x' ? az : ax
  const L = slopeLocal === 'x' ? part.size.x : part.size.z
  const W = slopeLocal === 'x' ? part.size.z : part.size.x
  const slope = Math.abs(dir[1]) > 1e-4
  if (dir[1] < 0) dir = scale3(dir, -1)
  const normal = ay[1] < 0 ? scale3(ay, -1) : ay
  const cosT = Math.hypot(dir[0], dir[2]) || 1
  return {
    center, dir, ridgeDir, normal, L, W, th: part.size.y, cosT, slope, slopeLocal,
    high: add3(center, scale3(dir, L / 2)),
    low: add3(center, scale3(dir, -L / 2)),
    matrix: m,
  }
}

export function planRoofs(roofParts, look, consumed = new Set()) {
  const groups = new Map()
  for (const part of roofParts) {
    const match = /^(roof:.+):-?1$/.exec(String(part.id))
    const key = match ? match[1] : String(part.id)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(part)
  }
  const roofs = []
  for (const [id, slabsParts] of groups) {
    const slabs = slabsParts.map((part) => ({ part, frame: slabFrame(part) }))
    for (const slab of slabs) consumed.add(slab.part.id)
    const first = slabs[0]
    let kind = first.frame.slope ? 'mono' : 'flat'
    let ridge = null
    if (slabs.length === 2 && slabs.every((slab) => slab.frame.slope)) {
      const [a, b] = slabs.map((slab) => slab.frame)
      const meet = Math.hypot(a.high[0] - b.high[0], a.high[1] - b.high[1], a.high[2] - b.high[2]) < 0.05
      const opposite = a.dir[0] * b.dir[0] + a.dir[2] * b.dir[2] < 0
      if (meet && opposite) {
        kind = 'gable'
        const mid = scale3(add3(a.high, b.high), 0.5)
        const half = Math.max(a.W, b.W) / 2
        const topY = mid[1] + (a.th / 2) / a.cosT
        ridge = {
          a: add3(mid, scale3(a.ridgeDir, -half)),
          b: add3(mid, scale3(a.ridgeDir, half)),
          center: mid, length: half * 2, topY, dir: a.ridgeDir,
        }
      }
    }
    // 轴对齐的坡向（坡沿 x 或 z）才做山墙填充；斜向屋顶只画坡板与檐口，不猜山墙。
    const d = first.frame.dir
    const slopeAxis = Math.abs(d[0]) > 0.999 * first.frame.cosT ? 'x' : Math.abs(d[2]) > 0.999 * first.frame.cosT ? 'z' : null
    const eaveY = Math.min(...slabs.map((slab) => slab.frame.low[1]))
    const ridgeIndex = slopeAxis === 'x' ? 2 : 0
    const slopeIndex = slopeAxis === 'x' ? 0 : 2
    const ridgeRange = slopeAxis ? [
      Math.min(...slabs.map((slab) => slab.frame.center[ridgeIndex] - slab.frame.W / 2)),
      Math.max(...slabs.map((slab) => slab.frame.center[ridgeIndex] + slab.frame.W / 2)),
    ] : null
    const slopeRange = slopeAxis ? [
      Math.min(...slabs.flatMap((slab) => [slab.frame.high[slopeIndex], slab.frame.low[slopeIndex]])),
      Math.max(...slabs.flatMap((slab) => [slab.frame.high[slopeIndex], slab.frame.low[slopeIndex]])),
    ] : null
    roofs.push({
      id, kind, slabs, ridge, slopeAxis, eaveY, ridgeRange, slopeRange,
      eaveExtend: kind === 'flat' ? 0 : (look?.roof?.eaveExtend ?? 0),
      color: first.part.color, opacity: first.part.opacity ?? 1,
      spaceIds: [...new Set(slabs.flatMap((slab) => slab.part.spaceIds || []))],
    })
  }
  return roofs
}

/** 坡板底面在坡向坐标 s 处的高度（多块覆盖取最低，保证山墙填充不顶穿屋面）。 */
export function roofUnderside(roof, s) {
  const index = roof.slopeAxis === 'x' ? 0 : 2
  let best = null
  for (const { frame } of roof.slabs) {
    const component = frame.dir[index]
    if (Math.abs(component) < 1e-6) continue
    const t = (s - frame.center[index]) / component
    if (Math.abs(t) > frame.L / 2 + 1e-6) continue
    const y = frame.center[1] + t * frame.dir[1] - (frame.th / 2) / frame.cosT
    best = best === null ? y : Math.min(best, y)
  }
  return best
}

/**
 * 山墙填充：屋顶下、与屋脊垂直、墙顶齐檐口的墙，补上墙顶到坡板底之间的三角/梯形。
 * 只在墙已经出现时补（沿用那面墙的颜色与不透明度，状态色随之延续），
 * 剖看时随屋顶一起隐藏；不进碰撞（在头顶以上，碰撞数据也不经过这里）。
 */
export function planGables(roofs, walls) {
  const gables = []
  for (const roof of roofs) {
    if (roof.kind !== 'gable' || !roof.slopeAxis) continue
    const ridgeIndex = roof.slopeAxis === 'x' ? 0 : 2
    const ridgeS = roof.ridge.center[ridgeIndex]
    for (const wall of walls) {
      if (wall.axis !== roof.slopeAxis) continue
      if (wall.at < roof.ridgeRange[0] - 0.01 || wall.at > roof.ridgeRange[1] + 0.01) continue
      if (Math.abs(wall.y1 - roof.eaveY) > 0.35) continue
      const a = Math.max(wall.u0, roof.slopeRange[0])
      const b = Math.min(wall.u1, roof.slopeRange[1])
      if (b - a < 0.05) continue
      const samples = [a, ...(ridgeS > a && ridgeS < b ? [ridgeS] : []), b]
      const top = samples.map((s) => ({ s, y: roofUnderside(roof, s) }))
      if (top.some((point) => point.y === null)) continue
      const floorY = wall.y1
      const clipped = clipAbove(top.map((point) => ({ s: point.s, y: point.y - 0.004 })), floorY + 0.005)
      if (clipped.length < 2) continue
      const polygon = [[clipped[0].s, floorY], ...clipped.map((point) => [point.s, point.y]), [clipped.at(-1).s, floorY]]
      if (polygonArea(polygon) < 0.02) continue
      gables.push({
        id: `gable:${roof.id}:${wall.id}`,
        axis: wall.axis, at: wall.at, thickness: wall.thickness,
        polygon: dedupe(polygon),
        color: wall.color, opacity: wall.opacity,
        spaceIds: roof.spaceIds, roofId: roof.id, wallId: wall.id,
        lowY: floorY,
      })
    }
  }
  return gables
}

function clipAbove(points, floorY) {
  const out = []
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i]
    if (i > 0) {
      const q = points[i - 1]
      if ((q.y - floorY) * (p.y - floorY) < 0) {
        const t = (floorY - q.y) / (p.y - q.y)
        out.push({ s: q.s + (p.s - q.s) * t, y: floorY })
      }
    }
    if (p.y > floorY) out.push(p)
  }
  return out
}

function dedupe(polygon) {
  return polygon.filter((point, i) => {
    const prev = polygon[(i - 1 + polygon.length) % polygon.length]
    return !(near(point[0], prev[0], 1e-5) && near(point[1], prev[1], 1e-5))
  })
}

export function polygonArea(polygon) {
  let area = 0
  for (let i = 0; i < polygon.length; i += 1) {
    const [x0, y0] = polygon[i]
    const [x1, y1] = polygon[(i + 1) % polygon.length]
    area += x0 * y1 - x1 * y0
  }
  return Math.abs(area) / 2
}

// ── 楼梯：两侧斜梁 ───────────────────────────────────────────────

export function planStairs(stepParts, look) {
  const groups = new Map()
  for (const part of stepParts) {
    const match = /^step:(.+):\d+$/.exec(String(part.id))
    const key = match ? match[1] : (part.spaceIds || []).join('|') || String(part.id)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(part)
  }
  const stairs = []
  const spec = look?.stair?.stringer
  for (const [id, steps] of groups) {
    if (steps.length < 2 || !spec) continue
    const sorted = [...steps].sort((a, b) => a.position.y - b.position.y)
    const first = sorted[0]
    const last = sorted.at(-1)
    const dx = last.position.x - first.position.x
    const dz = last.position.z - first.position.z
    const run = Math.hypot(dx, dz)
    if (run < 1e-3) continue
    const d = [dx / run, dz / run]
    const alongX = Math.abs(d[0]) >= Math.abs(d[1])
    const tread = alongX ? first.size.x : first.size.z
    const width = alongX ? first.size.z : first.size.x
    const start = [first.position.x - d[0] * tread / 2, first.position.y + first.size.y / 2, first.position.z - d[1] * tread / 2]
    const end = [last.position.x + d[0] * tread / 2, last.position.y + last.size.y / 2, last.position.z + d[1] * tread / 2]
    const horizontal = Math.hypot(end[0] - start[0], end[2] - start[2])
    const pitch = Math.atan2(end[1] - start[1], horizontal)
    const length = Math.hypot(horizontal, end[1] - start[1])
    const side = width / 2 + spec.depth / 2 + spec.offset
    const perp = [-d[1], d[0]]
    // 斜梁中线：沿踏步前缘线，再沿斜面法向往下让出梁高的一半多一点，让踏步"坐"在梁上。
    const drop = spec.height * 0.42
    const mid = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2, (start[2] + end[2]) / 2]
    const center = [mid[0] + d[0] * Math.sin(pitch) * drop, mid[1] - Math.cos(pitch) * drop, mid[2] + d[1] * Math.sin(pitch) * drop]
    stairs.push({
      id,
      yaw: Math.atan2(-d[1], d[0]),
      pitch,
      stringers: [-1, 1].map((sign) => ({
        id: `stringer:${id}:${sign}`,
        center: [center[0] + perp[0] * side * sign, center[1], center[2] + perp[1] * side * sign],
        length, height: spec.height, depth: spec.depth,
      })),
      color: first.color, opacity: first.opacity ?? 1,
      spaceIds: [...new Set(steps.flatMap((step) => step.spaceIds || []))],
      lowY: Math.min(start[1], end[1]) - spec.height,
    })
  }
  return stairs
}

// ── 窗：窗台与窗棂的定位 ──────────────────────────────────────────

export function planWindows(glassParts, walls, model) {
  const fallbackThickness = model?.defaults?.wallThickness ?? 0.18
  return glassParts.filter((part) => !hasRotation(part)).map((part) => {
    const axis = part.size.z <= part.size.x ? 'x' : 'z'
    const at = axis === 'x' ? part.position.z : part.position.x
    const wall = walls.find((item) => item.axis === axis && near(item.at, at, 0.05)
      && (axis === 'x' ? part.position.x : part.position.z) > item.u0 && (axis === 'x' ? part.position.x : part.position.z) < item.u1)
    return {
      id: `window:${part.id}`,
      part, axis, at,
      uc: axis === 'x' ? part.position.x : part.position.z,
      width: axis === 'x' ? part.size.x : part.size.z,
      y0: part.position.y - part.size.y / 2,
      y1: part.position.y + part.size.y / 2,
      thickness: wall ? wall.thickness : fallbackThickness,
      wallColor: wall ? wall.color : null,
      spaceIds: part.spaceIds || [],
    }
  })
}

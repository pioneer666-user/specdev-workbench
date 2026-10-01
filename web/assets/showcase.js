// 展示页：项目级业务展示，列表／星图／球阵三种格式，切换器吸顶、选择记入本地存储。
// 星图与球阵都是自绘轻量实现（不引新依赖）：星图＝SVG 星座，球阵＝斐波那契球面＋自转投影。
// 沿用星图小样的产品口径：位置按业务 id 稳定分配不重叠；切走即停渲染；
// 减少动态效果偏好下先给静态布局，由用户点「开始旋转」明确启动。
// 不用占位星/占位球：次级节点用真实流程图数据，不伪造业务。
import { $, businessCard, el, fetchJson, pageTitle, renderEmptyWorkspaceParam, renderGuide, renderRepoLine, renderRepoState, setStatus, showError, workspaceParamEmpty, wsUrl } from './common.js'

const VIEW_KEY = 'archify-showcase-view'
const VIEWS = ['list', 'star', 'sphere']

function storedView() {
  try {
    const value = localStorage.getItem(VIEW_KEY)
    return VIEWS.includes(value) ? value : 'list'
  } catch {
    return 'list'
  }
}

function storeView(view) {
  try {
    localStorage.setItem(VIEW_KEY, view)
  } catch {
    // 存储受限（隐私模式等）：只影响本次打开的默认格式，不报错。
  }
}

const SVG_NS = 'http://www.w3.org/2000/svg'
function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag)
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value)
  return node
}

/** 星图：主星按 id 排序后均布在大圆上（稳定、不重叠），次星（流程图）在主星外侧扇形散开，
 *  连线只连真实归属（业务→它的图）。点主星进业务页，点次星进阅读页。 */
function buildStarMap(businesses) {
  const svg = svgEl('svg', { viewBox: '0 0 1000 640', class: 'star-svg', role: 'img', 'aria-label': '业务星图' })
  const sorted = [...businesses].sort((a, b) => a.id.localeCompare(b.id))
  const cx = 500
  const cy = 320
  const radius = 225
  sorted.forEach((business, index) => {
    const angle = ((-90 + (index * 360) / sorted.length) * Math.PI) / 180
    const bx = cx + radius * Math.cos(angle)
    const by = cy + radius * Math.sin(angle)
    const group = svgEl('g', { class: 'star-group' })
    const charts = [...business.charts].sort((a, b) => a.id.localeCompare(b.id))
    charts.forEach((chart, j) => {
      const spread = ((j - (charts.length - 1) / 2) * 26 * Math.PI) / 180
      const px = bx + 88 * Math.cos(angle + spread)
      const py = by + 88 * Math.sin(angle + spread)
      group.append(svgEl('line', { class: 'star-line', x1: bx, y1: by, x2: px, y2: py }))
      const link = svgEl('a', { href: wsUrl(`/specdev-workbench/read/${encodeURIComponent(business.id)}/${encodeURIComponent(chart.id)}`) })
      const title = svgEl('title')
      title.textContent = chart.name
      const dot = svgEl('circle', { class: 'star star-chart', cx: px, cy: py, r: 5, 'data-star': 'chart' })
      link.append(title, dot)
      group.append(link)
    })
    const bizLink = svgEl('a', { href: wsUrl(`/specdev-workbench/business/${encodeURIComponent(business.id)}`) })
    const bizTitle = svgEl('title')
    bizTitle.textContent = business.name
    const glow = svgEl('circle', { class: 'star-glow', cx: bx, cy: by, r: 26 })
    glow.style.animationDelay = `${index * 0.45}s`
    const star = svgEl('circle', { class: 'star star-business', cx: bx, cy: by, r: 11, 'data-star': 'business', 'data-business': business.id })
    // 名字放在主星靠圆心一侧：连线与次星都朝外，标签不会压到它们。
    const label = svgEl('text', { class: 'star-label', x: bx - 42 * Math.cos(angle), y: by - 42 * Math.sin(angle), 'text-anchor': 'middle', 'dominant-baseline': 'middle' })
    label.textContent = business.name
    bizLink.append(bizTitle, glow, star, label)
    group.append(bizLink)
    svg.append(group)
  })
  return svg
}

/** 球阵：斐波那契球面均匀布点（按 key 排序，稳定），自转是自绘投影——深度决定大小、
 *  透明度与层序。不做拖拽物理（小样的拖拽坐标坑不进产品），点球直接跳转。 */
function createSphere(box, nodes) {
  const sorted = [...nodes].sort((a, b) => a.key.localeCompare(b.key))
  const count = sorted.length
  const els = sorted.map((node) => {
    const link = el('a', 'sphere-node')
    link.href = node.href
    link.dataset.kind = node.kind
    const dot = el('span', 'sphere-dot')
    const label = el('span', 'sphere-label')
    label.textContent = node.label
    link.append(dot, label)
    link.title = node.label
    box.append(link)
    return link
  })
  const golden = 2.399963229728653
  const points = sorted.map((node, i) => {
    const y = 1 - (2 * (i + 0.5)) / count
    const ring = Math.sqrt(Math.max(0, 1 - y * y))
    const theta = i * golden
    return { x: Math.cos(theta) * ring, y, z: Math.sin(theta) * ring }
  })
  let angle = 0
  let running = false
  let handle = 0
  let frames = 0
  function project() {
    const width = box.clientWidth || 960
    const height = box.clientHeight || 520
    const cx = width / 2
    const cy = height / 2
    const radius = Math.min(width, height) * 0.36
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    points.forEach((point, i) => {
      const x = point.x * cos - point.z * sin
      const z = point.x * sin + point.z * cos
      const depth = (z + 1) / 2
      const node = els[i]
      node.style.left = `${(cx + x * radius).toFixed(1)}px`
      node.style.top = `${(cy + point.y * radius * 0.92).toFixed(1)}px`
      node.style.zIndex = String(Math.round(depth * 100))
      node.style.opacity = (0.35 + depth * 0.65).toFixed(2)
      node.style.transform = `translate(-50%, -50%) scale(${(0.55 + depth * 0.75).toFixed(3)})`
    })
  }
  function loop() {
    angle += 0.0045
    project()
    frames += 1
    handle = requestAnimationFrame(loop)
  }
  function start() {
    if (running || typeof requestAnimationFrame !== 'function') return
    running = true
    handle = requestAnimationFrame(loop)
  }
  function stop() {
    if (!running) return
    running = false
    cancelAnimationFrame(handle)
  }
  project()
  return {
    start,
    stop,
    project,
    isRunning: () => running,
    frameCount: () => frames,
  }
}

async function main() {
  if (workspaceParamEmpty) return renderEmptyWorkspaceParam()
  let inventory
  try {
    inventory = await fetchJson(wsUrl('/specdev-workbench/api/inventory'))
  } catch (error) {
    if (error.repo) renderRepoLine(error.repo)
    if (!renderRepoState(error)) showError(error.message)
    return
  }
  if (inventory.code === 'repo-not-configured') return renderGuide(inventory)
  renderRepoLine(inventory.repo)
  document.title = pageTitle('业务展示', inventory.repo)
  $('intro').textContent = inventory.project.description || inventory.project.name
  const businesses = inventory.businesses
  setStatus(`共 ${businesses.length} 个业务`, 'ok')

  const listView = $('viewList')
  if (businesses.length === 0) {
    const empty = el('div', 'empty-state')
    const h = el('h3')
    h.textContent = '还没有可展示的业务'
    const p = el('p')
    p.textContent = '项目清单里添加业务资料后，本页的列表、星图与球阵会一起亮起来。'
    empty.append(h, p)
    listView.append(empty)
    return
  }

  for (const [index, business] of businesses.entries()) listView.append(businessCard(business, index))
  $('starBox').append(buildStarMap(businesses))

  const nodes = []
  for (const business of businesses) {
    nodes.push({ key: `b/${business.id}`, kind: 'business', label: business.name, href: wsUrl(`/specdev-workbench/business/${encodeURIComponent(business.id)}`) })
    for (const chart of business.charts) {
      nodes.push({ key: `c/${business.id}/${chart.id}`, kind: 'chart', label: chart.name, href: wsUrl(`/specdev-workbench/read/${encodeURIComponent(business.id)}/${encodeURIComponent(chart.id)}`) })
    }
  }
  const sphere = createSphere($('sphereBox'), nodes)
  const motionAllowed = !window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const switcher = $('viewSwitch')
  const startButton = $('sphereStart')
  let current = storedView()
  function syncSphereButton() {
    startButton.hidden = motionAllowed || current !== 'sphere' || sphere.isRunning()
  }
  function setView(view) {
    current = view
    for (const button of switcher.querySelectorAll('[data-view]')) {
      button.setAttribute('aria-pressed', String(button.dataset.view === view))
    }
    $('viewList').hidden = view !== 'list'
    $('viewStar').hidden = view !== 'star'
    $('viewSphere').hidden = view !== 'sphere'
    if (view === 'sphere') {
      sphere.project()
      if (motionAllowed) sphere.start()
    } else {
      sphere.stop() // 切走即停渲染（星图小样第 6 条口径）
    }
    syncSphereButton()
    storeView(view)
  }
  switcher.querySelectorAll('[data-view]').forEach((button) => {
    button.addEventListener('click', () => setView(button.dataset.view))
  })
  startButton.addEventListener('click', () => {
    sphere.start()
    syncSphereButton()
  })
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) sphere.stop()
    else if (current === 'sphere' && motionAllowed) sphere.start()
    syncSphereButton()
  })
  switcher.hidden = false
  setView(current)
}

main()

// 建筑总览页逻辑：读 /api/building（清单是内容依据、蓝图是空间安排）。
// 目录面板、状态页与诊断列表在本文档装配；三维视图由 building-scene.js 用 Three.js
// 消费服务端算好的 model/present——页面不重复计算建筑几何，楼层剖看只是可见性过滤。
// 建筑生成成功后整页切到"全窗口"形态（body.building-live）：页面不滚动，三维视图占满
// 浏览器窗口，右侧资料目录改成浮在视口上的抽屉，开关在操作行右端（状态记在本机；
// 进探索时临时收起、退出后收回作者的选择——见 setDirectoryOpen 与 syncWalkUi）。
// 房内打开资料：点业务门牌／房间目录给该业务的介绍与资料清单，点项目牌给项目介绍；
// 文档正文在面板里读，流程图把现有阅读页装进面板（带同一个工作区参数）。
// 打开面板时暂停漫游输入，关闭后位置与视角原样；换蓝图时旧资料整套作废。
// 点门牌的拾取由场景按 building-walk.js 的 pickSign 判定（被墙挡住、被剖看藏起的不算），
// 阅读页里的 ESC 经 panel-link.js 转回来关面板。
import {
  $,
  el,
  wsUrl,
  workspaceParamEmpty,
  renderEmptyWorkspaceParam,
  fetchJson,
  renderGuide,
  renderRepoState,
  renderRepoLine,
  repoLineText,
  pageTitle,
  setStatus,
  showError,
} from './common.js'
import { renderMarkdown } from './markdown.js'
import { listenMaterialClose } from './panel-link.js'
import { isChartMaterial, chartMaterialLabel } from './chart-entities.js'

/** 建造阶段的展示文案（标签＋一句说明）。阶段语义在蓝图契约里，这里只有文案。 */
const PHASE_LABELS = {
  design: ['设计审批', '显示规划框架、门牌与资料入口；没有实体墙或家具。'],
  foundation: ['基础', '地基已落，仍以规划框架呈现房间。'],
  structure: ['主体结构', '梁柱与楼板成形，墙顶尚未围合。'],
  enclosure: ['屋面围护', '屋顶与墙体围合；墙的呈现按蓝图中的证据声明区分。'],
  services: ['水电暖通', '本轮不生成虚构管线，构件与围护阶段相同。'],
  interior: ['内装', '本轮不生成家具，构件与围护阶段相同。'],
  accepted: ['验收入住', '完整外观。'],
}

/**
 * 三维场景模块按需动态加载：诊断、空态与配置指引页不拉 Three.js。
 * 加载口可注入（页面回归在无浏览器的 jsdom 里替换它，动态 import 在那里不可用）；
 * 生产路径用浏览器动态 import，importmap 解析裸名 'three'。
 */
function loadSceneModule() {
  if (typeof globalThis.__loadBuildingScene === 'function') return globalThis.__loadBuildingScene()
  return import('/specdev-workbench/assets/building-scene.js')
}

let scene = null
let sceneFailed = null
let walking = false
// 房内打开资料的状态：当前蓝图的资料清单、面板里正读的那份资料、是否由我们暂停了漫游输入、
// 文档取数代次（面板换目标或又点了一份资料时，晚到的正文不许写进已经换过的阅读区），
// 以及打开面板时焦点在哪儿（关掉时还回去：读资料会隐藏目录，焦点不能留在看不见的按钮上）。
let currentCatalog = new Map()
let panelDocuments = []
let panelMaterialKey = ''
let pausedWalk = false
let readSeq = 0
let panelReturnFocus = null
// 面板里最近一次获得焦点的元素：进探索会把焦点夺给画布，面板还开着时要送回来。
let panelFocusInside = null

async function ensureScene() {
  if (scene || sceneFailed) return scene
  try {
    const module = await loadSceneModule()
    scene = module.createBuildingScene($('viewport'), {
      onWalkMode: (mode) => syncWalkUi(mode === 'walk'),
      onWalkMove: showWalkLocation,
      onWalkBlocked: showWalkBlocked,
      onSignClick: openSignTarget,
    })
    window.addEventListener('pagehide', () => scene?.dispose(), { once: true })
    return scene
  } catch (error) {
    sceneFailed = error
    $('sceneFallback').hidden = false
    $('sceneFallbackReason').textContent = error instanceof Error ? error.message : String(error)
    $('walkToggle').disabled = true
    $('walkToggle').title = '三维视图不可用，无法进入探索'
    setStatus('三维视图不可用', 'warn')
    return null
  }
}

/** 探索界面的开关：按钮文案、方向按钮区、提示行与"回到总览"的显隐在一处同步。 */
function syncWalkUi(next) {
  // 模式没变时也会被再叫一次（场景的 onWalkMode 回调与 onWalkToggle 各叫一次）：
  // 目录那一段只认真正的模式切换，否则第二次"进入"会把"是我们收起的"标记冲掉，
  // 退出探索时就收不回作者原来的选择。
  const wasWalking = walking
  walking = next
  $('walkToggle').textContent = next ? '返回总览' : '进入探索'
  $('walkToggle').setAttribute('aria-pressed', String(next))
  $('walkHud').hidden = !next
  $('resetView').hidden = next
  $('sceneHint').textContent = next ? '拖动环顾 · WASD／方向键或屏幕按钮移动 · Shift 加速 · 点门牌看资料' : '拖动环绕 · 滚轮缩放 · 点目录定位房间 · 点门牌看资料'
  if (!next) $('walkLocation').textContent = ''
  // 退出探索（含场景自己安全退出）时清掉"是我们暂停的"标记：机位已经回总览，
  // 关掉资料面板时不该再去恢复一次输入。
  if (!next) pausedWalk = false
  // 进得去就把上一次"进不去"的说明收起来（它是给当前这个建筑版本的）。
  if (next) $('walkNotice').hidden = true
  // 探索是"人在房子里"的全屏状态：进去时把资料目录临时收起（别挡着视野），退出时把作者的
  // 选择收回来；他自己在探索里开回来的就不再替他收（onDirectoryToggle 会清掉这个标记）。
  if (next !== wasWalking) {
    if (next) {
      directoryAutoCollapsed = directoryOpen
      if (directoryOpen) setDirectoryOpen(false, { persist: false })
    } else if (directoryAutoCollapsed) {
      directoryAutoCollapsed = false
      setDirectoryOpen(true)
    }
  }
}

/** 进不了探索的两种原因与建议说法（场景给的 reason 只这两类，其它情况按"入口不可用"兜底）。 */
const WALK_BLOCKED_TEXT = {
  'entry-blocked': ['入口站不住（离墙太近或已被构件占住）', '在蓝图里把入口挪离墙、或把墙体调薄后再试'],
  'no-walkable-ground': ['当前建筑没有可行走的地面', ''],
}

/** 场景进不去探索（入口站不住或没有行走面）：在视口里如实说明，并区分"没进去"与"已退出"。
 *  单独用视口提示而不是状态行：换表现时状态行随后会被阶段/预览口径覆盖，这里不会被冲掉。 */
function showWalkBlocked({ reason, whileWalking } = {}) {
  const [what, advice] = WALK_BLOCKED_TEXT[reason] || ['入口不可用', '']
  const notice = $('walkNotice')
  notice.textContent = `${what}，${whileWalking ? '已退出探索' : '没有进入探索'}${advice ? `；${advice}` : ''}。`
  notice.hidden = false
}

/** 探索中的所在位置（场景跨空间时报一次）：楼层的名字来自当前蓝图。 */
function showWalkLocation(space) {
  const floor = space ? currentModel?.floors.find((item) => item.id === space.floorId) : null
  $('walkLocation').textContent = space ? `所在：${floor?.name || space.floorId} · ${space.name}` : '所在：楼梯'
}

// ── 资料目录：全窗口形态下浮在视口右侧，收起后建筑占满整页 ────────────────

/** 目录开关的存储键；读法与主题同口径：存储不可用时本页照常切换，只是记不住。 */
const DIRECTORY_KEY = 'archify-building-directory'

function storedDirectoryOpen() {
  try { return localStorage.getItem(DIRECTORY_KEY) !== 'closed' } catch { return true }
}

let directoryOpen = storedDirectoryOpen()
// 进探索时替作者临时收起过：退出探索要把他的选择收回来（他自己中途开过就不再回滚）。
let directoryAutoCollapsed = false

/** 目录的展开／收起：抽屉位移、开关文案、提示与横幅的让位宽度都由这一个状态定
 *  （宽度在 CSS 里按 buildingStage 的 data-directory 算，这里不量像素）。
 *  persist=false 只用于"进探索时临时收起"——那是模式的临时动作，不该改作者存的偏好。 */
function setDirectoryOpen(open, { persist = true } = {}) {
  directoryOpen = open
  $('buildingStage').dataset.directory = open ? 'open' : 'closed'
  const toggle = $('directoryToggle')
  toggle.textContent = open ? '收起目录' : '资料目录'
  toggle.setAttribute('aria-expanded', String(open))
  toggle.title = open
    ? '收起右侧资料目录，让建筑占满窗口'
    : '展开右侧资料目录：项目信息、当前建造阶段与逐间资料入口'
  if (!persist) return
  try { localStorage.setItem(DIRECTORY_KEY, open ? 'open' : 'closed') } catch { /* 本页切换不依赖存储。 */ }
}

/** 点开关：作者手动动过之后，进探索时的临时收起不再回滚（他的选择优先）。 */
function onDirectoryToggle() {
  directoryAutoCollapsed = false
  setDirectoryOpen(!directoryOpen)
}

/** 抽屉与资料卡片都要给操作行让位：量一次操作行的实际高度报给 CSS（--toolbar-h）。
 *  窄屏换行、放大字号都会让它变高，固定像素迟早会压住收起开关；量不到高度（没有布局的
 *  环境）就不写，留着 CSS 的默认档。
 *  同时量"完整外观预览"横幅的实际高度（--banner-h）：窄屏它会折行，读资料时卡片要按它
 *  留出底部空档，抽屉也要让开它，才不会被压住。 */
function syncLayoutMetrics() {
  const stage = $('buildingStage')
  const toolbar = document.querySelector('.view-toolbar')
  const toolbarHeight = Math.ceil(toolbar?.getBoundingClientRect?.().height || 0)
  if (toolbarHeight > 0) stage.style.setProperty('--toolbar-h', `${toolbarHeight}px`)
  const banner = $('previewBanner')
  const bannerHeight = banner.hidden ? 0 : Math.ceil(banner.getBoundingClientRect?.().height || 0)
  stage.style.setProperty('--banner-h', `${bannerHeight}px`)
}

// ── 房内打开资料：介绍＋资料清单＋正文／流程图都在这块面板里 ─────────────

/** 资料条目的稳定身份（与绑定层同口径：文档＝登记路径、流程图＝图 id），只用于标记在读的那份。 */
const materialKey = (entry) => (entry.kind === 'document' ? `doc:${entry.path}` : `chart:${entry.chartId}`)

/** 读资料时暂停漫游输入：不退出探索（机位不回总览），只是不再走动。 */
function pauseWalkForReading() {
  if (!walking || pausedWalk) return
  pausedWalk = Boolean(scene?.pauseWalk?.())
}

/** 是否正在读资料（资料面板开着）：阅读中不许走动，也不许换掉当前读的那份。 */
const isReading = () => !$('materialPanel').hidden

/** 阅读中不许走动：把正按着的屏幕方向按钮松开——人可能正按住走路时点开了资料，
 *  面板外露出的按钮又不再接事件（CSS 收起），不主动松开就会一直走下去。 */
function releaseWalkKeys() {
  for (const button of document.querySelectorAll('[data-walk-key][data-pressed]')) {
    delete button.dataset.pressed
    scene?.walkKey(button.dataset.walkKey, false)
  }
}

/** 关掉面板把焦点还给打开它的那个按钮（目录这时已经回来了）；原处不在了（换蓝图会把目录
 *  整套重建）就退到目录容器上——别把焦点丢在没有落点的地方，也别塞给一个已经脱离文档的
 *  按钮。开面板时焦点本来就不在页面里（body）的不算触发点，那就什么都不动。 */
function restorePanelFocus() {
  const back = panelReturnFocus
  panelReturnFocus = null
  if (!back || back === document.body || typeof back.focus !== 'function') return
  if (back.isConnected) back.focus()
  else $('rooms').focus?.()
}

/** 焦点送回面板里（进探索会把焦点给画布：那是"进去就能敲 WASD"的既有行为，但面板还开着时
 *  不该把人留在阅读之外）。回到面板里最近一次获得焦点的地方，没有就回到关闭按钮。 */
function focusInsidePanel() {
  const target = panelFocusInside?.isConnected ? panelFocusInside : $('materialClose')
  target.focus()
}

/** 关闭资料后只恢复自己暂停的那一次输入：位置与视角都由场景原样保留，人接着原地走。 */
function resumeWalkAfterReading() {
  if (!pausedWalk) return
  pausedWalk = false
  scene?.resumeWalk?.()
}

/** 业务房 → 清单里的资料：门牌、目录卡与面板都取这一份，口径一致。 */
function roomBusiness(spaceId) {
  const room = currentModel?.rooms.find((item) => item.id === spaceId)
  if (!room) return null
  const entries = (room.businessId && currentCatalog.get(room.businessId)?.entries) || []
  return { room, entries }
}

function setPanelHead(kind, title) {
  $('materialKind').textContent = kind
  $('materialTitle').textContent = title
}

function setPanelIntro(text) {
  const intro = $('materialIntro')
  intro.textContent = text || ''
  intro.hidden = !text
}

/** 资料清单：每份资料一个按钮，点了就在右边读（文档＝正文，流程图＝现有阅读页）。 */
function renderMaterialList(entries, emptyText) {
  panelDocuments = entries.filter(entry => entry.kind === 'document')
  const list = $('materialList')
  list.textContent = ''
  list.hidden = entries.length === 0
  $('materialListLabel').hidden = entries.length === 0
  $('materialCount').textContent = entries.length ? `${entries.length} 份` : ''
  const empty = $('materialEmpty')
  empty.hidden = entries.length > 0
  empty.textContent = entries.length ? '' : emptyText
  for (const entry of entries) {
    const item = el('li')
    const button = el('button', 'material-item')
    button.type = 'button'
    button.dataset.kind = entry.kind
    button.dataset.material = materialKey(entry)
    button.textContent = `${entry.kind === 'document' ? '文档' : chartMaterialLabel(entry)} · ${entry.title}`
    button.addEventListener('click', () => openMaterial(entry))
    item.appendChild(button)
    list.appendChild(item)
  }
  markActiveMaterial()
}

function markActiveMaterial() {
  for (const button of document.querySelectorAll('#materialList .material-item')) {
    if (panelMaterialKey && button.dataset.material === panelMaterialKey) button.setAttribute('aria-current', 'true')
    else button.removeAttribute('aria-current')
  }
}

/** 清空阅读区：停掉正在读的阅读页与在途文档请求（换资料、换目标、关面板都走这里）。 */
function clearReader() {
  readSeq += 1
  const body = $('materialReaderBody')
  body.textContent = ''
  body.hidden = true
  const frame = $('materialReaderFrame')
  if (frame.hasAttribute('src')) frame.setAttribute('src', 'about:blank')
  frame.hidden = true
  const status = $('materialReaderStatus')
  status.hidden = true
  status.textContent = ''
  status.dataset.kind = ''
}

/** 阅读区的说明行：kind 为空＝不是错误（正在读取用 info）。 */
function setReaderNote(kind, text) {
  const status = $('materialReaderStatus')
  status.hidden = !text
  status.textContent = text || ''
  status.dataset.kind = kind || ''
}

/** 回到"还没挑资料"的状态（换业务、换项目、关面板都走这里）。 */
function resetReaderHint(text) {
  clearReader()
  panelMaterialKey = ''
  $('materialReaderTitle').hidden = true
  const hint = $('materialReaderHint')
  hint.textContent = text
  hint.hidden = false
  markActiveMaterial()
}

/** 打开一份资料：文档取正文在面板里显示；流程图把现有阅读页装进面板。 */
function openMaterial(entry) {
  if ($('materialReaderBody').contains(document.activeElement)) $('materialClose').focus()
  panelMaterialKey = materialKey(entry)
  markActiveMaterial()
  clearReader()
  const title = $('materialReaderTitle')
  title.textContent = `${entry.kind === 'document' ? '文档' : chartMaterialLabel(entry)} · ${entry.title}`
  title.hidden = false
  $('materialReaderHint').hidden = true
  return isChartMaterial(entry) ? openWorkflowReader(entry) : openDocumentReader(entry)
}

/** 接口失败时优先说后端给的中文原因（JSON 错误体的 error 字段），拿不到再按 HTTP 状态说。 */
async function failureReason(response) {
  try {
    const body = await response.json()
    if (body && typeof body.error === 'string' && body.error) return body.error
  } catch { /* 正文不是 JSON（认证层的纯文本错误页）：按状态码说。 */ }
  return `HTTP ${response.status}`
}

async function openDocumentReader(entry) {
  const seq = readSeq
  setReaderNote('info', '正在读取文档…')
  try {
    const response = await fetch(wsUrl(entry.href))
    if (!response.ok) throw new Error(await failureReason(response))
    const text = await response.text()
    // 面板已经换了目标或又点了别的资料：晚到的正文不写进阅读区。
    if (seq !== readSeq) return
    setReaderNote('', '')
    renderDocumentBody(text, entry)
  } catch (error) {
    if (seq !== readSeq) return
    setReaderNote('bad', `读不到这份资料：${error.message || String(error)}。这份资料来自业务清单登记，修好或重新登记后刷新本页即可。`)
  }
}

/** 流程图用现有阅读页（iframe）：入口就是绑定层装配好的那份，工作区参数由 wsUrl 补齐；
 *  阅读页自己的交互（版本条、节点详情、保存版本）与在独立标签里打开时完全一样。
 *  先自己取一次这个入口再交给 iframe——iframe 导航失败不触发 error 事件（浏览器不用它
 *  报告这类失败，见 panel-link.js 的说明），只把 src 一设就会留下一片空白；
 *  取不到（认证层拒绝、路由 500、图被删）在这里就如实报，取到了则由阅读页按自己那套说法
 *  显示数据问题（图读不开、编号冲突）。 */
async function openWorkflowReader(entry) {
  const seq = readSeq
  const url = wsUrl(entry.href)
  setReaderNote('info', '正在打开阅读页…')
  let response
  try {
    response = await fetch(url)
  } catch (error) {
    if (seq !== readSeq) return
    return setReaderNote('bad', `读不到这份流程图：阅读页没有打开（${error.message || String(error)}）。请检查该图是否还在工作区里，或刷新本页重试。`)
  }
  if (seq !== readSeq) return
  if (!response.ok) {
    const reason = await failureReason(response)
    // 读错误正文也是等待：这期间用户可能又点了别的资料或关掉了面板，
    // 晚到的原因不许写进已经换过的阅读区。
    if (seq !== readSeq) return
    return setReaderNote('bad', `读不到这份流程图：阅读页打不开（${reason}）。请检查该图是否还在工作区里，或刷新本页重试。`)
  }
  if (seq !== readSeq) return
  // 说明留到阅读页 load 再收起：那之前它是"正在打开"，比一片空白诚实。
  const frame = $('materialReaderFrame')
  frame.hidden = false
  frame.setAttribute('src', url)
}

/** 共用Markdown正文；不改变图入口、资料面板或漫游暂停规则。 */
function renderDocumentBody(text, entry) {
  renderMarkdown($('materialReaderBody'), text, { path: entry.path, documents: panelDocuments.map(item => item.path), openDocument: path => {
    const target = panelDocuments.find(item => item.path === path)
    if (target && isReading()) void openMaterial(target)
  } })
}

function showMaterialPanel() {
  const panel = $('materialPanel')
  // 打开面板时焦点在哪儿：多半是目录里的那枚资料按钮，而读资料时目录会被隐藏——
  // 关掉面板要把焦点还回去（键盘用户不该停在一个看不见的按钮上）。
  if (panel.hidden) panelReturnFocus = document.activeElement
  panelFocusInside = null // 上一轮读的那份可能已经不在了：这一轮从关闭按钮重新记
  panel.hidden = false
  // 读资料时目录连开关一起让位：面板是浮在视口上的卡片，目录留在后面只露半截。
  // 这是显示规则（CSS 认 data-reading），不动作者存的展开／收起选择，关掉面板就回来。
  $('buildingStage').dataset.reading = 'true'
  // 阅读中不许走动：正按着的屏幕方向按钮先松开，再停掉漫游输入（暂停只挡键盘与拖动）。
  releaseWalkKeys()
  pauseWalkForReading()
  // 焦点交接：面板里的关闭按钮（面板不是模态，焦点不被困住）。
  $('materialClose').focus()
}

/** 打开业务面板：该业务的介绍与资料清单（业务门牌与房间目录都走这里）。
 *  material 非空时直接读那一份——目录卡里的资料入口点进来就是这种情形。 */
function openBusinessPanel(spaceId, { material = null } = {}) {
  const found = roomBusiness(spaceId)
  if (!found) return
  const floor = currentModel?.floors.find((item) => item.id === found.room.floorId)
  setPanelHead(`业务资料${floor ? ` · ${floor.name}` : ''}`, found.room.name)
  setPanelIntro(found.room.intro || '')
  renderMaterialList(
    found.entries,
    found.room.directory === false ? '资料目录已按蓝图关闭（directory: false）。' : '本业务暂无登记的文档或流程图。',
  )
  resetReaderHint(found.entries.length ? '在左边挑一份资料，正文与流程图都在这里读。' : '这里还没有可读的资料。')
  showMaterialPanel()
  if (material) openMaterial(material)
}

/** 打开项目介绍（项目牌）：项目资料按业务登记，这里如实说去哪儿读。 */
function openProjectPanel() {
  setPanelHead('项目介绍', currentModel?.project?.name || '当前项目')
  setPanelIntro(currentModel?.project?.description || '项目尚未填写介绍。')
  renderMaterialList([], '项目资料按业务登记：走进房间、点业务门牌，就能读该业务的介绍与资料。')
  resetReaderHint('这里只有项目介绍；资料在各业务房间里。')
  showMaterialPanel()
}

/** 点三维里的牌子：业务门牌打开该业务的介绍与资料清单，项目牌打开项目介绍。
 *  探索中点门牌不退出探索——只是暂停输入，关掉面板原地接着走。 */
function openSignTarget({ spaceId } = {}) {
  if (spaceId) openBusinessPanel(spaceId)
  else openProjectPanel()
}

/** 关掉资料面板：停掉在途请求与阅读页，恢复漫游输入——位置与视角都不动，人接着原地走。 */
function closeMaterialPanel() {
  const panel = $('materialPanel')
  if (panel.hidden) return
  resetReaderHint('在左边挑一份资料，正文与流程图都在这里读。')
  panel.hidden = true
  delete $('buildingStage').dataset.reading
  resumeWalkAfterReading()
  // 恢复输入会把焦点给画布；键盘用户是从哪枚按钮进来的就还回哪儿（目录这时已经回来了）。
  restorePanelFocus()
}

/** 进入／退出探索。进入前恢复全部楼层：剖看藏住构件、碰撞数据却仍是整套，两者必须一致。
 *  界面以场景的实际模式为准（场景自己也会在模式变化时通知一次），这里不写死方向；
 *  进不去（入口站不住／没有行走面）由场景的 onWalkBlocked 说明，页面不再另报。 */
function onWalkToggle() {
  if (!scene) return
  if (walking) scene.exitWalk()
  else if (!scene.enterWalk()) return
  syncWalkUi(scene.getMode() === 'walk')
  if (walking) $('floor').value = 'all'
  // 读资料时点「进入探索」：模式可以切（进去看看房子也行），但人不许走——进探索会把输入
  // 打开，这里立刻按阅读状态收回来，关掉面板再恢复；进探索还会把焦点给画布，面板仍开着时
  // 要把焦点送回面板里。
  if (walking && isReading()) {
    pauseWalkForReading()
    focusInsidePanel()
  }
}

async function renderScene(present) {
  const handle = await ensureScene()
  if (handle) handle.show({ model: currentModel, present })
  // show 内部机位与楼层会复位，这里把用户当前选择的楼层重新应用上。
  handle?.setFloor($('floor').value || 'all')
}

/** 尚未有蓝图：如实给空状态（放哪里、是什么、管理页不会自动创建）。 */
function renderNoBlueprint(error) {
  setStatus('还没有建筑蓝图', 'warn')
  const box = $('guideBox')
  box.hidden = false
  box.textContent = ''
  const h = el('h2')
  h.textContent = '这个项目还没有建筑蓝图'
  box.appendChild(h)
  if (error.repo) {
    document.title = pageTitle('还没有建筑蓝图', error.repo)
    const w = el('p')
    w.textContent = repoLineText(error.repo)
    box.appendChild(w)
  }
  const p = el('p')
  p.textContent = error.message
  box.appendChild(p)
  const what = el('p')
  what.textContent = '蓝图是一份 JSON，描述楼层、房间、门窗与屋顶的空间安排；业务身份、介绍与资料仍以项目清单为准。'
  box.appendChild(what)
  const note = el('p')
  note.textContent = '管理页只读不改，不会自动创建这份文件。'
  box.appendChild(note)
}

/** 核对或几何有问题：列出全部诊断（error 在前），不建三维场景。 */
function renderDiagnostics(data) {
  setStatus('不能生成建筑', 'bad')
  const box = $('diagnosticsPanel')
  box.hidden = false
  const list = $('problemList')
  list.textContent = ''
  const ordered = [...data.problems].sort(
    (a, b) => (a.severity === 'error' ? 0 : 1) - (b.severity === 'error' ? 0 : 1),
  )
  for (const problem of ordered) {
    const item = el('li', 'problem-item')
    item.dataset.severity = problem.severity
    const code = el('span', 'problem-code')
    code.textContent = `[${problem.code}]`
    const message = el('span', 'problem-message')
    message.textContent = problem.message
    item.append(code, message)
    if (problem.subject && problem.subject.path) {
      const path = el('code', 'problem-path')
      path.textContent = problem.subject.path
      item.appendChild(path)
    }
    list.appendChild(item)
  }
}

/** 生成成功但带 warning（楼梯舒适度、无屋顶建议等）：目录面板里的可折叠提示。
 *  数据整套换版时这里会重跑：新数据没有 warning 要把旧提示收起来，不能沿用上一版的。 */
function renderNotices(data) {
  const warnings = data.problems.filter((problem) => problem.severity === 'warning')
  $('notices').hidden = !warnings.length
  if (!warnings.length) return
  $('notices').hidden = false
  $('noticeCount').textContent = `${warnings.length} 条`
  const list = $('noticeList')
  list.textContent = ''
  for (const warning of warnings) {
    const item = el('li')
    item.textContent = warning.message
    list.appendChild(item)
  }
}

/** 房间目录：业务房按楼层自下而上排列；每间房的资料在房内面板里读（保留 workspace）。 */
function renderDirectory(data) {
  const model = data.model
  const floorOrder = new Map(model.floors.map((floor, index) => [floor.id, index]))
  const floorName = new Map(model.floors.map((floor) => [floor.id, floor.name]))
  // 楼层高低按实际标高判断：生成器输出的 floors 按 ID 字典序排列，数组下标不代表高度
  // （底层叫 z-ground、二层叫 a-upper 时二层排在前面）；场景过滤也按 y/elevation 比较。
  const floorLevel = new Map(model.floors.map((floor) => [floor.id, floor.y ?? floor.elevation ?? 0]))
  const catalogByBusiness = new Map(data.catalog.businesses.map((business) => [business.businessId, business]))
  // 面板读的资料与目录卡同源：换版时这份清单整套换掉，旧资料在重建目录之后关掉
  // （那时触发它的那枚旧按钮已经脱离文档，焦点交接会退到目录容器上，见 restorePanelFocus）。
  currentCatalog = catalogByBusiness
  const rooms = [...model.rooms].sort(
    (a, b) => (floorOrder.get(a.floorId) ?? 0) - (floorOrder.get(b.floorId) ?? 0) || (a.id < b.id ? -1 : 1),
  )
  document.title = pageTitle(`${model.project.name} · 建筑总览`, data.repo)
  $('projectName').textContent = model.project.name
  $('projectDesc').textContent = model.project.description || '项目尚未填写介绍。'
  const entryCount = data.catalog.businesses.reduce((sum, business) => sum + business.entries.length, 0)
  $('metrics').textContent = `${rooms.length} 个业务房间 · ${model.floors.length} 层 · ${entryCount} 个资料入口`
  const [phaseLabel, phaseNote] = PHASE_LABELS[model.construction.phase] || [model.construction.phase, '']
  $('phaseLabel').textContent = `当前建造阶段：${phaseLabel}`
  $('phaseNote').textContent = phaseNote
  const list = $('rooms')
  list.textContent = ''
  for (const room of rooms) {
    const card = el('div', 'room-card')
    card.dataset.space = room.id
    card.dataset.business = room.businessId ?? ''
    const head = el('div', 'room-head')
    const title = el('span', 'room-title')
    title.textContent = room.name
    const meta = el('span', 'room-meta')
    const width = room.bounds.x1 - room.bounds.x0
    const depth = room.bounds.z1 - room.bounds.z0
    meta.textContent = `${floorName.get(room.floorId) || room.floorId} · ${width.toFixed(1)} × ${depth.toFixed(1)} m`
    head.append(title, meta)
    card.appendChild(head)
    if (room.intro) {
      const intro = el('p', 'room-intro')
      intro.textContent = room.intro
      card.appendChild(intro)
    }
    const catalog = catalogByBusiness.get(room.businessId ?? '')
    const entries = catalog?.entries ?? []
    if (entries.length) {
      const box = el('ul', 'room-entries')
      for (const entry of entries) {
        const item = el('li')
        // 清单里的每份资料都在房内面板里读（文档＝正文，流程图＝现有阅读页）；
        // 按钮而不是外链：资料不再甩到新标签，读的地方就是人正站着的地方。
        const button = el('button', 'room-entry')
        button.type = 'button'
        button.dataset.kind = entry.kind
        button.textContent = `${entry.kind === 'document' ? '文档' : '流程图'} · ${entry.title}`
        button.addEventListener('click', (event) => {
          event.stopPropagation()
          openBusinessPanel(room.id, { material: entry })
        })
        item.appendChild(button)
        box.appendChild(item)
      }
      card.appendChild(box)
    } else {
      const empty = el('p', 'room-empty')
      empty.textContent = room.directory === false ? '资料目录已按蓝图关闭（directory: false）' : '本业务暂无登记的文档或流程图'
      card.appendChild(empty)
    }
    card.addEventListener('click', (event) => {
      if (event.target.closest('a, button')) return
      // 探索中点目录卡：只把这间房的资料原地打开——不退出探索、不挪机位，关掉面板人还在
      // 原地接着走。"定位房间"（机位挪到房间斜上方）是总览模式的单独操作：走动着点一下
      // 卡片就被送回总览、还被迫重新进入探索，那不是"逛到哪里读到哪里"。
      if (!walking) {
        // 定位的房间必须看得见：当前楼层剖看把目标层藏住时（"X层及以下"只显示到所选标高），
        // 先把剖看切回全部楼层（下拉框与场景同步），再移机位——否则只有镜头动了、房间仍然隐藏。
        // 高低用标高比较，与场景过滤同口径。
        const selected = $('floor').value || 'all'
        if (selected !== 'all' && (floorLevel.get(room.floorId) ?? 0) > (floorLevel.get(selected) ?? 0)) {
          $('floor').value = 'all'
          scene?.setFloor('all')
        }
        scene?.focusSpace(room.id)
      }
      openBusinessPanel(room.id)
    })
    list.appendChild(card)
  }
  const select = $('floor')
  select.textContent = ''
  const all = el('option')
  all.value = 'all'
  all.textContent = '全部楼层'
  select.appendChild(all)
  for (const floor of model.floors) {
    const option = el('option')
    option.value = floor.id
    option.textContent = `${floor.name}及以下`
    select.appendChild(option)
  }
  // 目录重建完再关旧资料：此时的触发按钮已不在文档里，焦点交接走"退到目录容器"那一路。
  closeMaterialPanel()
}

let currentModel = null
let framePresent = null
let previewPresent = null
// 预览开关代次：等待接口返回期间开关又动过（代次对不上）的响应一律丢弃——
// 晚到的旧响应不许改写现状（勾选框已翻回去、横幅已隐藏时场景不能被覆盖成另一套表现）。
let previewToggleSeq = 0
// 当前页面所依据的数据指纹（model＋catalog）：预览接口每次都重新读蓝图与清单，
// 指纹对不上说明蓝图或清单已被修改，页面要整套换到新数据——不能把新表现拼在旧目录上。
let dataVersion = ''

/** 目录与三维共用一份数据：指纹取 model＋catalog（楼层、门牌、目录、资料入口都出自它们）。 */
function dataFingerprint(payload) {
  return JSON.stringify({ model: payload.model, catalog: payload.catalog })
}

async function main() {
  if (workspaceParamEmpty) return renderEmptyWorkspaceParam()
  let data
  try {
    data = await fetchJson(wsUrl('/specdev-workbench/api/building?view=frame'))
  } catch (error) {
    if (renderRepoState(error)) {
      if (error.repo) renderRepoLine(error.repo)
      return
    }
    if (error.code === 'no-building-blueprint') return renderNoBlueprint(error)
    return showError(error.message || String(error))
  }
  if (data && data.code === 'repo-not-configured') return renderGuide(data)
  if (!data.ok || !data.model) return renderDiagnostics(data)
  if (data.repo) renderRepoLine(data.repo)

  currentModel = data.model
  framePresent = data.present
  dataVersion = dataFingerprint(data)
  renderDirectory(data)
  renderNotices(data)
  setStatus(`已生成 · ${modelPhaseLabel(data.model)}`, 'ok')
  $('buildingStage').hidden = false
  // 舞台现身＝整页切到全窗口形态（CSS 认这个类），目录回到作者上次的选择。
  document.body.classList.add('building-live')
  setDirectoryOpen(directoryOpen, { persist: false })
  syncLayoutMetrics()
  // 操作行会随窗口宽度换行、随字号变高，横幅会随文字折行：都盯着，抽屉与卡片才不会压住它们。
  if (typeof ResizeObserver === 'function') {
    const observer = new ResizeObserver(syncLayoutMetrics)
    observer.observe(document.querySelector('.view-toolbar'))
    observer.observe($('previewBanner'))
  }
  await renderScene(data.present)

  $('floor').addEventListener('change', (event) => {
    // 剖看与漫游对不上（构件被藏住、碰撞仍是整套）：先退出探索再剖看；
    // 场景内部对非"全部楼层"也有同样的兜底，两层都留着，避免漏改一处就出现看得见走不过去。
    if (walking) scene?.exitWalk()
    scene?.setFloor(event.target.value || 'all')
  })
  $('resetView').addEventListener('click', () => scene?.resetView())
  $('preview').addEventListener('change', onPreviewChange)
  $('walkToggle').addEventListener('click', onWalkToggle)
  $('directoryToggle').addEventListener('click', onDirectoryToggle)
  $('materialClose').addEventListener('click', closeMaterialPanel)
  // 面板里的焦点走到哪儿记一笔：进探索夺走焦点后要送回来（见 focusInsidePanel）。
  $('materialPanel').addEventListener('focusin', (event) => { panelFocusInside = event.target })
  // 焦点在面板里的阅读页时 ESC 到不了本页：由阅读页把"关面板"转过来（panel-link.js）。
  listenMaterialClose(window, $('materialReaderFrame'), closeMaterialPanel)
  // 本页自己这一层的 ESC 关面板（与节点详情弹层同一种收尾方式）；面板没开时不抢 ESC。
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || $('materialPanel').hidden) return
    event.preventDefault()
    closeMaterialPanel()
  })
  // 阅读页导航成功会触发 load：收起"正在打开阅读页…"这条进行中的说明。
  // 只收进行中的说明，不动读文档失败那类报错。
  $('materialReaderFrame').addEventListener('load', () => {
    if ($('materialReaderFrame').hidden) return
    if ($('materialReaderStatus').dataset.kind === 'info') setReaderNote('', '')
  })
  // 屏幕方向按钮：按住即走；松开、取消或被系统收走指针都当松手。读资料时一律不生效
  // （面板外的按钮还看得见，但不许让人物动起来；停用期间场景那一层也不收虚拟按键）。
  for (const button of document.querySelectorAll('[data-walk-key]')) {
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault()
      if (isReading()) return
      button.setPointerCapture?.(event.pointerId)
      button.dataset.pressed = 'true'
      scene?.walkKey(button.dataset.walkKey, true)
    })
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      button.addEventListener(name, () => {
        delete button.dataset.pressed
        scene?.walkKey(button.dataset.walkKey, false)
      })
    }
  }
}

function modelPhaseLabel(model) {
  return (PHASE_LABELS[model.construction.phase] || [model.construction.phase])[0]
}

/** 完整外观预览：明确标注、独立于建造状态；表现由服务端按 view 算好，页面只切换。
 *  目标视图没有缓存时取接口；返回的数据与页面当前不是同一版（蓝图被改过）就整套换版；
 *  取用失败把开关翻回实际显示着的那套视图。 */
async function onPreviewChange() {
  const seq = ++previewToggleSeq
  const checked = $('preview').checked
  $('previewBanner').hidden = !checked
  const rollback = () => {
    $('preview').checked = !checked
    $('previewBanner').hidden = checked
    setStatus(checked ? '预览取用失败' : '当前阶段视图取用失败', 'bad')
  }
  if ((checked && !previewPresent) || (!checked && !framePresent)) {
    let payload
    try {
      setStatus(checked ? '正在取完整外观…' : '正在重取当前阶段…')
      payload = await fetchJson(wsUrl(checked ? '/specdev-workbench/api/building?view=preview' : '/specdev-workbench/api/building?view=frame'))
    } catch (error) {
      if (seq !== previewToggleSeq) return
      rollback()
      showError(error.message || String(error))
      return
    }
    // 晚到的成功响应在动任何状态之前核对代次：换版会改写目录与两份缓存，事后退出撤不回
    // 这些修改（等待预览→取消→响应带着新蓝图回来，就会目录已换版、场景停在旧版）。
    if (seq !== previewToggleSeq) return
    if (!payload || payload.code === 'repo-not-configured' || !payload.ok || !payload.model || !payload.present) {
      if (seq !== previewToggleSeq) return
      rollback()
      showError(payload?.error || payload?.problems?.[0]?.message || '视图取用失败')
      return
    }
    if (dataFingerprint(payload) !== dataVersion) {
      // 蓝图或清单已更新：目录、楼层与两份表现缓存整套换到这份新数据，旧缓存一并作废。
      currentModel = payload.model
      dataVersion = dataFingerprint(payload)
      renderDirectory(payload)
      renderNotices(payload)
      previewPresent = null
      framePresent = null
    }
    if (checked) previewPresent = payload.present
    else framePresent = payload.present
  }
  if (seq !== previewToggleSeq) return
  await renderScene(checked ? previewPresent : framePresent)
  if (seq !== previewToggleSeq) return
  setStatus(checked ? `完整外观预览 · 不代表当前阶段（${modelPhaseLabel(currentModel)}）` : `已生成 · ${modelPhaseLabel(currentModel)}`, checked ? 'warn' : 'ok')
}

main()

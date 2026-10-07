// 业务房间页逻辑（P1b-2）：从业务页进入，读 /api/room 拿该业务的 room.json，
// 用插件固定资源（模板＋占位目录＋家具库）选模板，交给产品 placement 校验，
// 只有校验通过（ok:true）才准备家具批次并交给场景模块——页面不自己算几何、
// 不建 Three.js 对象、不静态导入 furniture-assembly。
// 数据到场景的唯一链路：URL 业务 ID → API 配置 → 固定模板/目录（占位＋正式合并）→
// validatePlacement → prepareRoomFurniture → 场景。
// 本轮只有初次装载：改配置后刷新页面即重新读取；不做页内切换、热更新或全局缓存。
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
  pageTitle,
  setStatus,
  showError,
} from './common.js'
import { validatePlacement } from './rooms/placement.js'
import { resolveRoomBindings } from './rooms/bindings.js'
import { createRoomReader } from './rooms/reader.js'
import { normalizeBrightness } from './rooms/brightness.js'
import { loadFurnitureCatalog } from './furniture/catalog.js'
import { offlineRuntime } from './runtime-mode.js'
import {createRoomExporter} from './rooms/export.js'

// 模板与占位目录是插件固定资源：不从 query、room.json 或外部 URL 替换。
const ASSET_BASE = '/specdev-workbench/assets/rooms'

// 底座风格字幕（2026-09-28 作者令保留并照抄旧页样式）：文案逐字来自旧底座实验页面
//（experiments/2026-09-27-空房间风格底座，作者圈定保留；按作者令去掉数字编号 01／02），
// 按 template.styleId 分派；童话文案随昼夜变化；陶瓷在低亮档显示微光标签。
const BASE_COPY = {
  ceramic: {
    eyebrow: { day: '陶瓷 · 日光', night: '陶瓷 · 微光' },
    title: '釉白之间',
    desc: { day: ['让光落在地面上，', '也让空间慢下来。'] },
    material: '珍珠釉面 / 暖白灰泥',
  },
  fairy: {
    eyebrow: { day: '森林 · 晴昼', night: '森林 · 星夜' },
    title: '林间来信',
    desc: { day: ['风经过藤蔓，', '留下一个安静的下午。'], night: ['月亮升起时，', '小小的光开始游走。'] },
    material: '奶油灰泥 / 蜂蜜木 / 苔藓',
  },
}

// 仅当前页面会话；文案/模式/昼夜刷新不覆盖作者选择，不写持久配置。
let captionExpanded = true
let helpExpanded = false
let toolbarExpanded = true
let controlsReady = false
let brightnessExpanded = false
const brightnessListeners = []
function syncBrightnessPanel() {
  document.body.dataset.brightnessOpen = String(brightnessExpanded)
  $('brightnessPanel').hidden = !brightnessExpanded
  $('brightnessPanel').toggleAttribute('inert', !brightnessExpanded)
  $('brightnessToggle').setAttribute('aria-expanded', String(brightnessExpanded))
}
function closeBrightness() {
  if ($('brightnessPanel').contains(document.activeElement)) $('brightnessToggle').focus()
  brightnessExpanded = false
  syncBrightnessPanel()
}
function renderBrightness(styleId, state) {
  if (!pageAlive || !state) return
  $('brightnessSlider').value = String(state.value)
  $('brightnessValue').textContent = String(Math.round(state.value))
  document.body.style.setProperty('--room-light', `${state.value}%`)
  renderCaption(styleId, state.period)
}
function syncToolbarVisibility() {
  const actions = $('toolbarActions')
  actions.hidden = !toolbarExpanded
  actions.toggleAttribute('inert', !toolbarExpanded)
  $('toolbarToggle').setAttribute('aria-expanded', String(toolbarExpanded))
  $('toolbarToggle').setAttribute('aria-label', toolbarExpanded ? '收起房间工具栏' : '展开房间工具栏')
  $('toolbarArrow').textContent = toolbarExpanded ? '←' : '→'
}
function syncCaptionVisibility() {
  $('styleCaption').hidden = !controlsReady || !captionExpanded
  $('captionToggle').setAttribute('aria-expanded', String(captionExpanded))
  $('captionToggle').textContent = captionExpanded ? '收起介绍' : '房间介绍'
}
function setExtraControlsDisabled(disabled) {
  for (const id of ['toolbarToggle', 'captionToggle', 'helpToggle', 'brightnessToggle', 'brightnessSlider', 'roomExport']) $(id).disabled = disabled
}
function wireSceneInformation() {
  $('toolbarToggle').addEventListener('click', () => {
    if (!pageAlive || !controlsReady || scene?.isReading()) return
    toolbarExpanded = !toolbarExpanded
    if (!toolbarExpanded) {
      if ($('toolbarActions').contains(document.activeElement)) $('toolbarToggle').focus()
      helpExpanded = false
      $('sceneHelp').hidden = true
      $('helpToggle').setAttribute('aria-expanded', 'false')
    }
    syncToolbarVisibility()
  })
  $('captionToggle').addEventListener('click', () => {
    if (!pageAlive || !controlsReady || !toolbarExpanded || scene?.isReading()) return
    captionExpanded = !captionExpanded
    if (!captionExpanded && $('styleCaption').contains(document.activeElement)) $('captionToggle').focus()
    syncCaptionVisibility()
  })
  $('helpToggle').addEventListener('click', () => {
    if (!pageAlive || !controlsReady || !toolbarExpanded || scene?.isReading()) return
    helpExpanded = !helpExpanded
    $('sceneHelp').hidden = !helpExpanded
    $('helpToggle').setAttribute('aria-expanded', String(helpExpanded))
  })
  syncToolbarVisibility()
  setExtraControlsDisabled(false)
}
function showSceneNotice(text = '') {
  $('sceneHint').textContent = text
  $('sceneHint').hidden = !text
}

/** 字幕一行或多行（行间用 DOM 换行，不拼 HTML）。 */
function renderLines(node, lines) {
  node.textContent = ''
  for (const [index, line] of lines.entries()) {
    if (index > 0) node.appendChild(document.createElement('br'))
    node.appendChild(document.createTextNode(line))
  }
}

/** 按风格与昼夜填字幕块；文案是产品静态文案，不掺业务数据。
 *  body[data-style]/[data-period] 供 room.css 切换旧页同款变量（含童话星夜配色）。 */
function renderCaption(styleId, period) {
  document.body.dataset.style = styleId
  document.body.dataset.period = period
  const copy = BASE_COPY[styleId]
  if (!copy) return
  $('captionEyebrow').textContent = typeof copy.eyebrow === 'string' ? copy.eyebrow : copy.eyebrow[period]
  $('captionTitle').textContent = copy.title
  renderLines($('captionDesc'), copy.desc[period] ?? copy.desc.day)
  $('captionMaterial').textContent = copy.material
  syncCaptionVisibility()
}

/** 亮度控件独立于左工具栏；控件事件不进入画布/行走键盘监听。 */
function wireBrightness(scene, styleId) {
  const listen = (target, type, fn) => { target.addEventListener(type, fn); brightnessListeners.push({ target, type, fn }) }
  const canAdjust = () => pageAlive && controlsReady && !scene.isReading()
  const choose = (value) => {
    if (!canAdjust() || !brightnessExpanded) return
    scene.setBrightness(normalizeBrightness(value))
    renderBrightness(styleId, scene.getBrightness())
  }
  listen($('brightnessToggle'), 'click', () => {
    if (!canAdjust()) return
    if (brightnessExpanded) closeBrightness()
    else { brightnessExpanded = true; syncBrightnessPanel() }
  })
  listen($('brightnessSlider'), 'input', (event) => choose(Number(event.target.value)))
  listen($('brightnessControls'), 'pointerdown', (event) => { event.stopPropagation(); if (canAdjust()) scene.clearControlInput() })
  listen($('brightnessControls'), 'focusin', () => { if (canAdjust()) scene.clearControlInput() })
  listen($('brightnessControls'), 'keydown', (event) => {
    event.stopPropagation()
    if (!canAdjust()) return
    if (event.key === 'Escape') { event.preventDefault(); closeBrightness(); $('brightnessToggle').focus(); return }
    if (event.target !== $('brightnessSlider') || !brightnessExpanded) return
    const value = Number(event.target.value)
    const next = { ArrowLeft: value - 1, ArrowDown: value - 1, ArrowRight: value + 1, ArrowUp: value + 1, Home: 0, End: 100 }[event.key]
    if (next === undefined) return
    event.preventDefault(); choose(next)
  })
  syncBrightnessPanel()
  renderBrightness(styleId, scene.getBrightness())
}

// 普通指南只更新帮助正文；门失败单独留在可见的 live 状态行。
const WALK_HINT = 'WASD／方向键走动 · Shift 加速 · 拖动环视 · 点家具看身份'
const OVERVIEW_HINT = '拖动旋转 · 滚轮缩放 · 点家具看身份'

/** 从会话状态同步按钮态与提示：门按钮文案跟随返回后的实际 doorOpen；
 *  当前模式的按钮禁用（已在行走就没有"继续行走"可点）。 */
function syncWalkUI(scene) {
  const state = scene.getWalkState()
  const walking = state.mode === 'walk'
  $('enterWalk').disabled = walking
  $('resetView').disabled = !walking
  $('doorToggle').disabled = false
  $('doorToggle').textContent = state.doorOpen ? '关门' : '开门'
  $('sceneHelp').textContent = walking ? WALK_HINT : OVERVIEW_HINT
  showSceneNotice()
}

/** 行走／总览／门按钮（P1c-2c-2）：页面只调场景句柄，不直接碰门、导航或人物位置；
 *  也不每帧改 DOM——只在点击与初始化时同步一次。
 *  E3b-2 起阅读中回调一律无操作（按钮已禁用、视口已 inert，这里再挡一层，
 *  不只靠 CSS 遮住）；门防夹语义不动。 */
function wireWalkControls(scene) {
  $('resetView').addEventListener('click', () => {
    if (!pageAlive || !controlsReady || !toolbarExpanded || scene?.isReading()) return
    scene?.resetView()
    if (scene) syncWalkUI(scene)
  })
  $('enterWalk').addEventListener('click', () => {
    if (!pageAlive || !controlsReady || !toolbarExpanded || scene?.isReading()) return
    scene?.enterWalk()
    if (scene) syncWalkUI(scene)
  })
  $('doorToggle').addEventListener('click', () => {
    if (!pageAlive || !controlsReady || !toolbarExpanded || !scene || scene.isReading()) return
    const open = !scene.getWalkState().doorOpen
    let result
    try {
      result = scene.setDoorOpen(open)
    } catch (error) {
      showSceneNotice(`门切换没有完成：${error instanceof Error ? error.message : String(error)}`)
      return
    }
    if (result.ok) {
      syncWalkUI(scene)
      return
    }
    if (result.code === 'door-blocked-by-player') {
      showSceneNotice(`站位挡住了门板，请先离开门边，再${open ? '开' : '关'}门。`)
      return // 拒绝时门没动：按钮文案保持原样
    }
    showSceneNotice('门切换没有完成，请再试一次。')
  })
  syncWalkUI(scene)
}

/**
 * 场景模块按需动态加载：空态、错误与诊断页不拉 Three.js。
 * 加载口可注入（页面回归在 jsdom 里替换它，动态 import 在那里不可用）；
 * 生产路径用浏览器动态 import，importmap 解析裸名 'three'（与建筑页同模式）。
 */
function loadSceneModule() {
  if (typeof globalThis.__loadRoomScene === 'function') return globalThis.__loadRoomScene()
  if (offlineRuntime()) return offlineRuntime().loadScene()
  return import('/specdev-workbench/assets/room-scene.js')
}

function businessIdFromLocation() {
  if (offlineRuntime()) return offlineRuntime().businessId
  const parts = location.pathname.split('/').filter(Boolean) // ['specdev-workbench','room','<id>']
  return decodeURIComponent(parts[2] || '')
}

let scene = null
let reader = null
let exporter = null
// 真正离开页面后，晚到的数据/模块不许再创建场景；进入往返缓存（bfcache，
// pagehide.persisted=true）只是冻结：不终止异步链、不销毁场景——恢复的页面
// 脚本不会重跑，若在这里置了终止标记，加载中的页面回来后就永久停在加载状态。
// 阅读面板同口径：冻结时不销毁 reader（面板照常开着），真正离开先 reader.dispose
// （使请求与监听失效，不触发 setReading(false)——离页不该重新启用场景）再走场景释放。
let pageAlive = true
let brightnessFrozen = false
let initialBrightness = offlineRuntime()?.brightness ?? (window.SpecDevTheme.get().mode === 'light' ? 100 : 0)
let stopTheme = window.SpecDevTheme.subscribe((state) => {
  if (!pageAlive || brightnessFrozen) return
  initialBrightness = state.mode === 'light' ? 100 : 0
  scene?.setInitialBrightness(initialBrightness)
})
function stopInitialTheme() { brightnessFrozen = true; stopTheme?.(); stopTheme = null }

window.addEventListener('pagehide', (event) => {
  exporter?.close(event.persisted)
  if (event.persisted) return
  pageAlive = false
  stopInitialTheme()
  for (const { target, type, fn } of brightnessListeners) target.removeEventListener(type, fn)
  brightnessListeners.length = 0
  controlsReady = false
  setExtraControlsDisabled(true)
  reader?.dispose()
  exporter?.dispose()
  scene?.dispose()
  scene = null
})

/** 场景建不起来（资源下载、动态导入、WebGL 创建失败）：结束加载状态并说明原因，返回链接不受影响。 */
function showSceneFailure(reason) {
  stopInitialTheme()
  controlsReady = false
  setExtraControlsDisabled(true)
  syncCaptionVisibility()
  reader?.dispose()
  exporter?.dispose()
  scene?.dispose()
  scene = null
  document.body.classList.remove('room-live')
  setStatus('房间暂时无法显示', 'bad')
  $('roomStage').hidden = false
  $('sceneFallback').hidden = false
  $('sceneFallbackReason').textContent = reason instanceof Error ? reason.message : String(reason)
}

/** 点击家具的身份一行：textContent 填充，业务数据里的 HTML 字符按文字显示。 */
function showPick({ instanceId, assetId, name }) {
  const info = $('pickInfo')
  info.hidden = false
  info.textContent = `${name} · 实例 ${instanceId} · 资产 ${assetId}`
}

/** 家具资料绑定有误（E3b-2）：不装任何家具阅读动作，场景照常创建；
 *  这里给出提示与可展开诊断（code、fieldPath、实例、中文原因，全 textContent）。 */
function showBindingNote(diagnostics) {
  const note = $('bindingNote')
  note.hidden = false
  const list = $('bindingDiagList')
  list.textContent = ''
  for (const item of diagnostics) {
    const li = el('li')
    const head = el('p', 'diag-code')
    const who = (item.instanceIds ?? []).join(' ')
    head.textContent = `${item.code}${who ? ` · ${who}` : ''}${item.fieldPath ? ` · ${item.fieldPath}` : ''}`
    const body = el('p')
    body.textContent = item.message
    li.append(head, body)
    list.append(li)
  }
}

/** 阅读暂停与恢复（E3b-2）：只经场景句柄 setReading，不用 resetView／enterWalk 恢复。
 *  进入阅读：停用三个场景按钮并给背景视口加 inert（面板在 viewport 外，不受波及）；
 *  退出阅读：先撤 inert，再按当前模式经既有 syncWalkUI 恢复按钮态（不整体设 enabled）。 */
function handleReadingChange(reading) {
  if (!scene) return
  scene.setReading(reading)
  if (reading) {
    closeBrightness()
    $('viewport').setAttribute('inert', '')
    $('enterWalk').disabled = true
    $('resetView').disabled = true
    $('doorToggle').disabled = true
    setExtraControlsDisabled(true)
    return
  }
  $('viewport').removeAttribute('inert')
  renderBrightness(document.body.dataset.style, scene.getBrightness())
  setExtraControlsDisabled(false)
  syncWalkUI(scene)
}

/** "业务资料"入口（E3b-2；E9c 起含流程图）：只使用 resolver 交付的 directory，不从原始
 *  business.docs/business.charts 另造未校验链接；directory 为 null（业务输入坏）时如实
 *  说明并指向绑定诊断。 */
function wireBizDocs({ directory, emptyText }) {
  $('bizDocs').disabled = false
  $('bizDocs').addEventListener('click', () => {
    if (!pageAlive || !controlsReady || !toolbarExpanded || scene?.isReading() || reader?.isOpen()) return
    reader.open({ title: '业务资料', entries: directory ?? [], emptyText, returnFocus: $('bizDocs') })
  })
}

/** 摆放校验／家具目录没过：完整列出 code、涉及实例/目标、字段路径与中文原因；不渲染半份家具、不建场景。 */
function showDiagnostics(diagnostics) {
  setStatus('房间布置未通过校验', 'bad')
  $('diagPanel').hidden = false
  const list = $('diagList')
  list.textContent = ''
  for (const item of diagnostics) {
    const li = el('li')
    const head = el('p', 'diag-code')
    const who = (item.instanceIds ?? []).join(' ')
    head.textContent = `${item.code}${who ? ` · ${who}` : ''}${item.targetId ? ` → ${item.targetId}` : ''}${item.fieldPath ? ` · ${item.fieldPath}` : ''}`
    const body = el('p')
    body.textContent = item.message
    li.append(head, body)
    list.append(li)
  }
}

/** 家具库读取失败（E4b-2）：同一诊断面板列出 code／fieldPath／中文原因；不建场景、
 *  不静默只渲染占位家具——正式家具配置读不到时如实说明。 */
function showLibraryFailure(diagnostics) {
  showDiagnostics(diagnostics)
  setStatus('家具目录读取失败', 'bad')
}

/** 占位目录容器形状不合法（E4b-2 补齐）：同一诊断面板列出 CATALOG_INPUT／字段路径／
 *  中文原因与资源来源；不建场景、不静默跳过占位家具——目录容器坏了如实说明。 */
function showCatalogInputFailure(fieldPath) {
  showDiagnostics([{
    code: 'CATALOG_INPUT',
    fieldPath,
    message: `占位目录必须是带 assets 数组的对象（资源来源：插件固定占位目录 ${ASSET_BASE}/placeholder-catalog.json）`,
  }])
}

async function main() {
  $('loadingBack').href = wsUrl('/specdev-workbench/')
  if (workspaceParamEmpty) return renderEmptyWorkspaceParam()
  const id = businessIdFromLocation()
  if (!id) return showError('缺少业务 id（路径应为 /specdev-workbench/room/<业务id>）')
  // 返回业务页的链接先绑好（带工作区标识）：读取失败、场景失败时都要能点回去。
  // 面包屑那份在页头；全窗口形态下页头隐藏，工具条里的返回入口常驻（同一地址）。
  const backHref = wsUrl(`/specdev-workbench/business/${encodeURIComponent(id)}`)
  $('bizLink').href = backHref
  $('bizLink').textContent = '业务'
  $('backLink').href = backHref
  $('loadingBack').href = backHref
  $('loadingBack').textContent = '返回业务页'

  let data
  try {
    data = await fetchJson(wsUrl(`/specdev-workbench/api/room?business=${encodeURIComponent(id)}`))
  } catch (error) {
    if (!pageAlive) return // 真正离开后的晚到失败只清理，不改写已离开的页面（对齐 prepare 守卫口径）
    if (renderRepoState(error)) return
    if (error.code === 'no-room-layout') {
      setStatus('尚未配置房间', 'warn')
      const box = $('errorBox')
      box.hidden = false
      box.textContent = `此业务尚未配置房间（${error.message}）。管理页只读，不会自动创建配置；可从上面的「业务」链接返回。`
      return
    }
    return showError(error.message)
  }
  if (!pageAlive) return // 成功返回也一样：先判存活，再渲染 repo-not-configured 等早退
  if (data.code === 'repo-not-configured') return renderGuide(data)

  renderRepoLine(data.repo)
  document.title = pageTitle(`${data.business.name} · 房间`, data.repo)
  $('title').textContent = `${data.business.name}的房间`
  $('intro').textContent = data.business.intro || '按 room.json 配置显示的独立房间：底座与家具。'
  setStatus('正在核对房间布置…', 'info')

  // 固定资源：模板与占位目录只从插件固定地址读取；家具库目录（E4b-2）经真实
  // loadFurnitureCatalog 读取——固定静态资源，不加工作区参数、不接受外部目录地址。
  let templates, placeholderCatalog, furnitureLibrary
  $('roomLoadingPhase').textContent = '核对房间布置…'
  try {
    ;[templates, placeholderCatalog, furnitureLibrary] = await Promise.all([
      fetchJson(`${ASSET_BASE}/templates.json`),
      fetchJson(`${ASSET_BASE}/placeholder-catalog.json`),
      loadFurnitureCatalog({ fetchJson }),
    ])
  } catch (error) {
    if (!pageAlive) return // 离页后的晚到失败不改写页面；活页面的失败仍完整显示原因
    return showSceneFailure(`房间资源读取失败：${error.message}`)
  }
  if (!pageAlive) return
  // 家具库读取失败：如实列出 code／fieldPath／中文原因，不建场景、不静默只渲染占位家具。
  if (!furnitureLibrary.ok) return showLibraryFailure(furnitureLibrary.diagnostics)

  // 占位目录容器检查（E4b-2 补齐）：合并前只验容器形状——非 null、非数组的对象且
  // assets 是数组。此前直接展开 .assets，目录为 null/{}／assets 非数组时在拼接行抛
  // TypeError 且 main 无捕获，状态停在"正在核对房间布置…"。不把坏形状默认成空数组、
  // 不用可迭代性代替数组判断；逐项校验（重复 ID、坏条目）仍归真实 placement。
  const placeholderIsContainer = placeholderCatalog !== null
    && typeof placeholderCatalog === 'object' && !Array.isArray(placeholderCatalog)
  if (!placeholderIsContainer || !Array.isArray(placeholderCatalog.assets)) {
    return showCatalogInputFailure(placeholderIsContainer ? 'placeholderCatalog.assets' : 'placeholderCatalog')
  }

  // 两目录成功后以数组拼接合并（E4b-2）：不用按 ID 覆盖的 Map/对象展开——重复
  // assetId 交真实 placement 拒绝，不让后者覆盖前者。同一合并目录给摆放与内容绑定。
  const catalog = { schemaVersion: 1, assets: [...placeholderCatalog.assets, ...furnitureLibrary.catalog.assets] }

  // 按 templateRef 精确匹配模板：未知模板明确报错，不用数组第一项或默认写实模板兜底。
  const known = Array.isArray(templates?.templates) ? templates.templates : []
  const template = known.find((item) => item?.templateId === data.layout.templateRef)
  if (!template) {
    setStatus('房间模板缺失', 'bad')
    showError(`room.json 指定的模板「${data.layout.templateRef}」不在插件模板清单里（现有：${known.map((item) => item.templateId).join('、') || '无'}）。请修改配置里的 templateRef。`)
    return
  }

  const result = validatePlacement(template, catalog, data.layout)
  if (!result.ok) return showDiagnostics(result.diagnostics)
  if (!pageAlive) return

  // 家具资料绑定（E3a resolver，E3b-2 接线；E9c 起目录含流程图）：placement 成功后校验，
  // 不复制规则。任何绑定错误：不安装任何家具阅读动作（不用半份绑定），只提示＋可展开诊断；
  // 业务可信而绑定有错时 directory 仍完整（"业务资料"备用入口照常可读）。
  const resolved = resolveRoomBindings({ business: data.business, layout: data.layout, catalog })
  const bindingByInstance = new Map()
  if (resolved.ok) {
    for (const binding of resolved.bindings) bindingByInstance.set(binding.instanceId, binding)
  } else {
    showBindingNote(resolved.diagnostics)
  }
  // 空目录两种情形分开说：没登记＝正常空态；解析有错且目录为空＝不可用，指向诊断。
  const docDirectory = resolved.ok || resolved.directory.length > 0 ? resolved.directory : null
  const docEmptyText = docDirectory === null
    ? '当前没有可用的资料目录，请查看绑定诊断'
    : '此业务尚未登记文档或流程图'

  let module
  $('roomLoadingPhase').textContent = '装配家具…'
  try {
    module = await loadSceneModule()
  } catch (error) {
    if (!pageAlive) return // 离页后的晚到模块失败不改写页面
    return showSceneFailure(error)
  }
  if (!pageAlive) return

  // 先异步备好家具批次，再同步建场景（E4b-2 固定设计）：等待模型期间不持有半初始化
  // 的 renderer/输入。准备期归 prepare 所有（页面离开时其 isActive 检查自会释放全部
  // 句柄并中止）；返回后、交给场景前归本页所有，页面不再存活则立即释放。
  let furniture
  try {
    furniture = await module.prepareRoomFurniture(result.assembly, { isActive: () => pageAlive })
  } catch (error) {
    if (!pageAlive) return // 真正离开后的晚到错误只清理（prepare 内已释放），不写 DOM
    return showSceneFailure(error)
  }
  if (!pageAlive) {
    furniture.dispose()
    return
  }

  // 先建立最终全窗口尺寸，再在加载层下渲染；内容仍不可见、不可聚焦。
  $('roomStage').hidden = false
  document.body.classList.add('room-live')
  $('roomLoadingPhase').textContent = '准备房间画面…'
  try {
    scene = module.createRoomScene({
      container: $('viewport'),
      template,
      assembly: result.assembly,
      furniture, // 调用瞬间所有权整体转交场景：此后任何失败由场景 releaseAll 释放批次
      deferInput: true,
      brightness: initialBrightness,
      onBrightnessChange: (state) => { if (pageAlive && controlsReady) renderBrightness(template.styleId, state) },
      // 点击分派（E3b-2）：先保留身份显示，再按 instanceId 查已验证绑定；
      // 阅读已打开时迟到的点击不切换集合；未绑定家具只显身份，不猜文档。
      onPick: (picked) => {
        showPick(picked)
        if (!reader || reader.isOpen() || exporter?.isOpen()) return
        const binding = bindingByInstance.get(picked.instanceId)
        if (!binding) return
        const canvas = $('viewport').querySelector('canvas')
        reader.open({
          title: picked.name,
          entries: binding.entries,
          emptyText: offlineRuntime()?.missingByInstance.includes(picked.instanceId) ? '此资料未随包导出' : `这件${picked.name}还没有放入资料`,
          returnFocus: canvas ?? $('viewport'),
        })
      },
    })
  } catch (error) {
    scene = null // 批次已由场景释放（转交即接管），本页不再重复释放
    return showSceneFailure(error)
  }
  if (!pageAlive) {
    scene.dispose()
    scene = null
    return
  }
  // 主 render 成功返回才 ready；dispose 取消返回 false，不产生悬空拒绝。
  // 只证明主渲染调用完成，不表示 GPU 或显示器已完成呈现。
  const ready = await scene.ready
  if (!pageAlive || !ready) return
  stopInitialTheme()
  controlsReady = true
  // 底座字幕使用实际初始亮度/昼夜；亮度控件两风格共用。
  renderBrightness(template.styleId, scene.getBrightness())
  wireSceneInformation()
  wireBrightness(scene, template.styleId)
  // 阅读面板（E3b-2）：资料入口只在场景成功装配后存在；面板打开＝暂停，关闭＝原位恢复。
  reader = createRoomReader({
    root: $('readerRoot'),
    documents: docDirectory ?? [],
    focusFallback: $('viewport'),
    onReadingChange: handleReadingChange,
  })
  wireBizDocs({ directory: docDirectory, emptyText: docEmptyText })
  if(!offlineRuntime()){
    exporter=createRoomExporter({root:$('exportRoot'),button:$('roomExport'),url:api=>wsUrl(`/specdev-workbench/api/${api}?business=${encodeURIComponent(id)}`),onOpenChange:handleReadingChange,getState:()=>({theme:window.SpecDevTheme.get().mode,brightness:Math.round(scene.getBrightness().value)}),getAppearance:()=>reader.getAppearance(),setAppearance:value=>reader.setAppearance(value)})
    $('roomExport').hidden=false
    $('roomExport').addEventListener('click',()=>{if(pageAlive&&controlsReady&&toolbarExpanded&&!scene?.isReading()&&!reader?.isOpen())exporter.open()})
  }
  // 行走／总览／门按钮（P1c-2c-2）：默认门前总览，此时才启用新控件并同步提示。
  wireWalkControls(scene)
  setStatus(`${data.business.name} · ${template.name}`, 'ok')
  scene.finishLoading()
}

main().catch((error) => {
  if (pageAlive) showSceneFailure(error)
}).finally(() => {
  // 包含全部早退/失败出口；真正离页不再写 DOM，bfcache 不取消异步链。
  if (!pageAlive) return
  if (!controlsReady) stopInitialTheme()
  $('roomLoading').hidden = true
  document.body.classList.remove('room-loading')
  document.body.setAttribute('aria-busy', 'false')
  document.querySelector('.page-content').removeAttribute('inert')
})

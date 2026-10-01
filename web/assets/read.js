// 图阅读页：版本条 + 原生图现场渲染（步骤 4/A·补神：原生装配恢复工具栏/主题/缩放/悬停说明；
// B·渲染失败说人话：三类失败给中文原因与换版本建议，版本条不再被报错顶掉；
// C·说明文档分块：details.md 按 `## 节点 id` 分节贴上页面，与所选版本同源；
// D·源码证据：evidence.json 逐条展示——有效引用贴带行号的代码片段，坏引用按条说原因，
//   片段永远取自引用写定的固定提交；双请求错配修复：第二次请求（解析证据）带着第一次
//   响应里的清单原文去问（POST 正文），服务端只按提交来的正文解析、不重读磁盘——
//   两次请求之间文件被保存，图与证据也不会来自两个版本；
// 评审二修：比较失败单独成态不拖垮清单与阅读、"当前"可从版本栏一键切回、证据请求
//   不再阻塞版本条、快照登记的保存说明与时间上屏、坏节点不二次崩页、装配前剥离
//   模板外链字体满足零外网；
//   超限死路收尾：读不开（超上限）的文件降级为该版本自己的说明——失败卡分"缺失/读不开"，
//   说明与证据面板如实报"读不开"，页面与版本条始终活着，历史照样能切）。
// E·选中同步：图里被原生选中的步骤，在外层状态条上显示"已选：<图上名字>"；
//   chart-link.js 观察原生选中标记，并适配节点双击；不改 vendor；
//   接不上有尽头——load 后仍进不去、或一直等不到 load，都明确说一句，不无限等（复审修复）。
// F·节点详情阅读：状态条上「查看详情」弹出可关闭的详情层，读该节点在当前所选版本里的那一节
//   说明（与说明面板同一个文件、同一个版本，不发新请求）；没写/没文档/读不开/未分节各如实说；
//   说明正文里代码示例的 ## 不冒充分节，同一编号写多节时提示"显示的是第一份"（复审修复）。
// G·保存版本：正看"当前（工作区）"时版本条上有「保存版本」，弹层里填名称/阶段/说明即可把
//   已提交的图内容登记成一版。打开弹层先问一次"现在能不能存"，并把服务端给的内容摘要与
//   页面正看的那一份对一下——页面旧了、或还有没提交的改动，就地说明并禁用保存；
//   提交时把确认过的提交号与摘要一起送回，服务端再核一遍（双保险）。连点只存一次；
//   保存成功后原地刷新版本条与状态行，图与说明、证据面板都不动。
//   复查修复（审查 P1/P2）：两条状态规则搬到 save-result.js（能直接跑断言）——
//   ① 页面正展示内容的摘要只由"加载并展示内容"写定，刷新版本条不覆盖它；
//   ② 保存请求的成功只认"状态成功 + 正文完整"，并区分"版本已写上、只是没核完"。
import { $, el, fetchJson, pageTitle, postJson, renderEmptyWorkspaceParam, renderGuide, renderRepoLine, renderRepoState, setStatus, showError, workspaceParamEmpty, wsUrl } from './common.js'
import { buildDetails, parseBody, splitInline } from './details.js'
import { describeSource, displayError, evidenceSummary, formatCodeBlock } from './evidence.js'
import { stripExternalFonts } from './template.js'
import { connectChartSelection } from './chart-link.js'
import { loadDetailEvidence, renderNodeDetail } from './node-detail.js'
import { forwardEscapeToHost } from './panel-link.js'
// 保存弹层的两条状态规则（自查放行与否、请求结果怎么算）；摘要在那个模块里保管，见文件头注释
import { rememberShown, shownFingerprint, saveGate, saveOutcome } from './save-result.js'
// process 垫片必须先于编译器求值（Archify 模块顶层读 process.env；浏览器里没有 process）。
import '/specdev-workbench/vendor/shims/process.mjs'

const COMPILER_URL = '/specdev-workbench/vendor/archify/renderers/workflow/workflow-compiler.mjs'
const UTILS_URL = '/specdev-workbench/vendor/archify/renderers/shared/utils.mjs'
const TEMPLATE_URL = '/specdev-workbench/vendor/archify/assets/template.html'

// 图里当前选中的那个步骤（恰好一个才算选中）：状态条与详情弹层共用同一份，未选中为 null。
// 它只是"记着当前是谁"，节点清单与说明正文都取本次已加载的版本，点开详情不再取文件。
let currentSelection = null

// 本页状态（保存成功后要原地重画版本条与状态行，不整页刷新、不动图）：
// business/chart/v 是地址里的三项，data 是这次加载的页面数据，rendered/failure 是本次渲染凭据。
let pageState = null
// 保存弹层打开时那次检查的结果（确认过的提交号与服务端摘要），提交时原样送回服务端再核一遍。
let saveCheck = null

/**
 * 当场编译 + 按 Archify 原生装配（applyTemplate）拼出完整页面，装进 iframe。
 * 为什么用 iframe（"独立小房间"）：模板的交互脚本是整页的主人——用 document 级查找
 * 找工具栏、标题等元素，塞进本页的局部容器会找不到而失灵；给它独立文档才原样运转。
 * 小房间不带任何 URL 参数：模板的 embed=1 模式会隐藏工具栏等交互，不触发它。
 * 喂参与原生命令行 render-workflow.mjs 一致（仅 title 回退到图名）。
 * 返回 { kb, ms, frame } 供状态栏展示"现场渲染"凭据、供外层接上小房间里的图；失败抛带人话原因的 Error。
 */
async function renderChart(workflowText, host, chartName) {
  let workflow
  try {
    workflow = JSON.parse(workflowText)
  } catch (error) {
    // kind 供 failureInfo 分"文件坏了"这类；技术原文留在 message 里折进卡片的技术细节
    throw Object.assign(new Error(`workflow.json 不是合法 JSON：${error.message}`), { kind: 'broken-json' })
  }
  const [{ compileWorkflow }, { applyTemplate, renderCards }, template] = await Promise.all([
    import(COMPILER_URL),
    import(UTILS_URL),
    // 剥掉模板自带的 Google Fonts 外链（零外网，验收 #10）；正文回退系统等宽字体
    fetch(TEMPLATE_URL).then((response) => response.text()).then(stripExternalFonts),
  ])

  const t0 = performance.now()
  const result = compileWorkflow({ workflow, qualityProfile: workflow.meta?.quality_profile })
  const ms = Math.max(1, Math.round(performance.now() - t0))
  if (!result.ok || !result.svg) {
    const detail = result.error ? String(result.error) : `${(result.diagnostics || []).length} 条编译诊断未通过`
    throw Object.assign(new Error(`渲染未通过：${detail}`), { kind: 'compile-failed' })
  }

  const meta = workflow.meta || {}
  const html = applyTemplate(template, {
    title: meta.title || chartName,
    subtitle: meta.subtitle,
    svg: result.svg,
    cards: renderCards(workflow.cards),
    locale: meta.locale,
    visualPreset: meta.visual_preset || 'classic',
    guidedViews: meta.views || [],
    sourceEvidence: null, // 源码证据展示属后续步骤；这里不给假数据
  })

  const frame = document.createElement('iframe')
  frame.className = 'chart-frame'
  frame.title = `${meta.title || chartName} 交互图`
  frame.src = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
  // 图是同一来源的 blob：点进图里之后焦点落在那份文档，键盘一样到不了外层，
  // 所以那份文档也转发一次"关掉资料面板"的 ESC（图每次重渲染换一份文档，跟着 load 重新接）。
  frame.addEventListener('load', () => {
    if (frame.contentDocument) forwardEscapeToHost(window, frame.contentDocument)
  })
  host.replaceChildren(frame)
  return { kb: (result.svg.length / 1024).toFixed(1), ms, frame }
}

/**
 * 「已选」状态条（E·选中同步）：图里恰好一个步骤被原生选中时，把图上的名字写在这一条上，
 * 并露出「查看详情」入口；未选中、多选、取消选中都隐藏（沿用旧增强版"多个按未选中"的规则）。
 * 名字用图里那个节点自己的标签，外层不另起译名，和图对得上。
 */
function renderSelectionBar(selection) {
  const bar = $('selectionBar')
  const button = $('detailOpen')
  if (!selection) {
    bar.hidden = true
    $('selectionText').textContent = ''
    button.hidden = true
    bar.removeAttribute('data-kind')
    currentSelection = null
    return
  }
  $('selectionText').textContent = `已选：${selection.label}`
  button.hidden = false
  bar.dataset.kind = 'selected'
  bar.hidden = false
  currentSelection = selection
}

/**
 * 增强阅读接不上（进不去图所在的小房间、或图里找不到主图）：在这里如实说一句就走开，
 * 只报一次；图本身与文档、证据面板都不受影响。这时候没有可读的节点，入口一并收起。
 */
function renderLinkFailure(reason) {
  const bar = $('selectionBar')
  $('selectionText').textContent = `增强阅读连接不上：${reason}。图与文档不受影响。`
  $('detailOpen').hidden = true
  bar.dataset.kind = 'warn'
  bar.hidden = false
}

/**
 * 把渲染失败归成看图人能懂的四类（B：渲染失败说人话）：
 * missing 文件没了 / unreadable 文件在但读不开（如超过大小上限）/
 * broken-json 文件格式坏了 / compile-failed 图自相矛盾。
 * 技术原文保留在 detail 里，折进卡片的"技术细节"，给修图的人看，不占正文。
 */
function failureInfo(kind, version, source) {
  const where = version.kind === 'snapshot'
    ? `历史快照「${version.label}」（${version.tag}）`
    : '当前（工作区）'
  if (kind === 'missing') {
    return {
      where,
      reason: version.kind === 'snapshot'
        ? '这个快照存档的时候没有存图文件（workflow.json 缺失）：存档不完整，不是您操作的问题。'
        : '当前工作区里没有图文件（workflow.json 缺失）：图还没画，或者文件没有放在约定目录里。',
      hint: version.kind === 'snapshot'
        ? '可以点上面版本条里的其他版本看；这份存档本身补不了图，需要重新存一份快照。'
        : '图已经画过的话，检查文件是否在约定目录里；还没画的话，画完保存后这里就能读。',
      detail: String(source?.message || source || ''),
    }
  }
  if (kind === 'unreadable') {
    return {
      where,
      reason: '这个版本的图文件在，但读不开（例如文件太大，超过了读取上限）：内容取不出来，不是您操作的问题。',
      hint: '可以点上面版本条里的其他版本看；这份文件需要先处理（比如拆小）才能在这里显示。',
      detail: String(source?.message || source || ''),
    }
  }
  if (kind === 'broken-json') {
    return {
      where,
      reason: '这个版本存的图文件格式坏了：存档的时候内容就写错了，机器读不开。不是您操作的问题。',
      hint: '可以点上面版本条里的其他版本看；这份存档需要重新生成。',
      detail: String(source?.message || ''),
    }
  }
  return {
    where,
    reason: '图文件读得开，但内容对不上：比如箭头指向了不存在的步骤，或缺少必要的信息，画不成图。',
    hint: '可以点上面版本条里的其他版本看；这份图的内容需要修正后重新保存。',
    detail: String(source?.message || ''),
  }
}

/** 失败说明卡：标题 + 坏的是哪份 + 原因 + 建议 + 可折叠技术原文。装进画布区，版本条照常保留。 */
function renderFailureCard(host, info, chartName) {
  const box = el('div', 'fail-card')
  const h = el('h2')
  h.textContent = '这份图暂时看不了'
  const which = el('p', 'fail-which')
  which.textContent = `图：${chartName} · 版本：${info.where}`
  const reason = el('p', 'fail-reason')
  reason.textContent = `原因：${info.reason}`
  const hint = el('p', 'fail-hint')
  hint.textContent = info.hint
  box.append(h, which, reason, hint)
  if (info.detail) {
    const details = el('details', 'fail-detail')
    const summary = el('summary')
    summary.textContent = '技术细节（给修图的人看）'
    const pre = el('pre')
    pre.textContent = info.detail
    details.append(summary, pre)
    box.appendChild(details)
  }
  host.replaceChildren(box)
}

/** 从 workflow.json 取节点清单，供说明文档块配上图上的名字。图读不开时返回空（判断不了归属）。 */
function chartNodes(workflowText) {
  try {
    const workflow = JSON.parse(workflowText)
    return Array.isArray(workflow.nodes) ? workflow.nodes : []
  } catch {
    return []
  }
}

/** 一段文字按行内标记拼成 DOM（加粗/代码；不碰 innerHTML）。 */
function inlineNodes(text) {
  const holder = document.createDocumentFragment()
  for (const part of splitInline(text)) {
    if (part.strong) {
      const strong = document.createElement('strong')
      strong.textContent = part.text
      holder.appendChild(strong)
    } else if (part.code) {
      const code = el('code')
      code.textContent = part.text
      holder.appendChild(code)
    } else {
      holder.appendChild(document.createTextNode(part.text))
    }
  }
  return holder
}

/** 一个步骤一块：图上名字（+ 副标签、节点编号）+ 这一节的正文。 */
function detailBlock(block) {
  const box = el('div', 'detail-block')
  const heading = el('h3')
  heading.textContent = block.label
  if (block.note) {
    const note = el('span', 'detail-note')
    note.textContent = block.note
    heading.appendChild(note)
  }
  if (block.sublabel) {
    const sub = el('span', 'detail-sub')
    sub.textContent = block.sublabel
    heading.appendChild(sub)
  }
  if (block.label !== block.id) {
    const id = el('code', 'detail-id')
    id.textContent = block.id
    heading.appendChild(id)
  }
  box.appendChild(heading)
  for (const item of parseBody(block.body)) {
    const line = item.kind === 'bullet' ? el('li') : el('p')
    line.appendChild(inlineNodes(item.text))
    if (item.kind === 'bullet') {
      // 连续的列表项归进同一个 <ul>
      const last = box.lastElementChild
      const list = last && last.tagName === 'UL' ? last : box.appendChild(document.createElement('ul'))
      list.appendChild(line)
    } else {
      box.appendChild(line)
    }
  }
  return box
}

/**
 * 说明文档面板（C）：一级标题当总说明，`## 节点 id` 各成一块。
 * 没写说明文档、没按约定分节、图上没写说明的步骤、图外多余的条目，都如实说明，都不算错误。
 * doc 是 main 里算好的一份（与详情弹层共用），这里只负责渲染，不再重复解析。
 */
function renderDetailsPanel(version, doc) {
  const host = $('detailsPanel')
  host.textContent = ''
  const heading = el('h2')
  heading.textContent = '说明文档'
  host.appendChild(heading)

  // 文件在但读不开（如超过大小上限）：如实说明，不误报"没写"，也不算错误以外的事故
  if (version.detailsError) {
    const warn = el('p', 'details-warn')
    warn.textContent = `说明文档读不开：${version.detailsError}`
    host.appendChild(warn)
    host.hidden = false
    return
  }

  if (doc.empty) {
    const note = el('p', 'muted')
    note.textContent = version.kind === 'snapshot'
      ? '这个版本没有说明文档（details.md）。'
      : '这张图还没有说明文档（details.md）。'
    host.appendChild(note)
    host.hidden = false
    return
  }

  if (doc.title) {
    const lead = el('p', 'details-lead')
    lead.textContent = doc.title
    host.appendChild(lead)
  }
  if (doc.malformed) {
    const warn = el('p', 'details-warn')
    warn.textContent = '说明文档没有按约定分节（每节应以「## 节点编号」开头），所以只能看到上面的总说明。'
    host.appendChild(warn)
  }
  for (const block of doc.blocks) host.appendChild(detailBlock(block))
  if (doc.missing.length) {
    const note = el('p', 'muted')
    note.textContent = `图中还有 ${doc.missing.length} 个步骤没写说明：${doc.missing.map((node) => node.label).join('、')}`
    host.appendChild(note)
  }
  if (doc.strays.length) {
    const note = el('p', 'muted')
    note.textContent = `以下 ${doc.strays.length} 条在图里找不到对应步骤（保留显示，不算错误）：`
    host.appendChild(note)
    for (const block of doc.strays) host.appendChild(detailBlock(block))
  }
  host.hidden = false
}

/**
 * 源码证据面板（D + 双请求错配修复）。清单用第一次响应（/api/chart）里那份 evidence.json
 * 的原文：第二次请求带着它去问（POST 正文），服务端只按提交来的正文解析与切片，
 * 不重读磁盘——两次请求之间文件被保存，证据也不会跟图错开版本。
 * 第一次拿到的清单是 null（没有证据文件）或带读不开标注时，就地如实说明，根本不发请求；
 * 证据为空是如实说明，不算错误；接口失败也只影响本面板，不拖垮整页。
 */
async function renderEvidencePanel(version, onReady) {
  const state = await loadDetailEvidence(version, text => postJson(wsUrl('/specdev-workbench/api/evidence'), text))
  const host = $('evidencePanel')
  host.replaceChildren()
  const heading = el('h2')
  heading.textContent = '全部源码证据'
  host.append(heading)
  if (state.message || !state.refs.length) {
    const note = el('p', 'ev-warn')
    note.textContent = state.message || '证据清单为空。'
    host.append(note)
  }
  const summary = evidenceSummary(state.refs)
  if (summary) {
    const note = el('p', 'muted')
    note.textContent = summary.total + ' 条证据：' + summary.ok + ' 条有效、' + summary.bad + ' 条有问题。'
    host.append(note)
  }
  for (const ref of state.refs) host.append(evidenceBlock(ref))
  host.hidden = false
  onReady(state)
}

/** 一条证据一块：名称 + （有效）出处与代码片段 /（有问题）人话原因。 */
function evidenceBlock(ref) {
  const box = el('div', ref.ok ? 'ev-block' : 'ev-block ev-block-bad')
  const heading = el('h3')
  heading.textContent = ref.label
  if (ref.label !== ref.id) {
    const id = el('code', 'detail-id')
    id.textContent = ref.id
    heading.appendChild(id)
  }
  box.appendChild(heading)

  if (!ref.ok) {
    const bad = el('p', 'ev-bad')
    bad.textContent = `这条引用用不了：${displayError(ref.error)}`
    box.appendChild(bad)
    return box
  }

  const src = el('p', 'ev-src')
  src.textContent = describeSource(ref)
  src.title = `完整提交号：${ref.commit}`
  box.appendChild(src)
  const pre = el('pre', 'ev-code')
  pre.textContent = formatCodeBlock(ref.text, ref.fromLine)
  box.appendChild(pre)
  return box
}

function parseLocation() {
  const parts = location.pathname.split('/').filter(Boolean) // ['specdev-workbench','read','<biz>','<chart>']
  return { business: parts[2] || '', chart: parts[3] || '', v: new URLSearchParams(location.search).get('v') || 'current' }
}

async function main() {
  const { business, chart, v } = parseLocation()
  if (!business || !chart) return showError('路径应为 /specdev-workbench/read/<业务id>/<图id>')
  if (workspaceParamEmpty) return renderEmptyWorkspaceParam()
  // "业务"面包屑在取数开始前就绑好业务段与工作区标识：
  // 图不存在、工作区失效或请求失败时它也不再是裸地址，错误页上点它仍回到本工作区的业务页。
  $('bizLink').href = wsUrl(`/specdev-workbench/business/${business}`)
  let data
  try {
    data = await fetchJson(wsUrl(`/specdev-workbench/api/chart?business=${encodeURIComponent(business)}&chart=${encodeURIComponent(chart)}&v=${encodeURIComponent(v)}`))
  } catch (error) {
    if (renderRepoState(error)) return
    return showError(error.message)
  }
  if (data.code === 'repo-not-configured') return renderGuide(data)

  document.title = pageTitle(data.chart.name, data.repo)
  $('bizLink').textContent = data.business.name
  $('bizLink').href = wsUrl(`/specdev-workbench/business/${business}`)
  $('chartName').textContent = data.chart.name
  $('title').textContent = data.chart.name
  if (data.chart.summary) $('summary').textContent = data.chart.summary
  renderRepoLine(data.repo)
  let rendered = null
  let failure = null
  if (data.version.workflowError) {
    failure = failureInfo(
      data.version.workflowErrorKind === 'unreadable' ? 'unreadable' : 'missing',
      data.version,
      data.version.workflowError,
    )
  } else {
    try {
      rendered = await renderChart(data.version.files.workflow, $('stage'), data.chart.name)
    } catch (error) {
      // 失败不当成整页事故：版本条照常出来，画布区换成说明卡，看的人能自己换版本
      failure = failureInfo(error.kind === 'broken-json' ? 'broken-json' : 'compile-failed', data.version, error)
    }
  }
  if (failure) renderFailureCard($('stage'), failure, data.chart.name)
  // 本页状态：保存成功后重画版本条与状态行要读它（图与说明面板不重画，因此不看这里）
  pageState = { business, chart, v, data, rendered, failure }
  // 记下"页面上展示的这一份内容是哪个摘要"——只在真正加载并展示内容时登记一次。
  // 保存成功后原地刷新版本条不走这里：屏幕上还是这一份图与说明，过期检查就得按它算（审查 P1）。
  rememberShown(data)
  // 说明文档只解析一次：说明面板与详情弹层用同一份结果，两处说法必然一致
  const details = buildDetails(data.version.files.details, chartNodes(data.version.files.workflow))
  let evidence = { loading: true, refs: [] }
  let openedSelection = null
  let returnFocus = null
  const openDetail = (selection, target) => {
    if (!selection) return
    openedSelection = selection
    returnFocus = target || $('detailOpen')
    renderNodeDetail($('detailContent'), data.version, details, selection, evidence)
    $('detailSource').textContent = '关闭后继续看图 · Esc 关闭'
    if (!$('detailDialog').open) $('detailDialog').showModal()
    $('detailContent').scrollTop = 0
  }
  if (rendered) {
    connectChartSelection(rendered.frame, {
      onSelection: renderSelectionBar,
      onUnavailable: renderLinkFailure,
      onOpenDetail: openDetail,
    })
  }
  $('detailOpen').addEventListener('click', () => openDetail(currentSelection))
  $('detailDialog').addEventListener('close', () => {
    openedSelection = null
    returnFocus?.focus({ preventScroll: true })
  })
  $('materialsOpen').disabled = false
  $('materialsOpen').addEventListener('click', () => $('materialsDialog').showModal())
  $('materialsClose').addEventListener('click', () => $('materialsDialog').close())
  $('detailClose').addEventListener('click', () => $('detailDialog').close())
  // 点框外空白关闭：点到的就是 dialog 自己（内容在里面的正文区），且坐标落在框外。
  // ESC 由原生 dialog 自己关（浏览器默认行为），不另写一套。
  $('detailDialog').addEventListener('click', (event) => {
    const dialog = event.currentTarget
    if (event.target !== dialog) return
    const rect = dialog.getBoundingClientRect()
    if (event.clientX < rect.left || event.clientX > rect.right
      || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close()
  })
  // 「保存版本」（G）：关闭三方式与详情层一致；保存按钮点下去就禁用（连点只发一次请求）
  $('saveSubmit').addEventListener('click', submitSave)
  $('saveClose').addEventListener('click', () => $('saveDialog').close())
  $('saveCancel').addEventListener('click', () => $('saveDialog').close())
  $('saveDialog').addEventListener('click', (event) => {
    const dialog = event.currentTarget
    if (event.target !== dialog) return
    const rect = dialog.getBoundingClientRect()
    if (event.clientX < rect.left || event.clientX > rect.right
      || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close()
  })
  // 本页被装进资料面板（iframe）时，焦点在本文档里，父页收不到按键：没有自己的弹层
  // 要关的 ESC 由阅读页转给宿主页去关面板；顶层标签页里打开本页时它什么也不做。
  // 注意安装位置见文件末尾：要装在 main() 的早退分支之前（见那里的说明）。
  renderDetailsPanel(data.version, details)
  // 证据解析不阻塞版本条：先发出去（正文带的就是本页 data 里那份清单原文），版本条立起来、
  // 状态栏报完再等它——证据慢只慢证据面板
  const evidenceTask = renderEvidencePanel(data.version, state => {
    evidence = state
    // 晚到的证据只更新仍打开的节点，不重新打开已关闭的详情。
    if ($('detailDialog').open && openedSelection) {
      const scroll = $('detailContent').scrollTop
      renderNodeDetail($('detailContent'), data.version, details, openedSelection, evidence)
      $('detailContent').scrollTop = scroll
    }
  })
  // 版本条与状态栏的绘制抽成函数：保存成功后原地重画它们（不整页刷新、不动图）
  renderVersions(data)
  renderStatus(data)
  // 版本条与状态栏已就绪，这里才等证据面板收尾（失败只写进面板自身，不影响页面其余部分）
  await evidenceTask
}

/** 当前 vs 最新快照的比较结果徽标文案（服务端算好传下来，这里只翻成中文后缀）。 */
function statusSuffix(data) {
  return data.currentStatus === 'identical' ? '· 一致' : data.currentStatus === 'changed' ? '· 已改动'
    : data.currentStatus === 'compare-failed' ? '· 无法比较' : '· 无快照'
}

/**
 * 版本条 + 正在看历史时的登记信息行（§3.2 的保存时间与保存说明）。
 * 保存成功后由 refreshAfterSave 再调一次原地重画：新版本会出现在条上，图与说明面板照旧。
 */
function renderVersions(data) {
  const { business, chart, v } = pageState
  const versions = $('versions')
  versions.textContent = ''
  if (v === 'current') {
    const current = el('span', 'current-item')
    current.textContent = `当前（工作区）${statusSuffix(data)}`
    current.setAttribute('aria-current', 'true')
    versions.appendChild(current)
    // 「保存版本」只在正看"当前"时出现：历史版本是存下来的那一份，不能再存一次
    const save = el('button', 'save-open')
    save.textContent = '保存版本'
    save.title = '把当前已提交的图内容登记成一个有名称的版本'
    save.addEventListener('click', openSaveDialog)
    versions.appendChild(save)
  } else {
    // 正在看历史时，"当前"也是按钮——同一条版本栏就能切回来，不用绕回业务页
    const current = el('button')
    current.textContent = `当前（工作区）${statusSuffix(data)}`
    current.title = data.compareError || '回到当前工作区内容'
    current.addEventListener('click', () => {
      location.assign(wsUrl(`/specdev-workbench/read/${business}/${chart}?v=current`))
    })
    versions.appendChild(current)
  }
  for (const snapshot of data.snapshots.snapshots) {
    const button = el('button')
    button.textContent = `${snapshot.meta.name}（${snapshot.meta.stage === 'implemented' ? '实现版' : '设计版'}）`
    button.title = [snapshot.tag, snapshot.meta.note].filter(Boolean).join(' · ')
    if (snapshot.tag === v) button.setAttribute('aria-current', 'true')
    button.addEventListener('click', () => {
      location.assign(wsUrl(`/specdev-workbench/read/${business}/${chart}?v=${encodeURIComponent(snapshot.tag)}`))
    })
    versions.appendChild(button)
  }
  // 正在看历史快照：登记的保存时间与保存说明上屏（§3.2）；并说明图名与摘要的来处——
  // 图名/摘要（chart.json）不进快照，历史页上的名字仍取自当前说明文件
  const meta = $('snapshotMeta')
  if (data.version.kind === 'snapshot') {
    const when = data.version.savedAt ? `保存于 ${data.version.savedAt.slice(0, 16).replace('T', ' ')}` : ''
    const parts = [when, data.version.note].filter(Boolean)
    const origin = '图名与摘要取自当前说明文件（chart.json），不随版本回退'
    meta.textContent = parts.length ? `${parts.join(' · ')} · ${origin}` : origin
    meta.hidden = false
  } else {
    meta.hidden = true
  }
  if (data.snapshots.snapshots.length === 0 && data.currentStatus === 'no-snapshot') {
    const note = el('span', 'muted')
    note.textContent = '还没有保存过快照'
    versions.appendChild(note)
  }
  if (data.snapshots.invalidCount > 0) {
    const note = el('span', 'muted')
    note.textContent = `有 ${data.snapshots.invalidCount} 个不符合约定的标签被忽略（如 ${data.snapshots.invalidSamples.slice(0, 2).join('、')}）`
    versions.appendChild(note)
  }
}

/** 状态行：在看哪一版 + 这次现场渲染的凭据（或这个版本看不了）。prefix 供保存成功后加一句结果。 */
function renderStatus(data, prefix = '') {
  const { v, rendered, failure } = pageState
  setStatus(
    prefix + (v === 'current'
      ? '正在看：当前（工作区）'
      : `正在看：${data.version.label}（提交 ${String(data.version.commit).slice(0, 8)}）`)
      + (rendered ? ` · 已现场渲染 ${rendered.kb} KB / ${rendered.ms} ms` : failure ? ' · 这个版本看不了' : ''),
    failure ? 'bad' : 'ok',
  )
}

/**
 * 打开保存弹层：先问一次"现在能不能存"（GET /api/snapshots），再把服务端给的内容摘要与
 * 页面正看的这一份对一下。放行与否、各说什么话都由 save-result.js 的 saveGate 判（那边能跑断言）；
 * 这里只负责取数、把结论摆上来、以及在通过时放开保存按钮。
 */
async function openSaveDialog() {
  const { business, chart } = pageState
  const box = $('saveCheck')
  const button = $('saveSubmit')
  saveCheck = null
  button.disabled = true
  button.textContent = '保存'
  $('saveError').hidden = true
  $('saveName').value = ''
  $('saveNote').value = ''
  const designStage = document.querySelector('input[name="saveStage"][value="design"]')
  if (designStage) designStage.checked = true
  box.textContent = '正在检查这一版能不能存…'
  box.removeAttribute('data-kind')
  $('saveDialog').showModal()

  let check
  try {
    check = await fetchJson(wsUrl(`/specdev-workbench/api/snapshots?business=${encodeURIComponent(business)}&chart=${encodeURIComponent(chart)}`))
  } catch (error) {
    check = { failed: error.message } // 请求没回来：交给 saveGate 归为"没能检查"
  }
  const gate = saveGate(shownFingerprint(), check)
  if (gate.state === 'ok') {
    saveCheck = check
    box.dataset.kind = 'ok'
    box.textContent = gate.text
    button.disabled = false
    return
  }
  if (gate.state === 'uncommitted') {
    box.dataset.kind = 'bad'
    box.textContent = gate.text
    const list = el('ul', 'save-problems')
    for (const problem of gate.problems) {
      const item = el('li')
      item.textContent = problem
      list.appendChild(item)
    }
    box.appendChild(list)
    return
  }
  box.dataset.kind = gate.state === 'unknown' || gate.state === 'stale' ? 'warn' : 'bad'
  box.textContent = gate.text
}

/**
 * 提交保存：弹层里的按钮点下去就禁用（连点只发一次请求）。结果怎么算由 save-result.js 的
 * saveOutcome 判（那边能跑断言），这里只按它给的 kind 做三件事：成功或已存过就关掉弹层并
 * 原地刷新版本条；"版本已写上、只是没核完"提示后顺手刷一次版本条供核对；其余按原因如实说。
 */
async function submitSave() {
  if (!saveCheck) return
  const { business, chart } = pageState
  const button = $('saveSubmit')
  const error = $('saveError')
  const name = $('saveName').value.trim()
  error.hidden = true
  if (!name) {
    error.hidden = false
    error.textContent = '请先给这一版起个名字（例如「首版设计」），再点保存。'
    return
  }
  const stage = document.querySelector('input[name="saveStage"]:checked')?.value === 'implemented' ? 'implemented' : 'design'
  const note = $('saveNote').value.trim()
  button.disabled = true
  button.textContent = '正在保存…'

  let responded = false
  let ok = false
  let status = 0
  let body = null
  try {
    const response = await fetch(wsUrl('/specdev-workbench/api/snapshots'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business,
        chart,
        name,
        stage,
        ...(note ? { note } : {}),
        head: saveCheck.head,
        // 页面上真正展示的那一份（不是版本条刷新后的新数据）：展示的内容没重画，摘要就不许换
        fingerprint: shownFingerprint(),
      }),
    })
    responded = true
    ok = response.ok
    status = response.status
    try {
      body = await response.json()
    } catch {
      body = null // 正文读不出来：交给 saveOutcome 当"结果未知"，不当成功
    }
  } catch {
    responded = false // 请求没到服务端或没拿到回应：存没存上未知
  }

  const outcome = saveOutcome({ responded, ok, status, body })
  if (outcome.kind === 'created' || outcome.kind === 'already') {
    $('saveDialog').close()
    await refreshAfterSave(outcome.label, outcome.kind === 'already')
    return
  }
  button.disabled = false
  button.textContent = '保存'
  error.hidden = false
  error.textContent = outcome.text
  if (outcome.kind === 'created-unverified') {
    // 版本可能已经写上去了：立刻刷一次版本条，让它出现在列表里供核对（图与说明仍不动）
    await refreshBar()
  }
}

/**
 * 就地刷新版本条与状态行（不动图、说明、证据）。返回是否刷成功。
 * 注意这里只换"列表数据"，不碰 save-result.js 里保管的展示摘要——屏幕上还是原来那一份
 * 内容，过期检查就必须仍按原来那一份算，否则会出现"看着旧图、存下新图"（审查 P1）。
 */
async function refreshBar(prefix = '') {
  const { business, chart, v } = pageState
  let data
  try {
    data = await fetchJson(wsUrl(`/specdev-workbench/api/chart?business=${encodeURIComponent(business)}&chart=${encodeURIComponent(chart)}&v=${encodeURIComponent(v)}`))
  } catch {
    return false
  }
  pageState.data = data
  renderVersions(data)
  renderStatus(data, prefix)
  return true
}

/** 保存成功（或已存过）之后原地刷新：说一句结果，再把版本条与状态行重画一遍。 */
async function refreshAfterSave(label, alreadySaved) {
  const note = alreadySaved ? `这一版已经保存过：「${label}」` : `已保存「${label}」`
  if (!(await refreshBar(`${note}。`))) setStatus(`${note}，但版本条没能刷新：已保存，请刷新查看。`, 'warn')
}

// 本页嵌在资料面板里时，把"关掉面板"的 ESC 转给宿主页（顶层标签页里什么也不做）。
// 装在 main() 之前而不是 main 里面：路径不对、工作区标识为空、取图失败这些分支都会提前返回，
// 但用户看到的仍是这个阅读页——读不到图的时候，ESC 照样该能关掉外面的资料面板。
forwardEscapeToHost(window, document)
main()

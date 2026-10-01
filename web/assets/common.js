// 三个页面共用的小工具：取数、错误与"repoRoot 未配置"指引渲染。
// 第二期第 2 步：链接带 ?workspace=<工作区标识> 时整条链路按该工作区读写——
// 本页标识在这里取一次，站内所有跳转与取数都经 wsUrl() 补上它（丢了就会串回手动模式的项目）。
export const $ = (id) => document.getElementById(id)

// null＝链接里没有 workspace 参数（允许手动模式）；''＝有参数但为空（必须报错：
// 空参数若当"没有参数"处理，配置过 repoRoot 的页面会悄悄打开手动配置的项目）。
const workspaceParam = new URLSearchParams(location.search).get('workspace')
export const workspaceId = workspaceParam || ''
export const workspaceParamEmpty = workspaceParam === ''

/** 给站内 URL 补上本页的工作区标识；手动模式（没有标识）原样返回。 */
export function wsUrl(url) {
  if (!workspaceId) return url
  return `${url}${url.includes('?') ? '&' : '?'}workspace=${encodeURIComponent(workspaceId)}`
}

// 面包屑里的"项目首页"是 HTML 里写死的裸地址，这里统一补上标识（首页自己没有面包屑，查不到就不动）。
// 阅读页的"业务"链接有业务段、且必须在取数前绑定（失败页也要带标识），由 read.js 自己设置。
document.querySelector('.crumbs a[href="/specdev-workbench/"]')?.setAttribute('href', wsUrl('/specdev-workbench/'))
document.querySelectorAll('[data-home-link]').forEach((link) => link.setAttribute('href', wsUrl('/specdev-workbench/')))
// 站内其它裸地址入口（如首页进展示页的按钮）：写死 href 作无标识兜底，这里按本页标识补全。
document.querySelectorAll('[data-ws-link]').forEach((link) => link.setAttribute('href', wsUrl(link.getAttribute('data-ws-link'))))

export function setStatus(text, kind = 'info') {
  const n = $('status')
  if (!n) return
  n.textContent = text
  n.dataset.kind = kind
}

export function showError(message) {
  setStatus('读取失败', 'bad')
  const box = $('errorBox')
  box.hidden = false
  box.textContent = message
}

/** 链接里的工作区标识是空的：如实报错并停住，不发任何请求（不会悄悄落回手动模式）。 */
export function renderEmptyWorkspaceParam() {
  setStatus('链接不完整', 'warn')
  const box = $('errorBox')
  box.hidden = false
  box.textContent = '链接里的工作区标识是空的（workspace= 后面没有编号）。请从 DSH 的工作区重新进入；手动复制链接时请复制完整编号。'
}

/** 把后端错误体上的 code 与 repo（工作区信息）挂到抛出的错误上，供状态页分支与显示。 */
function withBody(error, body) {
  if (body && body.code && !error.code) error.code = body.code
  if (body && body.repo && !error.repo) error.repo = body.repo
  return error
}

/** 统一取数：非 2xx 时抛出后端给出的中文错误（带 code 与 repo，供状态页分支与显示）；
 *  repo 未配置交给调用方渲染指引。 */
export async function fetchJson(url) {
  let body
  try {
    const response = await fetch(url)
    body = await response.json()
    if (response.status === 400 && body.code === 'repo-not-configured') return body
    if (!response.ok) throw withBody(new Error(body.error || `HTTP ${response.status}`), body)
    return body
  } catch (error) {
    if (body && body.code === 'repo-not-configured') return body
    throw withBody(error instanceof Error ? error : new Error(String(error)), body)
  }
}

/** 带正文发 POST 取 JSON（证据清单走这里）：把第一次响应里的清单原文原样交给服务端解析。 */
export async function postJson(url, text) {
  let body
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      body: text,
    })
    body = await response.json()
    if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`)
    return body
  } catch (error) {
    throw new Error(error.message || String(error))
  }
}

/** 渲染"repoRoot 未配置"指引：插件正常加载、页面给可复制的配置示例。 */
export function renderGuide(payload) {
  setStatus('尚未配置业务项目目录', 'warn')
  const box = $('guideBox')
  box.hidden = false
  box.textContent = ''
  const h = document.createElement('h2')
  h.textContent = '还没有指定业务项目目录（repoRoot）'
  box.appendChild(h)
  const p = document.createElement('p')
  p.textContent = payload.error
  box.appendChild(p)
  const where = document.createElement('p')
  where.innerHTML = `<b>配置文件位置：</b>`
  where.appendChild(document.createTextNode(payload.guide.where))
  box.appendChild(where)
  const pre = document.createElement('pre')
  pre.textContent = payload.guide.example
  box.appendChild(pre)
  const effect = document.createElement('p')
  effect.textContent = payload.guide.takesEffect
  box.appendChild(effect)
}

export function el(tag, className) {
  const n = document.createElement(tag)
  if (className) n.className = className
  return n
}

// ── 状态汇总（首页业务卡小行与业务页汇总行共用）─────────────────────

/** 汇总顺序与文案：要处理的靠前；"异常"涵盖编号冲突与说明文件问题。 */
export const STATUS_SUMMARY_ORDER = [
  ['changed', '已改动'],
  ['invalid', '异常'],
  ['compare-failed', '无法比较'],
  ['no-snapshot', '无快照'],
  ['identical', '一致'],
]

/** 图的状态归类：编号冲突 / 说明文件问题算"异常"，其余用服务端算好的四状态。 */
export function chartStatusKind(chart) {
  if (chart.idConflict || chart.descriptorError) return 'invalid'
  return chart.currentStatus
}

/** 按状态清点图列表；只清点已知状态，未知值不伪造计数。 */
export function countChartStatuses(charts) {
  const counts = {}
  for (const chart of charts) {
    const kind = chartStatusKind(chart)
    if (STATUS_SUMMARY_ORDER.some(([value]) => value === kind)) counts[kind] = (counts[kind] || 0) + 1
  }
  return counts
}

/** 只读状态小行：只列非零状态；没有可展示的状态返回 null（不放空行占位）。 */
export function statusChips(charts) {
  const counts = countChartStatuses(charts)
  const present = STATUS_SUMMARY_ORDER.filter(([kind]) => counts[kind])
  if (present.length === 0) return null
  const row = el('div', 'chip-row')
  for (const [kind, label] of present) {
    const chip = el('span', 'badge')
    chip.dataset.kind = kind
    chip.textContent = `${label} ${counts[kind]}`
    row.append(chip)
  }
  return row
}

/** 业务卡（首页与展示页列表视图共用）：图标、序号、名称、介绍、状态小行、
 *  底部图数与进入动作。说明文件读不开的业务不清点，异常说明如实显示。 */
export function businessCard(business, index) {
  const card = el('a', 'card business-card')
  card.href = wsUrl(`/specdev-workbench/business/${encodeURIComponent(business.id)}`)
  const top = el('div', 'business-card-top')
  const icon = el('span', 'business-icon')
  icon.setAttribute('aria-hidden', 'true')
  icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/><path d="M10 6.5h5.5a2 2 0 0 1 2 2V14M6.5 10v5.5a2 2 0 0 0 2 2H14"/></svg>'
  const number = el('span', 'business-number')
  number.textContent = String(index + 1).padStart(2, '0')
  top.append(icon, number)
  const h = el('h3')
  h.textContent = business.name
  const p = el('p', 'business-intro')
  p.textContent = business.intro || '进入业务，查看流程图与相关说明。'
  card.append(top, h, p)
  if (!business.descriptorError) {
    const chips = statusChips(business.charts)
    if (chips) card.append(chips)
  }
  const footer = el('div', 'business-card-footer')
  const meta = el('span')
  if (business.descriptorError) {
    const warning = el('p', 'business-warning')
    warning.textContent = `说明文件问题：${business.descriptorError}`
    card.append(warning)
    meta.textContent = '查看异常说明'
  } else {
    meta.textContent = `${business.charts.length} 张流程图`
  }
  const action = el('span', 'business-enter')
  action.textContent = '进入业务 ↗'
  footer.append(meta, action)
  card.append(footer)
  return card
}

/** 当前状态徽标文案（§3.2：一致 / 已改动 / 无快照 / 无法比较，服务端算好传下来）。 */
export function statusBadge(status, title) {
  const text = status === 'identical' ? '一致' : status === 'changed' ? '已改动'
    : status === 'compare-failed' ? '无法比较' : '无快照'
  const titleAttr = title ? ` title="${String(title).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')}"` : ''
  return `<span class="badge" data-kind="${status}"${titleAttr}>${text}</span>`
}

// ── 第二期第 2 步：目录状态页与工作区行 ──────────────────────────────

/** 各状态的标题与补充说明：四状态分别说清，不能都显示成"暂无流程图"。 */
const REPO_STATE_COPY = {
  'no-convention-root': {
    title: '这里还没有流程图资料',
    status: '还没有流程图资料',
    note: '管理页只读不改：不会自动创建或修改这个目录里的任何文件。',
  },
  'bad-inventory': {
    title: '流程图资料格式有问题',
    status: '资料格式有问题',
    note: '修好对应的说明文件后，刷新本页即可读取。',
  },
  'repo-unavailable': {
    title: '目录读取不了',
    status: '目录读取不了',
    note: '工作区的目录可能被移动、删除或没有读取权限；从 DSH 的工作区重新进入试试。',
  },
  'not-a-git-repo': {
    title: '这个目录不是 Git 仓库',
    status: '不是 Git 仓库',
    note: '历史版本与快照信息存放在 Git 里，目录需要是可用的 Git 仓库才能管理。',
  },
  'repo-not-top-level': {
    title: '这个工作区不是 Git 仓库顶层',
    status: '不是仓库顶层',
    note: '目录在某个外层 Git 仓库里但不是仓库顶层，历史版本会与外层仓库混在一起；管理页只在仓库顶层工作，不会自动改绑。请把仓库顶层登记为工作区。',
  },
  'workspace-not-found': {
    title: '工作区不存在或已失效',
    status: '工作区已失效',
    note: '可能该工作区已被删除，或这个链接来自另一个 DSH 实例；请从 DSH 的工作区重新进入。',
  },
  'workspace-service-unavailable': {
    title: '当前 DSH 没有提供工作区服务',
    status: '工作区服务不可用',
    note: '可能是 DSH 版本变化。请从 DSH 的工作区重新进入；或改用手动配置模式（填 repoRoot，去掉链接里的 workspace 参数）。',
  },
}

/** 工作区信息一行字：工作区模式"工作区：名称（路径）"，手动模式"手动配置模式：路径"。 */
export function repoLineText(repo) {
  if (!repo) return ''
  return repo.mode === 'workspace'
    ? `工作区：${repo.title}（${repo.path}）`
    : `手动配置模式：${repo.path}`
}

/**
 * 按 error.code 渲染目录状态页（复用指引框的样式）；不属于已知状态的错误返回 false，
 * 调用方继续走普通报错。三个页面共用，保证同一状态在各页说法一致。
 * 错误响应带 repo 块：空状态/错误页也显示工作区名称、
 * 路径，并把标签标题带上工作区名——打开两个空项目时也能区分标签页。
 */
export function renderRepoState(error) {
  const copy = REPO_STATE_COPY[error && error.code]
  if (!copy) return false
  setStatus(copy.status, 'warn')
  const box = $('guideBox')
  box.hidden = false
  box.textContent = ''
  const h = document.createElement('h2')
  h.textContent = copy.title
  box.appendChild(h)
  if (error.repo) {
    document.title = pageTitle(copy.title, error.repo)
    const w = document.createElement('p')
    w.textContent = repoLineText(error.repo)
    box.appendChild(w)
  }
  if (error.message) {
    const p = document.createElement('p')
    p.textContent = error.message
    box.appendChild(p)
  }
  const note = document.createElement('p')
  note.textContent = copy.note
  box.appendChild(note)
  return true
}

/** 标签页标题：工作区模式带工作区名（两个标签好区分），手动模式保持原有后缀。 */
export function pageTitle(main, repo) {
  return repo && repo.mode === 'workspace' ? `${main} · ${repo.title}` : `${main} · SpecDev 工作台`
}

/** 头部工作区行：工作区模式显示"工作区：名称（路径）"，手动模式标注"手动配置模式：路径"。 */
export function renderRepoLine(repo) {
  const line = $('repoLine')
  if (!line || !repo) return
  line.textContent = repoLineText(repo)
  const details = $('workspaceDetails')
  if (details) {
    details.hidden = false
    $('workspaceLabel').textContent = repo.mode === 'workspace' ? `工作区 · ${repo.title}` : '手动配置的项目目录'
  }
}

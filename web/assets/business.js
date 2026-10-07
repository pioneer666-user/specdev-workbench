// 业务页：业务介绍、文档入口、图列表（每图带快照数与当前状态）。
import { $, chartStatusKind, el, fetchJson, pageTitle, renderEmptyWorkspaceParam, renderGuide, renderRepoState, setStatus, showError, workspaceParamEmpty, wsUrl } from './common.js'
import { createDocumentReader } from './document-reader.js'

function badge(text, kind) {
  const n = el('span', 'badge')
  n.dataset.kind = kind
  n.textContent = text
  return n
}

/** 图标只有本地固定几何，所有资料字符串仅写入textContent。 */
function documentIcon() {
  const ns = 'http://www.w3.org/2000/svg', icon = document.createElementNS(ns, 'svg')
  for (const [key, value] of Object.entries({ class: 'business-doc-icon', viewBox: '0 0 24 28', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5', 'aria-hidden': 'true' })) icon.setAttribute(key, value)
  const p = document.createElementNS(ns, 'path')
  p.setAttribute('d', 'M5 2h9l5 5v19H5zM14 2v6h5M8 13h8M8 17h8M8 21h5')
  icon.append(p)
  return icon
}

function businessIdFromLocation() {
  const parts = location.pathname.split('/').filter(Boolean) // ['specdev-workbench','business','<id>']
  return decodeURIComponent(parts[2] || '')
}

async function main() {
  if (workspaceParamEmpty) return renderEmptyWorkspaceParam()
  let id
  try { id = businessIdFromLocation() } catch { return showError('业务 id 编码不正确，请从项目首页重新进入。') }
  if (!id) return showError('缺少业务 id（路径应为 /specdev-workbench/business/<业务id>）')
  let inventory
  try {
    inventory = await fetchJson(wsUrl('/specdev-workbench/api/inventory'))
  } catch (error) {
    if (renderRepoState(error)) return
    return showError(error.message)
  }
  if (inventory.code === 'repo-not-configured') return renderGuide(inventory)

  const business = inventory.businesses.find((b) => b.id === id)
  if (!business) return showError(`业务不存在：${id}`)
  document.title = pageTitle(business.name, inventory.repo)
  $('title').textContent = business.name
  if (business.descriptorError) {
    $('intro').textContent = business.descriptorError
    setStatus('该业务的说明文件有问题，已被跳过展开', 'warn')
    return
  }
  if (business.intro) $('intro').textContent = business.intro

  // P1b-2 独立业务房间入口：业务有效（说明文件检查通过）就显示，链接带工作区标识；
  // 不为它预读房间接口——没有 room.json 时由房间页给出明确空态。
  const roomEntry = $('roomEntry')
  roomEntry.href = wsUrl(`/specdev-workbench/room/${encodeURIComponent(id)}`)
  $('roomEntryLine').hidden = false

  if (business.docs.length > 0) {
    const reader = createDocumentReader({ root: $('documentReader'), background: document.querySelector('.page-content'), businessId: id, documents: business.docs })
    const list = $('docList')
    for (const doc of business.docs) {
      const li = el('li')
      const a = el('a', 'business-doc-entry')
      a.href = '#documentReader'
      a.addEventListener('click', event => { event.preventDefault(); reader.open(doc, a) })
      const copy = el('span', 'business-doc-copy')
      const name = el('span', 'business-doc-name')
      name.textContent = doc.split('/').at(-1).replace(/\.md$/i, '')
      const path = el('span', 'business-doc-path')
      path.textContent = doc
      copy.append(name, path)
      const arrow = el('span', 'business-doc-arrow')
      arrow.textContent = '→'
      arrow.setAttribute('aria-hidden', 'true')
      a.append(documentIcon(), copy, arrow)
      li.appendChild(a)
      list.appendChild(li)
    }
  }
  $('docsCount').textContent = String(business.docs.length)
  $('docs').hidden = false
  $('docList').hidden = business.docs.length === 0
  $('docsEmpty').hidden = business.docs.length !== 0

  const root = $('root')
  root.textContent = ''
  for (const chart of business.charts) {
    const card = el('a', 'card business-chart-card')
    card.href = wsUrl(`/specdev-workbench/read/${encodeURIComponent(id)}/${encodeURIComponent(chart.id)}`)
    card.dataset.status = chartStatusKind(chart)
    const h = el('h3')
    h.textContent = chart.name
    card.appendChild(h)
    if (!chart.idConflict && !chart.descriptorError && chart.summary) {
      const p = el('p', 'business-chart-summary')
      p.textContent = chart.summary
      card.appendChild(p)
    }
    const state = el('div', 'business-chart-status')
    const text = chart.currentStatus === 'identical' ? '一致' : chart.currentStatus === 'changed' ? '已改动'
      : chart.currentStatus === 'compare-failed' ? '无法比较' : '无快照'
    state.append(badge(text, chart.currentStatus))
    if (chart.snapshotCount > 0) {
      const meta = el('span', 'business-chart-meta')
      meta.textContent = `快照 ${chart.snapshotCount} 版`
      state.append(meta)
    }
    if (chart.idConflict) {
      state.append(badge('编号冲突', 'invalid'))
    }
    if (chart.descriptorError) state.append(badge('说明文件问题', 'invalid'))
    card.append(state)
    if (chart.idConflict) {
      const p = el('p', 'business-chart-issue')
      p.textContent = chart.idConflict
      card.appendChild(p)
    }
    if (chart.descriptorError) {
      const p = el('p', 'business-chart-issue')
      p.textContent = chart.descriptorError
      card.appendChild(p)
    }
    if (chart.compareError) {
      const p = el('p', 'business-chart-issue')
      p.textContent = `无法比较：${chart.compareError}`
      card.appendChild(p)
    }
    if (chart.invalidTagCount > 0) {
      const p = el('p', 'business-chart-warning')
      p.textContent = `另有 ${chart.invalidTagCount} 个不合约定的标签被忽略`
      card.append(p)
    }
    const action = el('span', 'business-chart-action')
    action.textContent = chart.diagramType === 'lifecycle' ? '查看生命周期图 →' : '查看流程 →'
    card.append(action)
    root.appendChild(card)
  }
  $('chartsCount').textContent = String(business.charts.length)
  $('charts').hidden = false
  $('chartsEmpty').hidden = business.charts.length !== 0
  // 成功页不重复报业务/图数；错误和警告分支仍使用既有status容器。
  $('status').hidden = true
}

main()

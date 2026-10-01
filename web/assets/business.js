// 业务页：业务介绍、文档入口、图列表（每图带快照数与当前状态）。
import { $, chartStatusKind, countChartStatuses, el, fetchJson, pageTitle, renderEmptyWorkspaceParam, renderGuide, renderRepoLine, renderRepoState, setStatus, showError, STATUS_SUMMARY_ORDER, statusBadge, workspaceParamEmpty, wsUrl } from './common.js'

/** 图列表上方的状态汇总行：点某个状态跳到第一张该状态的图卡并闪一下框，
 *  图多时不用逐张扫徽标找"要处理的"。 */
function renderChartSummary(charts, root) {
  const box = $('chartSummary')
  if (!box) return
  const counts = countChartStatuses(charts)
  const present = STATUS_SUMMARY_ORDER.filter(([kind]) => counts[kind])
  if (present.length === 0) return
  for (const [kind, label] of present) {
    const chip = el('button', 'badge')
    chip.type = 'button'
    chip.dataset.kind = kind
    chip.textContent = `${label} ${counts[kind]}`
    chip.addEventListener('click', () => {
      const target = root.querySelector(`.card[data-status="${kind}"]`)
      if (!target) return
      target.scrollIntoView({ block: 'center' })
      target.classList.add('flash')
      setTimeout(() => target.classList.remove('flash'), 1200)
    })
    box.append(chip)
  }
  box.hidden = false
}

function businessIdFromLocation() {
  const parts = location.pathname.split('/').filter(Boolean) // ['specdev-workbench','business','<id>']
  return parts[2] || ''
}

async function main() {
  if (workspaceParamEmpty) return renderEmptyWorkspaceParam()
  const id = businessIdFromLocation()
  if (!id) return showError('缺少业务 id（路径应为 /specdev-workbench/business/<业务id>）')
  let inventory
  try {
    inventory = await fetchJson(wsUrl('/specdev-workbench/api/inventory'))
  } catch (error) {
    if (renderRepoState(error)) return
    return showError(error.message)
  }
  if (inventory.code === 'repo-not-configured') return renderGuide(inventory)
  renderRepoLine(inventory.repo)

  const business = inventory.businesses.find((b) => b.id === id)
  if (!business) return showError(`业务不存在：${id}`)
  document.title = pageTitle(business.name, inventory.repo)
  $('bizName').textContent = business.name
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
    const list = $('docList')
    for (const doc of business.docs) {
      const li = el('li')
      const a = el('a')
      a.href = wsUrl(`/specdev-workbench/api/doc?business=${encodeURIComponent(id)}&path=${encodeURIComponent(doc)}`)
      a.target = '_blank'
      a.rel = 'noopener'
      a.textContent = doc
      li.appendChild(a)
      list.appendChild(li)
    }
    $('docs').hidden = false
  }

  const root = $('root')
  root.textContent = ''
  for (const chart of business.charts) {
    const card = el('a', 'card')
    card.href = wsUrl(`/specdev-workbench/read/${id}/${chart.id}`)
    card.dataset.status = chartStatusKind(chart)
    const h = el('h2')
    h.textContent = chart.name
    h.insertAdjacentHTML('beforeend', statusBadge(chart.currentStatus, chart.compareError))
    card.appendChild(h)
    if (chart.idConflict) {
      const badge = el('span', 'badge')
      badge.dataset.kind = 'invalid'
      badge.textContent = '编号冲突'
      card.appendChild(badge)
      const p = el('p')
      p.textContent = chart.idConflict
      card.appendChild(p)
    } else if (chart.descriptorError) {
      const badge = el('span', 'badge')
      badge.dataset.kind = 'invalid'
      badge.textContent = '说明文件问题'
      card.appendChild(badge)
      const p = el('p')
      p.textContent = chart.descriptorError
      card.appendChild(p)
    } else if (chart.summary) {
      const p = el('p')
      p.textContent = chart.summary
      card.appendChild(p)
    }
    const meta = el('p', 'meta')
    const invalidNote = chart.invalidTagCount > 0 ? `，另有 ${chart.invalidTagCount} 个不合约定的标签被忽略` : ''
    meta.textContent = chart.snapshotCount > 0
      ? `快照 ${chart.snapshotCount} 版${invalidNote}`
      : `还没有保存过快照${invalidNote}`
    card.appendChild(meta)
    root.appendChild(card)
  }
  renderChartSummary(business.charts, root)
  setStatus(`${business.name}：${business.charts.length} 张图`, 'ok')
}

main()

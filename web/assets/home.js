// 首页只从现有清单汇总项目与业务，不推测代码活动或图与代码的同步情况。
import { $, businessCard, el, fetchJson, pageTitle, renderEmptyWorkspaceParam, renderGuide, renderRepoLine, renderRepoState, setStatus, showError, workspaceParamEmpty, wsUrl } from './common.js'

/**
 * 列表之后的次要入口：进建筑。只有这个项目**真有建筑**才出现——探测一次 /api/building：
 * 读到了（模型或诊断列表都算）就亮出来；「还没有建筑蓝图」或这一下没读到，入口就不出现，
 * 不给人一个点进去只看得到空态的按钮。只读、不改任何东西；探测失败不影响首页其余部分。
 */
async function revealBuildingLink() {
  const link = $('buildingLink')
  try {
    await fetchJson(wsUrl('/specdev-workbench/api/building'))
    link.hidden = false
  } catch {
    link.hidden = true
  }
}

async function main() {
  const root = $('root')
  try {
    if (workspaceParamEmpty) return renderEmptyWorkspaceParam()
    const inventory = await fetchJson(wsUrl('/specdev-workbench/api/inventory'))
    if (inventory.code === 'repo-not-configured') return renderGuide(inventory)

    document.title = pageTitle(inventory.project.name, inventory.repo)
    $('projectName').textContent = inventory.project.name
    $('projectDesc').textContent = inventory.project.description || '从业务出发，阅读流程、理解实现，回看每一个版本。'
    renderRepoLine(inventory.repo)

    const businesses = inventory.businesses
    const chartCount = businesses.reduce((count, business) => count + business.charts.length, 0)
    $('businessCount').textContent = businesses.length
    $('chartCount').textContent = chartCount
    $('chartCountNote').textContent = businesses.some((business) => business.descriptorError) ? '（不含读取异常的业务）' : ''
    $('projectMetrics').hidden = false
    $('heroActions').hidden = businesses.length === 0
    $('projectHero').hidden = businesses.length === 0
    $('stateHeading').hidden = businesses.length > 0
    $('stateHeading').textContent = inventory.project.name
    document.body.dataset.homeState = businesses.length > 0 ? 'ready' : 'empty'
    $('showcaseLink').hidden = businesses.length === 0
    // 没有业务就没有建筑（蓝图必须逐间绑业务），这种项目连探测都不发。
    if (businesses.length > 0) void revealBuildingLink()
    root.replaceChildren()

    for (const [index, business] of businesses.entries()) {
      root.append(businessCard(business, index))
    }
    if (businesses.length === 0) {
      const empty = el('div', 'empty-state')
      const h = el('h3')
      h.textContent = '项目已就绪，等待第一项业务'
      const p = el('p')
      p.textContent = '当前项目清单中还没有业务。添加业务资料后，刷新即可在这里查看。'
      empty.append(h, p)
      root.append(empty)
    }
    setStatus(`共 ${businesses.length} 个业务`, 'ok')
  } catch (error) {
    if (error.repo) renderRepoLine(error.repo)
    if (!renderRepoState(error)) showError(error.message)
  } finally {
    // 未取得可用项目时保留紧凑首屏，让共用错误与配置指引直接可见。
    if (document.body.dataset.homeState === 'loading') document.body.dataset.homeState = 'unavailable'
    root.querySelector('.loading-copy')?.remove()
    root.setAttribute('aria-busy', 'false')
  }
}

main()

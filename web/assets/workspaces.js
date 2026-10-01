// 只读宿主工作区；选择由作者完成，不猜当前项目或默认第一项。
;(() => {
  const list = document.getElementById('workspaceList')
  const status = document.getElementById('workspaceStatus')
  const error = document.getElementById('workspaceError')
  const empty = document.getElementById('workspaceEmpty')
  const retry = document.getElementById('workspaceRetry')
  const fallback = document.getElementById('workspaceFallback')
  let pending = false
  let gone = false
  let serial = 0
  let controller = null

  function entries(body) {
    if (!body || !Array.isArray(body.workspaces)) throw new Error('项目清单格式不正确，请重试。')
    const ids = new Set()
    for (const item of body.workspaces) {
      if (!item || typeof item.id !== 'string' || !item.id.trim()
        || typeof item.title !== 'string' || !item.title.trim() || typeof item.path !== 'string'
        || ids.has(item.id)) throw new Error('项目条目格式不正确，请重试。')
      ids.add(item.id)
    }
    return body.workspaces
  }
  async function load() {
    if (pending || gone) return
    pending = true
    const current = ++serial
    controller = new AbortController()
    const late = () => gone || current !== serial
    list.replaceChildren()
    list.setAttribute('aria-busy', 'true')
    error.hidden = empty.hidden = retry.hidden = fallback.hidden = true
    retry.disabled = true
    status.textContent = '正在读取项目清单…'
    try {
      const response = await fetch('/specdev-workbench/api/workspaces', { signal: controller.signal })
      if (late()) return
      if (!response.ok) throw new Error(`项目清单读取失败（HTTP ${response.status}），请重试。`)
      const body = await response.json()
      if (late()) return
      const projects = entries(body)
      const fragment = document.createDocumentFragment()
      for (const project of projects) {
        const item = document.createElement('li')
        const link = document.createElement('a')
        link.className = 'workspace-project'
        link.href = '/specdev-workbench/?workspace=' + encodeURIComponent(project.id)
        const name = document.createElement('span')
        name.className = 'workspace-title'; name.textContent = project.title
        const location = document.createElement('span')
        location.className = 'workspace-path'; location.textContent = project.path
        link.append(name, location); item.append(link); fragment.append(item)
      }
      list.replaceChildren(fragment)
      status.textContent = projects.length ? `共 ${projects.length} 个项目，请选择。` : '暂无项目'
      empty.hidden = fallback.hidden = projects.length !== 0
    } catch (reason) {
      if (late()) return
      list.replaceChildren()
      status.textContent = '项目清单读取失败'
      error.textContent = reason instanceof SyntaxError ? '项目清单不是有效 JSON，请重试。' : String(reason?.message ?? reason)
      error.hidden = retry.hidden = fallback.hidden = false
    } finally {
      if (!late()) {
        pending = false; controller = null
        list.setAttribute('aria-busy', 'false')
        retry.disabled = false
      }
    }
  }
  retry.addEventListener('click', load)
  window.addEventListener('pagehide', () => {
    gone = true; serial += 1; pending = false
    controller?.abort(); controller = null
  })
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) { gone = false; void load() }
  })
  void load()
})()

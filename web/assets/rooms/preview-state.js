// 串行所有权：只准备当前单件；切换、暂停或关闭使在途句柄失效。
export function createPreviewState({ prepare, attach, detach, onStatus = () => {} }) {
  let target = null, current = null, handle = null, busy = false, paused = false, disposed = false, generation = 0
  function release() {
    if (!handle) return
    detach(handle); handle.dispose(); handle = null; current = null
  }
  async function pump() {
    if (busy || paused || disposed || !target || current === target) return
    const item = target, ticket = generation
    busy = true
    onStatus('loading', '正在准备家具预览…')
    try {
      const next = await prepare(item, () => !disposed && !paused && ticket === generation)
      if (disposed || paused || ticket !== generation) next.dispose()
      else {
        handle = next; current = item
        attach(next, item)
        onStatus('ready', '拖动旋转 · 滚轮缩放')
      }
    } catch (error) {
      if (!disposed && !paused && ticket === generation) {
        release()
        onStatus('error', `预览暂不可用：${error.message}`)
      }
    } finally {
      busy = false
      // 同一失败不自动重试；只有真实换目标/恢复/明确重试才继续。
      if (!disposed && !paused && ticket !== generation) void pump()
    }
  }
  return {
    show(item) { if (disposed || item === target) return; generation++; target = item; release(); if (!item) onStatus('empty', '房间里还没有家具'); void pump() },
    suspend(value) { if (disposed || paused === value) return; paused = value; generation++; if (!value) void pump() },
    retry() { if (!disposed && !paused && target && !handle) { generation++; void pump() } },
    dispose() { if (disposed) return; disposed = true; generation++; target = null; release() },
  }
}

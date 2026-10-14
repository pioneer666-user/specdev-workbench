// 完整手势保留最大位移；拖出阈值再回来仍不可当点击。
export function createPickGesture() {
  let start = null
  const cancel = () => { start = null }
  const move = event => {
    if (start && event.pointerId === start.id && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) start.dragged = true
  }
  return {
    down(event) { cancel(); if (event.button !== 0 || event.isPrimary === false) return; start = { id: event.pointerId, x: event.clientX, y: event.clientY, dragged: false } },
    move, cancel,
    up(event) { move(event); const saved = start; cancel(); return !!saved && saved.id === event.pointerId && event.button === 0 && !saved.dragged },
  }
}

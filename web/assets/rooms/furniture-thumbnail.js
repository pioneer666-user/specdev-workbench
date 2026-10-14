import { offlineRuntime } from '../runtime-mode.js'

// 静态包内缩略图；离线只消费内嵌WebP，不回原服务找图、不创建3D渲染器。
export function createFurnitureThumbnail(doc, item) {
  const box = doc.createElement('span'); box.className = 'furniture-thumbnail'
  const runtime = offlineRuntime()
  const source = runtime ? runtime.previewImage?.(item.previewUrl) : item.previewUrl
  const empty = () => { box.textContent = '家具'; box.classList.add('furniture-thumbnail-empty') }
  if (!source) empty()
  else {
    const image = doc.createElement('img'); image.src = source; image.alt = ''
    image.width = image.height = 64; image.loading = 'lazy'; image.decoding = 'async'
    image.addEventListener('error', empty, { once: true }); box.append(image)
  }
  return box
}

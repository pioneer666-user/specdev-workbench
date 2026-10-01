// 家具图鉴页（E9b）：经真实 loadFurnitureCatalog 读取随包共用家具库，展示真实缩略图、
// 名称、尺寸、风格、放置方式与互动；页内勾选生成「名称＋assetId」清单，供用户复制回
// 聊天交 AI 布置。纯看图挑选页：不加载模型（loader 只用于确认引用）、不按业务过滤、
// 不请求 inventory / /api/room、不写业务数据；选择只存本页内存，刷新即清空。
// 所有外部名称、描述、错误一律 textContent / DOM 安全赋值，不拼 HTML。
import { loadFurnitureCatalog } from './furniture/catalog.js'
import { $, fetchJson, renderEmptyWorkspaceParam, setStatus, workspaceParamEmpty } from './common.js'

const INDEX_URL = '/specdev-workbench/assets/furniture/index.json'
const ASSET_ROOT = '/specdev-workbench/assets/furniture/'

// 风格标记固定映射；未知值按原文字展示，不伪装成已知风格。
const STYLE_LABELS = { fairy: '童话', ceramic: '陶瓷', realistic: '写实' }
// 放置方式转人话；详细限制以元数据描述为准，这里不复制 placement 算法。
const KIND_LABELS = { floor: '落地摆放', surface: '放桌面／承载面' }
// 互动能力固定映射；没有的能力不伪造入口。
const CAPABILITY_LABELS = { 'open-document-collection': '可查看文档与流程图' }

const sizeText = (asset) => {
  const b = asset.bounds
  if (!b || typeof b !== 'object') return '尺寸信息不完整'
  // 先检查原始轴值，避免减法把 null、布尔值或数字字符串悄悄转换成有效尺寸。
  if (![b.minX, b.maxX, b.minZ, b.maxZ, b.minY, b.maxY].every(Number.isFinite)) return '尺寸信息不完整'
  const width = b.maxX - b.minX
  const depth = b.maxZ - b.minZ
  const height = b.maxY - b.minY // Y 是高度轴；深度取 Z，不把 Y 当深度
  if (![width, depth, height].every(Number.isFinite)) return '尺寸信息不完整'
  return `宽×深×高：${width.toFixed(2)} × ${depth.toFixed(2)} × ${height.toFixed(2)} 米`
}

const kindText = (asset) => {
  const kinds = Array.isArray(asset.placement?.allowedKinds) ? asset.placement.allowedKinds : []
  const labels = kinds.map((kind) => KIND_LABELS[kind] ?? String(kind))
  return labels.length > 0 ? labels.join('或') : '放置方式见详情'
}

const capabilityText = (asset) => {
  const caps = Array.isArray(asset.capabilities) ? asset.capabilities : []
  const labels = caps.map((cap) => CAPABILITY_LABELS[cap] ?? String(cap))
  return labels.length > 0 ? labels.join('；') : '无页内动作'
}

const el = (tag, className) => {
  const node = document.createElement(tag)
  if (className) node.className = className
  return node
}

// ── 选择集：assetId → 名称，清单输出按目录顺序稳定排列；不落任何存储。 ──────────
const selection = new Map()
let catalogOrder = [] // 目录里的 assetId 顺序（加载成功后填充），清单按它排序
let selectionVersion = 0 // 每次变化自增：晚到的复制结果不能误称当前清单已复制
let copyNoteTimer = 0

const listText = () => {
  const lines = []
  for (const assetId of catalogOrder) {
    if (!selection.has(assetId)) continue
    lines.push(`- ${selection.get(assetId)}（assetId：${assetId}）`)
  }
  return [
    '【家具图鉴挑选清单】',
    ...lines,
    '默认每款一件。请结合已说明的风格和用途布置；数量或其他要求可以补充；放不下或承载冲突时先说明。',
  ].join('\n')
}

const refreshPicker = () => {
  $('pickCount').textContent = `已选 ${selection.size} 款`
  const empty = selection.size === 0
  $('copyButton').disabled = empty
  $('clearButton').disabled = empty
  $('pickList').value = empty ? '' : listText()
}

const showCopyNote = (text, kind) => {
  const note = $('copyNote')
  note.textContent = text
  note.dataset.kind = kind
  note.hidden = false
}

const onPickChange = () => {
  selectionVersion += 1
  $('copyNote').hidden = true // 选择变化后旧的「已复制」提示失效
  refreshPicker()
}

// ── 卡片 ──────────────────────────────────────────────────────────────────────
/** 缩略图：previewRef 为 null 直接显示暂无图片；加载失败一次性降级，不反复请求。 */
const mountThumb = (box, asset) => {
  if (typeof asset.previewRef !== 'string' || asset.previewRef === '') {
    mountNoPreview(box, asset)
    return
  }
  const img = el('img')
  img.alt = `${asset.name} 缩略图`
  img.loading = 'lazy'
  img.src = ASSET_ROOT + asset.previewRef // 固定包前缀＋目录校验过的 previewRef，不接外链
  img.addEventListener('error', () => mountNoPreview(box, asset), { once: true })
  box.appendChild(img)
}

const mountNoPreview = (box, asset) => {
  box.textContent = ''
  const p = el('p', 'no-preview')
  p.textContent = `暂无图片（${asset.name} 的名称与选择功能不受影响）`
  box.appendChild(p)
}

const mountCard = (asset) => {
  const card = el('article', 'furniture-card')
  const pick = el('label', 'furniture-pick')
  const box = document.createElement('input')
  box.type = 'checkbox'
  box.checked = selection.has(asset.assetId)
  box.addEventListener('change', () => {
    if (box.checked) selection.set(asset.assetId, asset.name)
    else selection.delete(asset.assetId)
    onPickChange()
  })
  const name = el('span', 'furniture-name')
  name.textContent = asset.name
  pick.append(box, name)

  const thumb = el('div', 'furniture-thumb')
  mountThumb(thumb, asset)

  const size = el('p', 'furniture-size')
  size.textContent = sizeText(asset)
  const styleLine = el('p', 'furniture-meta')
  const styleNames = (Array.isArray(asset.styleIds) ? asset.styleIds : [])
    .map((id) => STYLE_LABELS[id] ?? String(id)).join('、')
  styleLine.textContent = `风格：${styleNames || '未标注'}（风格可混搭）`
  const kindLine = el('p', 'furniture-meta')
  kindLine.textContent = `放置：${kindText(asset)}`
  const capLine = el('p', 'furniture-meta')
  capLine.textContent = `互动：${capabilityText(asset)}`
  const idLine = el('p', 'asset-id')
  idLine.textContent = `assetId：${asset.assetId}`

  const details = el('details')
  const summary = el('summary')
  summary.textContent = '用途与详情'
  const description = el('p')
  description.textContent = asset.description
  const recommend = el('p')
  recommend.textContent = asset.recommendations?.note ?? ''
  details.append(summary, description)
  if (recommend.textContent !== '') details.append(recommend)

  card.append(pick, thumb, size, styleLine, kindLine, capLine, idLine, details)
  return card
}

// ── 目录加载与渲染 ────────────────────────────────────────────────────────────
// run 序号：离页（含往返缓存离开）后晚到的目录结果不再改 DOM；bfcache 返回若还停在
// 加载态则用新序号重读一次，不永久卡在「正在加载」。
let runSerial = 0
let finished = false
let pageGone = false // 离页后晚到的复制回调也不再改 DOM（返回时复位）

const renderCatalog = (catalog, categories) => {
  const main = $('catalog')
  main.textContent = ''
  if (catalog.assets.length === 0) {
    const empty = el('p', 'furniture-empty')
    empty.textContent = '目录里还没有登记家具。'
    main.appendChild(empty)
    return
  }
  // 分类映射来自同一次 loader 验证成功的索引：叶类型 → 分类名；映射不全时整页退回单一列表。
  const leafToName = new Map()
  for (const category of categories ?? []) {
    for (const type of Array.isArray(category.types) ? category.types : []) leafToName.set(type, category.name)
  }
  const groups = new Map() // 分类名 → 资产数组；组顺序按索引 categories 声明顺序
  const categoryOrder = []
  for (const category of categories ?? []) {
    if (isNonEmpty(category?.name)) categoryOrder.push(category.name)
  }
  const groupOrder = []
  const groupOf = (name) => {
    if (!groups.has(name)) { groups.set(name, []); groupOrder.push(name) }
    return groups.get(name)
  }
  for (const name of categoryOrder) groupOf(name) // 先按声明顺序立组（空组不渲染）
  let fallbackUsed = false
  for (const asset of catalog.assets) {
    const groupName = leafToName.get(asset.category)
    if (groupName === undefined) { groupOf('全部家具'); fallbackUsed = true }
    else groups.get(groupName).push(asset)
  }
  const toRender = groupOrder.filter((name) => (groups.get(name) ?? []).length > 0)
  if (toRender.length === 1 && toRender[0] === '全部家具') {
    const grid = el('div', 'furniture-cards')
    for (const asset of catalog.assets) grid.appendChild(mountCard(asset))
    main.appendChild(grid)
    return
  }
  for (const name of toRender) {
    const group = el('section', 'furniture-group')
    const h = el('h2')
    h.textContent = name
    const note = el('p', 'group-note')
    note.textContent = fallbackUsed && name === '全部家具'
      ? '这些款式没有归入分类。勾选想要的款式，稍后在页面顶部复制清单。'
      : '勾选想要的款式，稍后在页面顶部复制清单。'
    const grid = el('div', 'furniture-cards')
    for (const asset of groups.get(name)) grid.appendChild(mountCard(asset))
    group.append(h, note, grid)
    main.appendChild(group)
  }
}

const isNonEmpty = (value) => typeof value === 'string' && value !== ''

const main = async () => {
  const run = ++runSerial
  finished = false
  let loadedIndex = null
  // 轻量包装：目录读取仍走真实 fetchJson 与 loader 校验，这里只额外记下读到的索引，
  // 供分类映射使用；不改 catalog 的返回契约，也不另建分类目录。
  const tracingFetch = async (url) => {
    const body = await fetchJson(url)
    if (url === INDEX_URL && body && typeof body === 'object' && !Array.isArray(body)) loadedIndex = body
    return body
  }
  let result
  try {
    result = await loadFurnitureCatalog({ fetchJson: tracingFetch })
  } catch (error) {
    if (run !== runSerial) return // 已离页或已被新一轮取代，晚到结果不碰 DOM
    setStatus('读取失败', 'bad')
    $('errorBox').hidden = false
    $('errorBox').textContent = `读取家具目录时出现未预料的错误：${error instanceof Error ? error.message : String(error)}`
    finished = true
    return
  }
  if (run !== runSerial) return
  finished = true
  if (!result.ok) {
    setStatus('目录读取失败', 'bad')
    $('errorBox').hidden = false
    $('errorBox').textContent = result.diagnostics.map((d) => d.message).join('\n')
    $('catalog').textContent = '' // 坏目录不残留半份列表
    return
  }
  setStatus(`已加载 ${result.catalog.assets.length} 款家具`, 'ok')
  catalogOrder = result.catalog.assets.map((asset) => asset.assetId)
  renderCatalog(result.catalog, Array.isArray(loadedIndex?.categories) ? loadedIndex.categories : null)
  refreshPicker()
  $('picker').hidden = false
  $('pickListBox').hidden = false
}

// ── 复制与清空 ────────────────────────────────────────────────────────────────
$('clearButton').addEventListener('click', () => {
  selection.clear()
  for (const input of document.querySelectorAll('.furniture-pick input')) input.checked = false
  onPickChange()
})

$('copyButton').addEventListener('click', () => {
  const text = listText()
  const version = selectionVersion
  const note = $('copyNote')
  note.hidden = true
  const myTimer = ++copyNoteTimer
  const late = () => myTimer !== copyNoteTimer // 期间又点了复制：旧结果不再覆盖新结果
  if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
    showCopyNote('当前环境没有可用的复制接口，请在下方文本框全选后手动复制。', 'bad')
    return
  }
  navigator.clipboard.writeText(text).then(
    () => {
      if (pageGone || late()) return // 离页后的晚到提示不再写入 DOM
      if (version !== selectionVersion) {
        showCopyNote('清单在复制后发生了变化，刚复制的内容不是当前清单，请重新复制。', 'bad')
        return
      }
      showCopyNote('已复制。把清单粘贴到聊天发给 AI，即可按选择布置房间。', 'ok')
    },
    () => {
      if (pageGone || late()) return
      showCopyNote('复制被浏览器拒绝，请在下方文本框全选后手动复制。', 'bad')
    },
  )
})

window.addEventListener('pagehide', () => { runSerial += 1; pageGone = true }) // 离页后在途结果（含复制回调）全部失效
window.addEventListener('pageshow', (event) => {
  pageGone = false
  // 往返缓存返回：若此前停在加载态（未完成），重新读取；已完成则原样保留。
  if (event.persisted && !finished) void main()
})

if (workspaceParamEmpty) {
  renderEmptyWorkspaceParam()
} else {
  void main()
}

// 说明文档（details.md）解析：纯函数，不碰 DOM，Node 侧可直接 import 测试。
// 约定：一级标题 `#` 是图的总说明；`## <节点 id>` 分节，
// 节内为自由 Markdown。图上不存在但详情写了的 id —— 容忍，不报错（删节点后旧详情不必同步清）；
// 图上存在但详情缺失的节点 —— 只列为"没写说明"，不算错误。

/** 去掉首尾空行，不去中间（节内空行保留，段落由 parseBody 再拆）。 */
function trimBlank(lines) {
  let start = 0
  let end = lines.length
  while (start < end && !lines[start].trim()) start += 1
  while (end > start && !lines[end - 1].trim()) end -= 1
  return lines.slice(start, end)
}

/** 拆出总说明与各分节（按文件出现顺序）。空文件/非字符串 → 空结果。 */
export function parseDetails(text) {
  const result = { title: '', sections: [] }
  if (typeof text !== 'string' || !text.trim()) return result
  let current = null
  // 正在其中的代码块围栏（``` 或 ~~~）：围栏里的 `#`/`##` 是演示示例不是标题，
  // 当正文原样保留——不然示例会截断上一节，还会冒充别的节点的说明
  let fence = null
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trimEnd()
    const fenceMark = /^ {0,3}(`{3,}|~{3,})/.exec(line)
    if (fence) {
      // 关围栏：同种字符、不短于开的时候、后面没字（后面有字算围栏里的正文）
      if (fenceMark && fenceMark[1][0] === fence[0] && fenceMark[1].length >= fence.length
        && !line.slice(fenceMark[0].length).trim()) fence = null
      if (current) current.body.push(rawLine)
      continue
    }
    if (fenceMark) {
      fence = fenceMark[1]
      if (current) current.body.push(rawLine)
      continue
    }
    // 一级标题只在首个分节之前算"总说明"；分节里的 `#` 属于正文
    const heading1 = /^#[ \t]+(.+?)[ \t]*$/.exec(line)
    if (heading1 && !current) {
      result.title = heading1[1].trim()
      continue
    }
    // `^##[ \t]` 不会匹配 `###`（第三个字符不是空白），三级标题因此留在节内
    const heading2 = /^##[ \t]+(.+?)[ \t]*$/.exec(line)
    if (heading2) {
      // 约定写纯节点 id；多写的字不丢正文，按空白切成 id 与剩余文字
      const [id, ...rest] = heading2[1].trim().split(/\s+/)
      current = { id, note: rest.join(' '), body: [] }
      result.sections.push(current)
      continue
    }
    if (current) current.body.push(rawLine)
  }
  for (const section of result.sections) section.body = trimBlank(section.body).join('\n')
  return result
}

/**
 * 把说明文档与图上节点对上，供页面直接渲染。
 * nodes 为空数组表示"图读不开、判断不了归属"（例如 workflow.json 坏了）：
 * 此时不把条目判成图外条目，按原样列出。
 * nodes 里混进非对象或缺 id 的坏条目（如 JSON 里写了 null）：跳过它们，不让页面崩——
 * 图本身已由渲染区报错，这里不再因为同一份坏文件二次崩页。
 */
export function buildDetails(text, nodes) {
  const parsed = parseDetails(text)
  const chartNodes = (Array.isArray(nodes) ? nodes : []).filter(
    (node) => node && typeof node === 'object' && !Array.isArray(node) && typeof node.id === 'string',
  )
  const known = chartNodes.length > 0
  const byId = new Map(chartNodes.map((node) => [node.id, node]))
  const seen = new Set()
  // 同一编号写多节：不算错，但要让人知道——块上带这个编号在文档里出现的次数，
  // 详情弹层据此提示"显示的是第一份"，而不是默默挑一份
  const times = new Map()
  for (const section of parsed.sections) times.set(section.id, (times.get(section.id) || 0) + 1)
  const blocks = []
  const strays = []
  for (const section of parsed.sections) {
    seen.add(section.id)
    const node = byId.get(section.id)
    const entry = {
      id: section.id,
      label: node ? node.label || node.id : section.id,
      sublabel: node && node.sublabel ? node.sublabel : '',
      note: section.note || '',
      body: section.body,
      repeats: times.get(section.id) || 1,
      onChart: known ? Boolean(node) : null,
    }
    if (entry.onChart === false) strays.push(entry)
    else blocks.push(entry)
  }
  const missing = known
    ? chartNodes.filter((node) => !seen.has(node.id)).map((node) => ({ id: node.id, label: node.label || node.id }))
    : []
  const hasText = typeof text === 'string' && Boolean(text.trim())
  return {
    empty: !hasText,
    title: parsed.title,
    // 有内容却没有分节：没按约定写（只有总说明也算），页面据此说明为什么只有一段
    malformed: hasText && parsed.sections.length === 0,
    blocks,
    strays,
    missing,
  }
}

/**
 * 在说明文档结果里找某个节点的这一节（详情弹层用）。只做判断与查找，不拼文案——措辞由页面
 * 按同一个版本的情况写，弹层与说明面板才说得一样。返回 { kind, ... }：
 *   'unreadable' 文档在但读不开（如超过大小上限）：给 unreadable 原因即此态
 *   'empty'      这个版本没有说明文档
 *   'section'    找到这一节：block 就是说明面板里那一块（正文/名字/副标签/编号都在里面）；
 *                同一编号在文档里写了多节时 repeats 带次数（取按出现顺序的第一份，
 *                页面要据此提示，不能默默挑一份）
 *   'malformed'  有文档但没按约定分节（每节应以「## 节点编号」开头）
 *   'missing'    文档按约定分了节，但没有这个节点的
 * 五种之外不会有第六种：图上有的节点，落到后四种之一必然说得出原因。
 */
export function findSection(doc, id, { unreadable = '' } = {}) {
  if (unreadable) return { kind: 'unreadable', reason: unreadable }
  if (!doc || doc.empty) return { kind: 'empty' }
  // 图外条目（旧编号）也认：配上就显示，不因为"图上没有"就当没写
  const block = doc.blocks.find((item) => item.id === id) || doc.strays.find((item) => item.id === id)
  if (block) return { kind: 'section', block, repeats: block.repeats || 1 }
  if (doc.malformed) return { kind: 'malformed' }
  return { kind: 'missing', id }
}

/**
 * 正文分块内核：空行分段、`-`/`*`/`数字.` 列表；headings 打开时把 `#` 标题单独成块
 * （房内资料面板读整篇业务文档要标题；节点详情的节内正文不按标题切）。
 * 只认最常见的写法，不假装是完整 Markdown 解析器。
 */
function parseBlocks(text, headings) {
  const items = []
  let paragraph = []
  const flush = () => {
    if (paragraph.length) {
      items.push({ kind: 'paragraph', text: paragraph.join(' ') })
      paragraph = []
    }
  }
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) {
      flush()
      continue
    }
    const heading = headings ? /^(#{1,6})[ \t]+(.+?)[ \t]*$/.exec(trimmed) : null
    if (heading) {
      flush()
      items.push({ kind: 'heading', level: heading[1].length, text: heading[2] })
      continue
    }
    const bullet = /^(?:[-*+]|\d+\.)[ \t]+(.*)$/.exec(trimmed)
    if (bullet) {
      flush()
      items.push({ kind: 'bullet', text: bullet[1] })
    } else {
      paragraph.push(trimmed)
    }
  }
  flush()
  return items
}

/**
 * 一节正文拆成段落与列表项。只认最常见的写法（空行分段、`-`/`*`/`数字.` 列表），
 * 不假装是完整 Markdown 解析器。
 */
export const parseBody = (text) => parseBlocks(text, false)

/**
 * 整篇文档的正文分块（房内资料面板读业务文档用）：与 parseBody 同一口径，多认 `#` 标题行。
 * 标题按层级给 { kind: 'heading', level 1..6, text }，页面据此决定用几级标题呈现。
 */
export const parseDocument = (text) => parseBlocks(text, true)

/** 行内标记：**加粗** 与 `代码`。返回片段数组，页面拼 DOM 用（不经 innerHTML）。 */
export function splitInline(text) {
  const parts = []
  const pattern = /\*\*([^*]+)\*\*|`([^`]+)`/g
  let last = 0
  let match
  while ((match = pattern.exec(String(text ?? '')))) {
    if (match.index > last) parts.push({ text: String(text).slice(last, match.index) })
    if (match[1] !== undefined) parts.push({ text: match[1], strong: true })
    else parts.push({ text: match[2], code: true })
    last = pattern.lastIndex
  }
  const source = String(text ?? '')
  if (last < source.length) parts.push({ text: source.slice(last) })
  return parts
}

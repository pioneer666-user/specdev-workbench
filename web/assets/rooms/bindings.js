// 家具资料绑定校验（E3a；E9c 扩展流程图）：确认某个家具实例绑定的文档与流程图，
// 确实属于当前业务的登记清单——文档来自 business.json 的 docs，图来自本业务目录内
// 按既有规则扫描出的图目录（/api/room 响应的 business.charts 投影；business.json
// 没有 charts 登记数组）。纯逻辑模块：不算坐标、不调用 Three、不 fetch、不读磁盘、
// 不引入 Node API，也不复制 placement——空间仍归 placement 校验，本模块只管
// "动作与资料身份"这半边。输入是 /api/room 响应里的 business/layout 与插件固定
// catalog；生产页面先跑真实 validatePlacement，成功后再调用本模块。
//
// 文档身份＝当前工作区该业务 business.json docs 里登记的原始路径：不 trim、不正规化、
// 不当 URL、不拼文件系统；读取安全继续由 /api/doc 提供，这里只生成固定接口链接。
// 图身份＝当前业务的图 ID（图目录名）：只收字符串 ID，不收路径、URL、workspace、
// 版本或对象；阅读链接固定生成 /specdev-workbench/read/<编码业务ID>/<编码图ID>，
// 不含 workspace，由页面侧补。

/** 与 src/core/room.ts 的 ID_PATTERN 同规则（core 不 import dsh，两处同步）。 */
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

/** 首版唯一动作：打开资料集合。E9c 起该动作代表"文档＋流程图"的资料集合，
 *  动作名与十二款资产的 capabilities 不批量改名；不因此让灯、桌或展示台自动具有资料能力。 */
export const BINDING_ACTION = 'open-document-collection'

/** 绑定条目的必填字段（instanceId、action、documents）＋唯一可选字段 charts（E9c）。 */
const BINDING_REQUIRED_FIELDS = ['instanceId', 'action', 'documents']
const BINDING_ALLOWED_FIELDS = [...BINDING_REQUIRED_FIELDS, 'charts']

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value)
const isNonEmptyString = (value) => typeof value === 'string' && value !== ''

function diag(code, message, { instanceIds = [], fieldPath = '' } = {}) {
  return { code, instanceIds, fieldPath, message }
}

/**
 * 解析并校验房间资料绑定（文档＋流程图）。
 * @returns {{ ok: boolean,
 *             diagnostics: Array<{ code: string, instanceIds: string[], fieldPath: string, message: string }>,
 *             directory: Array<{ kind: 'document', businessId: string, path: string, title: string, href: string } | { kind: 'workflow', businessId: string, chartId: string, title: string, href: string, unavailableReason?: string }>,
 *             bindings: Array<{ instanceId: string, assetId: string, action: string,
 *                                entries: Array<{ kind: 'document', businessId: string, path: string, title: string, href: string } | { kind: 'workflow', businessId: string, chartId: string, title: string, href: string, unavailableReason?: string }> }> }}
 *   成功 ok:true、diagnostics 空；任何绑定错误 ok:false 且 bindings 整体为空（不交付部分有效动作）。
 *   业务身份、docs 与 charts 目录可信、仅绑定条目有错时 directory 仍完整返回（供"业务资料"备用入口）；
 *   业务输入坏（含 business.charts 坏形状）、身份不匹配时 directory 也为空。图表中带
 *   descriptorError/idConflict 的不可用图保留身份并给条目 unavailableReason（不静默过滤）；
 *   绑定到这类图才报 BINDING_CHART_UNAVAILABLE，未绑定时不再连带。
 */
export function resolveRoomBindings(input) {
  const diagnostics = []
  const directory = []
  const bindings = []

  // ⓪ 最外层参数：普通对象才继续（null／数组／字符串／数字等调用错误统一返回诊断，
  // 不在参数解构位置抛 TypeError）。边界限于 JSON 能得到的普通数据与常规调用错误。
  if (!isObject(input)) {
    diagnostics.push(diag(
      'BINDING_INPUT',
      `参数必须是包含 business、layout、catalog 的对象（实际是 ${input === null ? 'null' : Array.isArray(input) ? '数组' : typeof input}）`,
      { fieldPath: 'input' },
    ))
    return { ok: false, diagnostics, directory, bindings }
  }
  const { business, layout, catalog } = input

  // ① 业务前提：对象、合法 id、说明文件无错、docs 为非空字符串数组。前提坏了 directory 也为空。
  if (!isObject(business) || !isNonEmptyString(business.id) || !ID_PATTERN.test(business.id)) {
    diagnostics.push(diag(
      'BINDING_INPUT',
      `business 必须是带合法 id（字母数字开头，可含 . _ -）的对象，实际 id：${JSON.stringify(isObject(business) ? business.id : business)}`,
      { fieldPath: 'business.id' },
    ))
    return { ok: false, diagnostics, directory, bindings }
  }
  if (business.descriptorError) {
    diagnostics.push(diag(
      'BINDING_INPUT',
      `业务 ${business.id} 的说明文件有问题，不能当作可用业务：${business.descriptorError}`,
      { fieldPath: 'business.descriptorError' },
    ))
    return { ok: false, diagnostics, directory, bindings }
  }
  if (!Array.isArray(business.docs) || !business.docs.every(isNonEmptyString)) {
    diagnostics.push(diag(
      'BINDING_INPUT',
      `业务 ${business.id} 的 docs 必须是非空字符串组成的数组（登记清单本身有问题，不能据此校验绑定）`,
      { fieldPath: 'business.docs' },
    ))
    return { ok: false, diagnostics, directory, bindings }
  }
  // business.charts 投影（E9c）：省略按 [] 兼容旧调用；显式存在就必须是合法形状。
  // 坏形状（null／非数组／条目非对象／非法 ID／重复 ID／非字符串名称或错误标记）返回
  // BINDING_INPUT 与准确字段位置——业务前提坏了，目录也不交付（不交半份业务目录）。
  const chartList = business.charts === undefined ? [] : business.charts
  if (!Array.isArray(chartList)) {
    diagnostics.push(diag(
      'BINDING_INPUT',
      `业务 ${business.id} 的 charts 必须是图目录数组（省略视为没有流程图；实际是 ${chartList === null ? 'null' : typeof chartList}）`,
      { fieldPath: 'business.charts' },
    ))
    return { ok: false, diagnostics, directory, bindings }
  }
  const chartById = new Map()
  for (const [index, chart] of chartList.entries()) {
    const at = `business.charts[${index}]`
    if (!isObject(chart) || !isNonEmptyString(chart.id) || !ID_PATTERN.test(chart.id)) {
      diagnostics.push(diag(
        'BINDING_INPUT',
        `${at} 必须是带合法 id（字母数字开头，可含 . _ -）的图目录对象，实际 id：${JSON.stringify(isObject(chart) ? chart.id : chart)}`,
        { fieldPath: `${at}.id` },
      ))
      return { ok: false, diagnostics, directory, bindings }
    }
    if (chartById.has(chart.id)) {
      diagnostics.push(diag(
        'BINDING_INPUT',
        `图目录里 ${chart.id} 重复登记（${at}）`,
        { fieldPath: `${at}.id` },
      ))
      return { ok: false, diagnostics, directory, bindings }
    }
    if (!isNonEmptyString(chart.name)) {
      diagnostics.push(diag(
        'BINDING_INPUT',
        `${at}.name 必须是非空字符串（实际是 ${JSON.stringify(chart.name)}）`,
        { fieldPath: `${at}.name` },
      ))
      return { ok: false, diagnostics, directory, bindings }
    }
    for (const marker of ['descriptorError', 'idConflict']) {
      if (chart[marker] !== undefined && !isNonEmptyString(chart[marker])) {
        diagnostics.push(diag(
          'BINDING_INPUT',
          `${at}.${marker} 存在时必须是非空字符串（实际是 ${JSON.stringify(chart[marker])}）`,
          { fieldPath: `${at}.${marker}` },
        ))
        return { ok: false, diagnostics, directory, bindings }
      }
    }
    chartById.set(chart.id, chart)
  }

  // ② 归属前提：layout 是对象且 businessId 与 business.id 严格相同（不静默对齐）。
  if (!isObject(layout)) {
    diagnostics.push(diag('BINDING_INPUT', 'layout 必须是对象', { fieldPath: 'layout' }))
    return { ok: false, diagnostics, directory, bindings }
  }
  if (layout.businessId !== business.id) {
    diagnostics.push(diag(
      'BINDING_BUSINESS_MISMATCH',
      `布局归属的业务（${JSON.stringify(layout.businessId)}）与当前业务（${business.id}）不一致，绑定只在归属业务内生效`,
      { fieldPath: 'layout.businessId' },
    ))
    return { ok: false, diagnostics, directory, bindings }
  }

  // 业务可信：先逐项确认登记路径能按现有方法编码（JSON 可表示未配对的 UTF-16 代理
  // 码元，encodeURIComponent 会对其抛 URIError——配置输入错误不能变成页面模块异常）。
  // 全部通过才交付目录（局部候选数组，中途失败不返回半份）；不用替换字符、丢弃坏项
  // 或重新正规化来"修好"路径，登记身份不得悄悄改变；成对码元（如 emoji）正常编码。
  // 目录按登记顺序去重，href 走固定 /api/doc 接口（不带 workspace，由页面侧补）。
  const candidates = []
  const seenPaths = new Set()
  for (const [index, docPath] of business.docs.entries()) {
    if (seenPaths.has(docPath)) continue
    seenPaths.add(docPath)
    let href
    try {
      href = `/specdev-workbench/api/doc?business=${encodeURIComponent(business.id)}&path=${encodeURIComponent(docPath)}`
    } catch {
      diagnostics.push(diag(
        'BINDING_INPUT',
        `登记路径包含无法编码的字符（如未配对的 UTF-16 代理码元），不能生成阅读链接：${JSON.stringify(docPath)}`,
        { fieldPath: `business.docs[${index}]` },
      ))
      return { ok: false, diagnostics, directory, bindings }
    }
    candidates.push({
      kind: 'document',
      businessId: business.id,
      path: docPath,
      title: docPath,
      href,
    })
  }
  // 图目录（E9c）：全部登记图都进目录（含不可用者，"业务资料"里能看见并说明原因）。
  // 带 descriptorError/idConflict 的图保留身份并附 unavailableReason，不静默过滤、
  // 不输出 undefined 链接；hasWorkflow=false 仅表示文件不存在，仍生成登记引用——缺图
  // 由既有阅读页/CLI 显示原因，不在这里猜。href 固定走 read 页面（不含 workspace）。
  const entryByChartId = new Map()
  for (const chart of chartList) {
    const entry = {
      kind: 'workflow',
      businessId: business.id,
      chartId: chart.id,
      title: chart.name,
      href: `/specdev-workbench/read/${encodeURIComponent(business.id)}/${encodeURIComponent(chart.id)}`,
    }
    const unavailableReason = chart.descriptorError ?? chart.idConflict
    if (unavailableReason) entry.unavailableReason = unavailableReason
    entryByChartId.set(chart.id, entry)
    candidates.push(entry)
  }
  directory.push(...candidates)
  const entryByPath = new Map(directory.filter((entry) => entry.kind === 'document').map((entry) => [entry.path, entry]))

  // ③ 引用前提：实例与资产可解析（对象、ID 字段可用、不重复）。失败时目录仍返回，绑定为空。
  if (!Array.isArray(layout.instances)) {
    diagnostics.push(diag('BINDING_INPUT', 'layout.instances 必须是数组', { fieldPath: 'layout.instances' }))
    return { ok: false, diagnostics, directory, bindings }
  }
  if (!isObject(catalog) || !Array.isArray(catalog.assets)) {
    diagnostics.push(diag('BINDING_INPUT', 'catalog.assets 必须是数组', { fieldPath: 'catalog.assets' }))
    return { ok: false, diagnostics, directory, bindings }
  }
  const instanceById = new Map()
  let instancesUsable = true
  for (const [index, instance] of layout.instances.entries()) {
    if (!isObject(instance) || !isNonEmptyString(instance.instanceId) || !isNonEmptyString(instance.assetId)) {
      diagnostics.push(diag(
        'BINDING_INPUT',
        `布局实例 layout.instances[${index}] 必须是带非空 instanceId／assetId 字符串的对象`,
        { fieldPath: `layout.instances[${index}]` },
      ))
      instancesUsable = false
    } else if (instanceById.has(instance.instanceId)) {
      diagnostics.push(diag(
        'BINDING_INPUT',
        `布局里的实例 ID 重复：${instance.instanceId}`,
        { instanceIds: [instance.instanceId], fieldPath: `layout.instances[${index}].instanceId` },
      ))
      instancesUsable = false
    } else {
      instanceById.set(instance.instanceId, instance)
    }
  }
  const assetById = new Map()
  let assetsUsable = true
  for (const [index, asset] of catalog.assets.entries()) {
    if (!isObject(asset) || !isNonEmptyString(asset.assetId)) {
      diagnostics.push(diag(
        'BINDING_INPUT',
        `目录资产 catalog.assets[${index}] 必须是带非空 assetId 字符串的对象`,
        { fieldPath: `catalog.assets[${index}]` },
      ))
      assetsUsable = false
    } else if (assetById.has(asset.assetId)) {
      diagnostics.push(diag(
        'BINDING_INPUT',
        `目录里的资产 ID 重复：${asset.assetId}`,
        { fieldPath: `catalog.assets[${index}].assetId` },
      ))
      assetsUsable = false
    } else {
      assetById.set(asset.assetId, asset)
    }
  }
  if (!instancesUsable || !assetsUsable) {
    return { ok: false, diagnostics, directory, bindings }
  }

  // ④ 逐条校验 bindings：字段白名单 → 重复目标 → 实例 → 资产 → 动作 → 能力 → 资料清单。
  const bindingList = layout.bindings === undefined ? [] : layout.bindings
  if (!Array.isArray(bindingList)) {
    diagnostics.push(diag(
      'BINDING_INPUT',
      `layout.bindings 必须是数组（省略或空数组＝没有家具资料绑定；实际是 ${bindingList === null ? 'null' : typeof bindingList}）`,
      { fieldPath: 'layout.bindings' },
    ))
    return { ok: false, diagnostics, directory, bindings }
  }
  const boundInstances = new Set()
  const resolved = []
  for (const [index, raw] of bindingList.entries()) {
    const at = `bindings[${index}]`
    if (!isObject(raw)) {
      diagnostics.push(diag('BINDING_INPUT', `${at} 必须是对象（实际是 ${Array.isArray(raw) ? '数组' : typeof raw}）`, { fieldPath: at }))
      continue
    }
    // 字段白名单（E9c）：instanceId、action、documents 必填，charts 唯一可选；
    // 旧三字段配置照常通过；href、workspace、businessId 等仍然拒绝。
    const keys = Object.keys(raw)
    const extraFields = keys.filter((key) => !BINDING_ALLOWED_FIELDS.includes(key))
    const missingFields = BINDING_REQUIRED_FIELDS.filter((field) => !(field in raw))
    if (extraFields.length > 0 || missingFields.length > 0) {
      const problems = []
      if (missingFields.length) problems.push(`缺少：${missingFields.join('、')}`)
      if (extraFields.length) problems.push(`多出：${extraFields.join('、')}`)
      diagnostics.push(diag(
        'BINDING_INPUT',
        `${at} 只允许 instanceId、action、documents（必填）与 charts（可选），不收 href、workspace、businessId 等；实际字段（${keys.join('、') || '（无）'}）${problems.join('；')}`,
        { fieldPath: at },
      ))
      continue
    }
    const { instanceId, action, documents, charts } = raw
    if (!isNonEmptyString(instanceId)) {
      diagnostics.push(diag('BINDING_INPUT', `${at}.instanceId 必须是非空字符串（实际是 ${JSON.stringify(instanceId)}）`, { fieldPath: `${at}.instanceId` }))
      continue
    }
    if (boundInstances.has(instanceId)) {
      diagnostics.push(diag(
        'BINDING_DUPLICATE_TARGET',
        `实例 ${instanceId} 已绑定过一次，首版每个实例最多绑定一个动作`,
        { instanceIds: [instanceId], fieldPath: `${at}.instanceId` },
      ))
      continue
    }
    const instance = instanceById.get(instanceId)
    if (!instance) {
      diagnostics.push(diag(
        'BINDING_UNKNOWN_INSTANCE',
        `绑定指向的实例 ${instanceId} 不在本房间布局里`,
        { instanceIds: [instanceId], fieldPath: `${at}.instanceId` },
      ))
      continue
    }
    const asset = assetById.get(instance.assetId)
    if (!asset) {
      diagnostics.push(diag(
        'BINDING_UNKNOWN_ASSET',
        `实例 ${instanceId} 引用的资产 ${instance.assetId} 不在目录里（绑定不能提供或覆盖资产）`,
        { instanceIds: [instanceId], fieldPath: `${at}.instanceId` },
      ))
      continue
    }
    if (action !== BINDING_ACTION) {
      diagnostics.push(diag(
        'BINDING_ACTION_UNSUPPORTED',
        `动作只支持 ${BINDING_ACTION}（实际是 ${JSON.stringify(action)}）`,
        { instanceIds: [instanceId], fieldPath: `${at}.action` },
      ))
      continue
    }
    if (!Array.isArray(asset.capabilities) || !asset.capabilities.includes(BINDING_ACTION)) {
      diagnostics.push(diag(
        'BINDING_CAPABILITY_MISSING',
        `资产 ${instance.assetId} 未在目录登记 ${BINDING_ACTION} 能力，不能给它绑资料`,
        { instanceIds: [instanceId], fieldPath: `${at}.action` },
      ))
      continue
    }
    if (!Array.isArray(documents)) {
      diagnostics.push(diag(
        'BINDING_INPUT',
        `${at}.documents 必须是数组（可为空＝明确的空集合；实际是 ${documents === null ? 'null' : typeof documents}）`,
        { instanceIds: [instanceId], fieldPath: `${at}.documents` },
      ))
      continue
    }
    // charts 省略视为 []；只收当前业务已登记的图 ID 字符串——不收路径、URL、workspace、
    // 版本或对象。集合内重复图拒绝；不同家具可以引用同一张图。图与文档身份分开：
    // 同一字符串在两份清单里各查各的表，不互相覆盖、不互相借用。
    const chartIds = charts === undefined ? [] : charts
    if (!Array.isArray(chartIds)) {
      diagnostics.push(diag(
        'BINDING_INPUT',
        `${at}.charts 必须是图 ID 字符串数组（省略视为空；实际是 ${chartIds === null ? 'null' : typeof chartIds}）`,
        { instanceIds: [instanceId], fieldPath: `${at}.charts` },
      ))
      continue
    }
    const entries = []
    const collectionPaths = new Set()
    let documentsOk = true
    for (const [docIndex, docPath] of documents.entries()) {
      if (!isNonEmptyString(docPath)) {
        diagnostics.push(diag(
          'BINDING_INPUT',
          `${at}.documents[${docIndex}] 必须是非空字符串（实际是 ${JSON.stringify(docPath)}）`,
          { instanceIds: [instanceId], fieldPath: `${at}.documents[${docIndex}]` },
        ))
        documentsOk = false
        continue
      }
      if (collectionPaths.has(docPath)) {
        diagnostics.push(diag(
          'BINDING_DUPLICATE_DOCUMENT',
          `实例 ${instanceId} 的集合里重复登记了文档：${docPath}`,
          { instanceIds: [instanceId], fieldPath: `${at}.documents[${docIndex}]` },
        ))
        documentsOk = false
        continue
      }
      collectionPaths.add(docPath)
      const entry = entryByPath.get(docPath)
      if (!entry) {
        diagnostics.push(diag(
          'BINDING_DOCUMENT_UNREGISTERED',
          `文档 ${docPath} 未在业务 ${business.id} 的登记清单里（仅在其他业务登记也不行）`,
          { instanceIds: [instanceId], fieldPath: `${at}.documents[${docIndex}]` },
        ))
        documentsOk = false
      } else {
        entries.push({ ...entry })
      }
    }
    // 文档清单有错也继续检查 charts：一次报全（与文档循环收满再退同风格），
    // 最后统一 documentsOk || chartsOk 才continue。
    // 图清单：先按 documents 顺序放文档条目，再按 charts 顺序放图条目（E9c 契约）。
    const collectionChartIds = new Set()
    let chartsOk = true
    for (const [chartIndex, chartId] of chartIds.entries()) {
      if (!isNonEmptyString(chartId)) {
        diagnostics.push(diag(
          'BINDING_INPUT',
          `${at}.charts[${chartIndex}] 必须是非空字符串的图 ID（不收路径、URL、workspace、版本或对象；实际是 ${JSON.stringify(chartId)}）`,
          { instanceIds: [instanceId], fieldPath: `${at}.charts[${chartIndex}]` },
        ))
        chartsOk = false
        continue
      }
      if (collectionChartIds.has(chartId)) {
        diagnostics.push(diag(
          'BINDING_DUPLICATE_CHART',
          `实例 ${instanceId} 的集合里重复登记了流程图：${chartId}`,
          { instanceIds: [instanceId], fieldPath: `${at}.charts[${chartIndex}]` },
        ))
        chartsOk = false
        continue
      }
      collectionChartIds.add(chartId)
      const chart = chartById.get(chartId)
      if (!chart) {
        diagnostics.push(diag(
          'BINDING_CHART_UNREGISTERED',
          `流程图 ${chartId} 未在业务 ${business.id} 的图目录里（仅在其他业务登记也不行）`,
          { instanceIds: [instanceId], fieldPath: `${at}.charts[${chartIndex}]` },
        ))
        chartsOk = false
        continue
      }
      const unavailableReason = chart.descriptorError ?? chart.idConflict
      if (unavailableReason) {
        diagnostics.push(diag(
          'BINDING_CHART_UNAVAILABLE',
          `流程图 ${chartId}（${chart.name}）当前不可用：${unavailableReason}`,
          { instanceIds: [instanceId], fieldPath: `${at}.charts[${chartIndex}]` },
        ))
        chartsOk = false
        continue
      }
      entries.push({ ...entryByChartId.get(chartId) })
    }
    if (!documentsOk || !chartsOk) continue
    boundInstances.add(instanceId)
    resolved.push({ instanceId, assetId: instance.assetId, action, entries })
  }

  if (diagnostics.length > 0) return { ok: false, diagnostics, directory, bindings }
  return { ok: true, diagnostics: [], directory, bindings: resolved }
}

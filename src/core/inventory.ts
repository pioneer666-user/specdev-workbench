// 约定树清单：只读 docs/specdev/ 子树 + refs/tags/specdev/ 前缀（D1：不整仓扫描）。
// 目录名即稳定编号；说明文件缺失/不合法的业务或图标记 descriptorError 并跳过展开，不影响其余（§3.5）。
import { readdir } from 'node:fs/promises'
import { worktreeFileExists, readWorktreeFileOptional } from './git.ts'
import { CoreError } from './errors.ts'
import { listSpecdevTags, snapshotsForChart, type RawTagRecord } from './snapshots.ts'
import { compareCurrentWithLatest, chartIdOwners } from './chart.ts'
import { readDescriptor, isPlainObject, requireStringFields } from './descriptor.ts'
import { parseChartContract, readChartSet, LIFECYCLE_READING_UNAVAILABLE } from './chart-contract.ts'
import {
  CONVENTION_ROOT,
  SCHEMA,
  type BusinessInfo,
  type BusinessSummary,
  type ChartInfo,
  type ChartSummary,
  type Inventory,
  type ProjectInfo,
} from './types.ts'

async function readProjectInfo(repoRoot: string): Promise<ProjectInfo> {
  const relPath = `${CONVENTION_ROOT}/project.json`
  // 缺文件与文件坏掉是两个状态（第 2 步定稿），不能用同一个错误码糊过去：
  // 缺＝还没有流程图资料（404，页面给空状态）；坏＝资料格式错误（500，页面原样报问题）。
  const text = await readWorktreeFileOptional(repoRoot, relPath)
  if (text === null) {
    throw new CoreError(
      'no-convention-root',
      `这里还没有流程图资料：未找到 ${relPath}。不会自动创建或改动这个目录里的任何文件。`,
      404,
    )
  }
  let data: ProjectInfo
  try {
    data = JSON.parse(text) as ProjectInfo
  } catch (error) {
    throw new CoreError('bad-inventory', `${relPath} 不是合法 JSON：${(error as Error).message}`, 500)
  }
  if (!isPlainObject(data) || data.schema !== SCHEMA.project) {
    throw new CoreError('bad-inventory', `${relPath} 的 schema 必须是 ${SCHEMA.project}`, 500)
  }
  const fieldError = requireStringFields(data, ['name'])
  if (fieldError) throw new CoreError('bad-inventory', `${relPath}：${fieldError}`, 500)
  return data
}

/** 组装整个项目清单（首页与业务页共用；含每图快照计数、无效标签计数、当前是否已改动）。 */
export async function readInventory(repoRoot: string): Promise<Inventory> {
  const project = await readProjectInfo(repoRoot)
  const tagRecords = await listSpecdevTags(repoRoot)

  const businessEntries = await readdir(`${repoRoot}/${CONVENTION_ROOT}`, { withFileTypes: true })
  const businesses: BusinessSummary[] = []
  for (const entry of businessEntries) {
    if (!entry.isDirectory()) continue
    const businessId = entry.name
    const businessDir = `${CONVENTION_ROOT}/${businessId}`
    const summary: BusinessSummary = { id: businessId, name: businessId, docs: [], charts: [] }
    const { data, error } = await readDescriptor<BusinessInfo>(repoRoot, `${businessDir}/business.json`)
    if (!data) {
      summary.descriptorError = error ?? 'business.json 缺失'
      businesses.push(summary)
      continue
    }
    if (!isPlainObject(data) || data.schema !== SCHEMA.business) {
      summary.descriptorError = `${businessDir}/business.json 的 schema 必须是 ${SCHEMA.business}`
      businesses.push(summary)
      continue
    }
    const fieldError = requireStringFields(data as unknown as Record<string, unknown>, ['id', 'name'])
    if (fieldError) {
      summary.descriptorError = `${businessDir}/business.json：${fieldError}`
      businesses.push(summary)
      continue
    }
    if (data.id !== businessId) {
      summary.descriptorError = `business.json 的 id（${data.id}）与目录名（${businessId}）不一致`
      businesses.push(summary)
      continue
    }
    summary.name = data.name
    summary.intro = typeof data.intro === 'string' ? data.intro : undefined
    if (Array.isArray(data.docs)) {
      summary.docs = data.docs.filter((item): item is string => typeof item === 'string' && item !== '')
    }
    summary.charts = await readChartSummaries(repoRoot, businessDir, tagRecords)
    businesses.push(summary)
  }
  businesses.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  // 评审 #1：图编号全项目唯一——重复时在两侧清单都标记冲突并写明归属；
  // 阅读停用在 chart.ts 的直达层兜底（列表标记只是提示，不承担拦截）。
  const ownersByChartId = new Map<string, string[]>()
  for (const business of businesses) {
    for (const chart of business.charts) {
      ownersByChartId.set(chart.id, [...(ownersByChartId.get(chart.id) ?? []), business.id])
    }
  }
  for (const business of businesses) {
    for (const chart of business.charts) {
      const owners = ownersByChartId.get(chart.id) ?? []
      if (owners.length > 1) {
        chart.idConflict = `图编号 ${chart.id} 在业务（${owners.join('、')}）中重复：历史快照按图编号归组，无法区分归属，该图的阅读已停用（直达阅读页会明确报错）`
      }
    }
  }
  return { project, businesses }
}

async function readChartSummaries(
  repoRoot: string,
  businessDir: string,
  tagRecords: readonly RawTagRecord[],
): Promise<ChartSummary[]> {
  const chartEntries = await readdir(`${repoRoot}/${businessDir}`, { withFileTypes: true })
  const charts: ChartSummary[] = []
  for (const entry of chartEntries) {
    if (!entry.isDirectory()) continue
    const chartId = entry.name
    const chartDir = `${businessDir}/${chartId}`
    const snapshots = snapshotsForChart(tagRecords, chartId)
    const summary: ChartSummary = {
      id: chartId,
      name: chartId,
      hasWorkflow: await worktreeFileExists(repoRoot, `${chartDir}/workflow.json`),
      snapshotCount: snapshots.snapshots.length,
      invalidTagCount: snapshots.invalidCount,
      currentStatus: 'no-snapshot',
    }
    const { data, error } = await readDescriptor<ChartInfo>(repoRoot, `${chartDir}/chart.json`)
    if (!data) {
      summary.descriptorError = error ?? 'chart.json 缺失'
      charts.push(summary)
      continue
    }
    let contract
    try { contract = parseChartContract(JSON.stringify(data), chartId) } catch (error) {
      summary.descriptorError = error instanceof Error ? error.message : String(error)
      charts.push(summary)
      continue
    }
    summary.diagramType = contract.diagramType
    summary.hasSource = await worktreeFileExists(repoRoot, `${chartDir}/${contract.sourceFile}`)
    const set = await readChartSet(name => readWorktreeFileOptional(repoRoot, `${chartDir}/${name}`), chartId)
    if (set.sourceError) summary.descriptorError = set.sourceError
    const fieldError = requireStringFields(data as unknown as Record<string, unknown>, ['id', 'name'])
    if (fieldError) {
      summary.descriptorError = `${chartDir}/chart.json：${fieldError}`
      charts.push(summary)
      continue
    }
    if (data.id !== chartId) {
      summary.descriptorError = `chart.json 的 id（${data.id}）与目录名（${chartId}）不一致`
      charts.push(summary)
      continue
    }
    summary.name = data.name
    summary.summary = typeof data.summary === 'string' ? data.summary : undefined
    const latest = snapshots.snapshots[0]
    if (latest) {
      // 比较失败（如工作区文件超过读取上限）只标记本图 compare-failed，不拖垮整个清单。
      try {
        summary.currentStatus = await compareCurrentWithLatest(repoRoot, chartDir, latest)
      } catch (error) {
        summary.currentStatus = 'compare-failed'
        summary.compareError = error instanceof Error ? error.message : String(error)
      }
      summary.latestSnapshot = {
        tag: latest.tag,
        name: latest.meta.name,
        stage: latest.meta.stage,
        savedAt: latest.meta.savedAt,
        createdDate: latest.createdDate,
      }
    }
    charts.push(summary)
  }
  charts.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  return charts
}

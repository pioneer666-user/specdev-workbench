// 图阅读页数据装配：v=current 读工作区活状态；v=<标签名> 读标签指向提交上的三个文件。
// 当前 vs 快照的比较在服务端算（§3.2）；快照文件路径用标签元数据里登记的 dir（改名不断历史，D2）。
import { readdir } from 'node:fs/promises'
import { gitShowFileOptional, readWorktreeFileOptional, worktreeDirExists } from './git.ts'
import type { GitReadOptions } from './git.ts'
import { chartRenderer } from './chart-renderer.ts'
import { CoreError } from './errors.ts'
import { listSpecdevTags, snapshotsForChart, findSnapshot, parseTagName } from './snapshots.ts'
import { readDescriptor, isPlainObject, requireStringFields } from './descriptor.ts'
import { CHART_FILE_NAMES } from './chart-files.ts'
import { fingerprintFor, normalizeEol } from './fingerprint.ts'
import { readChartSet, snapshotContract, LIFECYCLE_READING_UNAVAILABLE } from './chart-contract.ts'
import {
  CONVENTION_ROOT,
  SCHEMA,
  type BusinessInfo,
  type ChartFiles,
  type ChartInfo,
  type ChartPageData,
  type SnapshotEntry,
} from './types.ts'

/** 图目录下的数据文件名：定义挪到叶子模块 chart-files.ts（保存侧与摘要规则共用同一份），此处原样转出。 */
export { CHART_FILE_NAMES }

/** 图编号出现在哪些业务下（评审 #1：编号必须全项目唯一——快照标签按编号归组，重名会互相混用快照）。 */
export async function chartIdOwners(repoRoot: string, chartId: string): Promise<string[]> {
  const entries = await readdir(`${repoRoot}/${CONVENTION_ROOT}`, { withFileTypes: true })
  const owners: string[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (await worktreeDirExists(repoRoot, `${CONVENTION_ROOT}/${entry.name}/${chartId}`)) owners.push(entry.name)
  }
  return owners
}

/**
 * 定位图目录（阅读与保存共用的拒绝语义）：业务/图目录不存在 → 404；
 * 图编号在多个业务下重复 → 409（快照按编号归组，重名无法区分归属）。
 */
export async function locateChartDir(repoRoot: string, businessId: string, chartId: string): Promise<string> {
  const businessDir = `${CONVENTION_ROOT}/${businessId}`
  const chartDir = `${businessDir}/${chartId}`
  if (!(await worktreeDirExists(repoRoot, businessDir))) {
    throw new CoreError('not-found', `业务 ${businessId} 不存在（约定目录 ${businessDir} 不存在）`, 404)
  }
  if (!(await worktreeDirExists(repoRoot, chartDir))) {
    throw new CoreError('not-found', `图 ${chartId} 不存在（约定目录 ${chartDir} 不存在）`, 404)
  }
  // 评审 #1：图编号全项目唯一——直达 URL 也要拦截，不能只靠列表层。
  const owners = await chartIdOwners(repoRoot, chartId)
  if (owners.length > 1) {
    throw new CoreError(
      'duplicate-chart-id',
      `图编号 ${chartId} 同时存在于业务（${owners.join('、')}）下：历史快照按图编号归组，无法区分归属。请把其中一个图目录改成不同的编号。`,
      409,
    )
  }
  return chartDir
}

/** 只对真实读到的文本归换行；缺文件保持 null，不与空文件混为一谈。 */
function normalizeOrNull(text: string | null): string | null {
  return text === null ? null : normalizeEol(text)
}

/**
 * 工作区 vs 最新快照的逐文件比对。
 * 换行按保存检查的同一规则归一：LF 提交 / CRLF 工作区只差换行，不算"已改动"——
 * 两处判断必须是同一套规则，否则会出现"刚保存完却仍显示已改动"（审查 P2）。
 * 缺文件（null）与空文件（''）仍是两回事，不折成同一个值。
 */
export async function compareCurrentWithLatest(
  repoRoot: string,
  chartDir: string,
  latest: SnapshotEntry,
  options: GitReadOptions = {},
): Promise<'identical' | 'changed'> {
  const contract = snapshotContract(latest.meta)
  if (contract.diagramType === 'lifecycle') {
    const current = await readChartSet(name => readWorktreeFileOptional(repoRoot, `${chartDir}/${name}`), latest.chart)
    const stored = await readChartSet(name => gitShowFileOptional(repoRoot, latest.commit, `${latest.meta.dir}/${name}`, { originalObjects: true }), latest.chart, latest.meta)
    if (current.sourceError || Object.keys(current.errors).length) throw new CoreError('chart-unreadable', current.sourceError ?? '当前图文件读不开', 422)
    return current.contract.diagramType === contract.diagramType && fingerprintFor(contract, current.files) === fingerprintFor(contract, stored.files) ? 'identical' : 'changed'
  }
  for (const name of contract.names) {
    const worktree = await readWorktreeFileOptional(repoRoot, `${chartDir}/${name}`)
    const snapshot = await gitShowFileOptional(repoRoot, latest.commit, `${latest.meta.dir}/${name}`, options)
    if (normalizeOrNull(worktree) !== normalizeOrNull(snapshot)) return 'changed'
  }
  return 'identical'
}

/** 数据文件名 → ChartFiles 字段名（文件名带扩展名，字段名不带）。 */
const FILE_KEYS = { 'workflow.json': 'workflow', 'details.md': 'details', 'evidence.json': 'evidence' } as const

/**
 * 逐文件读取并隔离错误（评审二修·超限死路收尾）：读不开（如超过大小上限）的文件置 null
 * 并记下原因，不让整页失败——页面仍能给出版本条切历史，"读不开"如实说成读不开。
 */
async function readWorktreeFiles(
  repoRoot: string,
  chartDir: string,
 ) {
  return readChartSet(name => readWorktreeFileOptional(repoRoot, `${chartDir}/${name}`), chartDir.split('/').at(-1)!, undefined, true)
}

async function readSnapshotFiles(
  repoRoot: string,
  snapshot: SnapshotEntry,
  options: GitReadOptions = {},
 ) {
  return readChartSet(name => gitShowFileOptional(repoRoot, snapshot.commit, `${snapshot.meta.dir}/${name}`, snapshot.meta.schema === 'specdev/snapshot/2' ? { originalObjects: true } : options), snapshot.chart, snapshot.meta)
}

/**
 * 阅读页一屏数据。v 取 'current'（工作区）或标签全名（specdev/<图编号>/<版本>）。
 * 图不存在 / 标签不存在或不合规 → 抛 CoreError（message 直接上页面）；
 * workflow.json 缺失不抛，写入 workflowError（图不可读是明确报错，不是空白页，§3.5）。
 */
export async function readChartPage(
  repoRoot: string,
  businessId: string,
  chartId: string,
  v: string,
  options: GitReadOptions = {},
): Promise<ChartPageData> {
  const businessDir = `${CONVENTION_ROOT}/${businessId}`
  const chartDir = await locateChartDir(repoRoot, businessId, chartId)

  const business = await readDescriptor<BusinessInfo>(repoRoot, `${businessDir}/business.json`)
  const chart = await readDescriptor<ChartInfo>(repoRoot, `${chartDir}/chart.json`)
  const chartName =
    chart.data && isPlainObject(chart.data) && typeof chart.data.name === 'string' ? chart.data.name : chartId
  const chartSummaryOk = !!(chart.data && isPlainObject(chart.data) && chart.data.schema === SCHEMA.chart
    && !requireStringFields(chart.data, ['id', 'name']) && chart.data.id === chartId)

  const tagRecords = await listSpecdevTags(repoRoot, options)
  const snapshots = snapshotsForChart(tagRecords, chartId)
  const latest = snapshots.snapshots[0]
  // 比较失败（如工作区文件超过读取上限）不让阅读页整个失败——历史快照照常可读。
  let currentStatus: ChartPageData['currentStatus']
  let compareError: string | undefined
  if (!latest) {
    currentStatus = 'no-snapshot'
  } else {
    try {
      currentStatus = await compareCurrentWithLatest(repoRoot, chartDir, latest, options)
    } catch (error) {
      currentStatus = 'compare-failed'
      compareError = error instanceof Error ? error.message : String(error)
    }
  }

  let version: ChartPageData['version']
  // 页面用它在保存弹层打开时自查"我正看的这一版是不是已经旧了"：这里是本次真正读出来的
  // 工作区内容的摘要，弹层打开时再取的检查结果带的是当前内容的摘要，两边不一致就说明
  // 页面落后了（照旧提示刷新）。任一个文件读不开就没有可比对的摘要（null）。
  let currentFingerprint: string | null = null
  if (v === 'current') {
    const { files, errors, contract, sourceError } = await readWorktreeFiles(repoRoot, chartDir)
    currentFingerprint = sourceError || Object.keys(errors).length ? null : fingerprintFor(contract, files)
    version = {
      kind: 'current',
      files,
      diagramType: contract.diagramType,
      sourceFile: contract.sourceFile,
      sourceError: sourceError ?? errors[contract.sourceKey] ?? (files[contract.sourceKey] == null ? `缺少 ${contract.sourceFile}` : undefined),
      workflowError:
        contract.diagramType === 'lifecycle' ? undefined : (sourceError ?? errors.workflow
        ?? (files.workflow === null
          ? `当前工作区缺少 workflow.json（${chartDir}/workflow.json），该图不可读`
          : undefined)),
      workflowErrorKind: errors.workflow ? 'unreadable' : files.workflow === null ? 'missing' : undefined,
      detailsError: errors.details,
      evidenceError: errors.evidence,
    }
  } else {
    const parsed = parseTagName(v)
    if (!parsed || parsed.chart !== chartId) {
      throw new CoreError('bad-request', `版本参数必须是 current 或本图（${chartId}）的标签名，收到：${v}`, 400)
    }
    const snapshot = findSnapshot(tagRecords, v)
    const { files, errors, contract, sourceError } = await readSnapshotFiles(repoRoot, snapshot, options)
    version = {
      kind: 'snapshot',
      tag: snapshot.tag,
      commit: snapshot.commit,
      label: snapshot.meta.name,
      stage: snapshot.meta.stage,
      note: snapshot.meta.note,
      savedAt: snapshot.meta.savedAt,
      files,
      diagramType: contract.diagramType,
      sourceFile: contract.sourceFile,
      sourceError: sourceError ?? errors[contract.sourceKey] ?? (files[contract.sourceKey] == null ? `缺少 ${contract.sourceFile}` : undefined),
      workflowError:
        contract.diagramType === 'lifecycle' ? undefined : (sourceError ?? errors.workflow
        ?? (files.workflow === null
          ? `快照 ${snapshot.tag} 里缺少 workflow.json（登记目录 ${snapshot.meta.dir}），该版本不可读`
          : undefined)),
      workflowErrorKind: errors.workflow ? 'unreadable' : files.workflow === null ? 'missing' : undefined,
      detailsError: errors.details,
      evidenceError: errors.evidence,
    }
  }

  return {
    diagramType: version.diagramType,
    business: {
      id: businessId,
      name:
        business.data && isPlainObject(business.data) && typeof business.data.name === 'string'
          ? business.data.name
          : businessId,
    },
    chart: version.diagramType === 'lifecycle' && version.files.descriptor
      ? (() => { const descriptor = JSON.parse(version.files.descriptor!); return { id: chartId, name: descriptor.name, summary: descriptor.summary } })()
      : { id: chartId, name: chartName, summary: chartSummaryOk && typeof chart.data?.summary === 'string' ? chart.data.summary : undefined },
    snapshots,
    currentStatus,
    compareError,
    version,
    currentFingerprint,
    // 标记文件读不开时不能猜版本，也不能丢掉说明/版本恢复入口。
    renderer: version.evidenceError ? null : chartRenderer(version.files.evidence),
    rendererError: version.evidenceError ? '阅读版本标记文件读不开；未自动选择渲染器，可显式选择原版或切换历史。' : undefined,
  }
}

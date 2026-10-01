// 保存版本（快照的写入侧，D2：附注标签即版本记录）。三个职责：
//   (a) checkChartCommitted 保存前检查：三个数据文件是否与最近一次提交逐文件一致
//       （换行先归一——autocrlf 仓库提交里 LF、工作区 CRLF 属正常，只差换行不算修改），
//       并给出 HEAD 内容摘要（页面核对"我正看的就是将要保存的"）；
//   (b) 重复识别：用 git 存储层的内容编号（blob 号）逐文件比对，不看提交号——
//       内容相同且阶段相同 → 返回已有那份（alreadySaved），连点保存、请求重试都不多存；
//   (c) saveChartSnapshot 保存：钉住弹层里确认过的那次提交（expectedHead）与内容摘要，
//       后台有新提交 / 页面是旧的都拦下要求刷新，标签绝不临时换成最新提交；
//       打完标签立即读回验证，读不回不宣称成功。
// 对仓库的唯一写入是一个附注标签：工作区文件、分支、提交一概不动。
import { runGit, gitShowFileOptional, readWorktreeFileOptional } from './git.ts'
import { CoreError } from './errors.ts'
import { listSpecdevTags, snapshotsForChart, findSnapshot, type RawTagRecord } from './snapshots.ts'
import { locateChartDir } from './chart.ts'
import { CHART_FILE_NAMES, FILE_KEY } from './chart-files.ts'
import { normalizeEol, fingerprintOf } from './fingerprint.ts'
import {
  SCHEMA,
  type ChartFiles,
  type SaveCheck,
  type SaveChartResult,
  type SnapshotEntry,
  type SnapshotStage,
} from './types.ts'

/** 单个文件读不开的原因（按字段隔离，不让整次检查崩掉）。 */
type ReadErrors = Partial<Record<keyof ChartFiles, string>>

/** 取 HEAD；仓库还没有任何提交是明确态（head=null），不算 git 故障。 */
async function resolveHeadOptional(repoRoot: string): Promise<string | null> {
  try {
    return (await runGit(repoRoot, ['rev-parse', 'HEAD'])).trim()
  } catch (error) {
    const unborn = error instanceof CoreError && error.code === 'git-failed' && error.message.includes('unknown revision')
    if (unborn) return null
    throw error
  }
}

/** 逐文件读取并隔离错误：读不开的置 null 并记下原因（如超过大小上限）。 */
async function readTriFiles(
  read: (fileName: string) => Promise<string | null>,
): Promise<{ files: ChartFiles; errors: ReadErrors }> {
  const files: ChartFiles = { workflow: null, details: null, evidence: null }
  const errors: ReadErrors = {}
  for (const name of CHART_FILE_NAMES) {
    const key = FILE_KEY[name]
    try {
      files[key] = await read(name)
    } catch (error) {
      errors[key] = error instanceof Error ? error.message : String(error)
    }
  }
  return { files, errors }
}

/**
 * 检查与保存共用的核对例程：工作区三个文件 vs HEAD 上三个文件（换行归一后比），
 * 返回逐文件问题、HEAD 内容摘要与 HEAD 文件原文（读回验证用）。
 */
async function collectSaveCheck(
  repoRoot: string,
  chartDir: string,
  head: string,
): Promise<{ problems: string[]; fingerprint: string | null; headFiles: ChartFiles }> {
  const worktree = await readTriFiles((name) => readWorktreeFileOptional(repoRoot, `${chartDir}/${name}`))
  const committed = await readTriFiles((name) => gitShowFileOptional(repoRoot, head, `${chartDir}/${name}`))
  const problems: string[] = []
  if (worktree.files.workflow === null && !worktree.errors.workflow) {
    problems.push('图还不存在：workflow.json 缺失，没有可保存的内容')
  }
  for (const name of CHART_FILE_NAMES) {
    const key = FILE_KEY[name]
    if (worktree.errors[key]) {
      problems.push(`${name} 读不开（${worktree.errors[key]}）`)
      continue
    }
    if (committed.errors[key]) {
      problems.push(`${name} 在最近一次提交上读不开（${committed.errors[key]}）`)
      continue
    }
    if (key === 'workflow' && worktree.files.workflow === null) continue // 已报"图还不存在"
    const w = worktree.files[key]
    const h = committed.files[key]
    if (h === null && w !== null) problems.push(`${name} 还没有提交过（新文件）`)
    else if (h !== null && w === null) problems.push(`${name} 在工作区被删除，删除尚未提交`)
    else if (h !== null && w !== null && normalizeEol(w) !== normalizeEol(h)) problems.push(`${name} 有未提交的修改`)
  }
  const fingerprint =
    committed.errors.workflow || committed.errors.details || committed.errors.evidence
      ? null
      : fingerprintOf(committed.files)
  return { problems, fingerprint, headFiles: committed.files }
}

/** 某提交上三个文件的 blob 号（ls-tree；缺文件为 null）。结构上与 ChartFiles 同形，语义是内容编号。 */
async function chartBlobIds(repoRoot: string, commit: string, chartDir: string): Promise<ChartFiles> {
  const out = await runGit(repoRoot, ['ls-tree', commit, '--', ...CHART_FILE_NAMES.map((n) => `${chartDir}/${n}`)])
  const blobs: ChartFiles = { workflow: null, details: null, evidence: null }
  for (const line of out.split('\n')) {
    const tab = line.indexOf('\t')
    if (tab < 0) continue
    const fields = line.slice(0, tab).split(' ')
    const fileName = line.slice(tab + 1).trim().split('/').pop()!
    if (!(fileName in FILE_KEY) || fields[1] !== 'blob') continue
    blobs[FILE_KEY[fileName as keyof typeof FILE_KEY]] = fields[2]
  }
  return blobs
}

/**
 * 重复识别 (b)：内容（blob 号逐文件比，缺文件按"空"对"空"）与阶段都相同即认为已存过，
 * 返回已有那一份。每次尝试都重新取一份标签清单再调它——连点/重试同时在途时，
 * 对方刚打好的标签要能被看见。
 */
async function findDuplicateSnapshot(
  repoRoot: string,
  records: readonly RawTagRecord[],
  chartId: string,
  stage: SnapshotStage,
  headIds: ChartFiles,
): Promise<SnapshotEntry | null> {
  for (const snapshot of snapshotsForChart(records, chartId).snapshots) {
    if (snapshot.meta.stage !== stage) continue
    const snapIds = await chartBlobIds(repoRoot, snapshot.commit, snapshot.meta.dir)
    if (CHART_FILE_NAMES.every((n) => headIds[FILE_KEY[n]] === snapIds[FILE_KEY[n]])) return snapshot
  }
  return null
}

/** 挑一个没被占用的标签名：base 被占则依次加 -2/-3…；超过上限明确报错，不无限找。 */
function pickTagName(records: readonly RawTagRecord[], base: string): string {
  const taken = new Set(records.map((r) => r.tag))
  let tag = base
  let suffix = 2
  while (taken.has(tag)) {
    if (suffix > MAX_NAME_SUFFIX) {
      throw new CoreError('tag-name-exhausted', `标签名 ${base} 已被占用，且找不到可用变体`, 500)
    }
    tag = `${base}-${suffix}`
    suffix += 1
  }
  return tag
}

/** 保存前检查（(a)）。定位图的 404/409 拒绝语义与阅读页 readChartPage 同一套（locateChartDir）。 */
export async function checkChartCommitted(
  repoRoot: string,
  businessId: string,
  chartId: string,
): Promise<SaveCheck> {
  const chartDir = await locateChartDir(repoRoot, businessId, chartId)
  const head = await resolveHeadOptional(repoRoot)
  if (head === null) {
    return { head: null, ok: false, problems: ['这个仓库还没有任何提交，没有可保存的内容'], fingerprint: null }
  }
  const { problems, fingerprint } = await collectSaveCheck(repoRoot, chartDir, head)
  return { head, ok: problems.length === 0, problems, fingerprint }
}

const NAME_MAX = 200
const NOTE_MAX = 1000
/** 同名标签连续被抢先时的尝试上限（连点/重试同时在途才可能撞上；不无限重试，红线 10）。 */
const MAX_TAG_ATTEMPTS = 5
/** 同秒撞名时最多往后加多少个后缀（后缀只防重名，去重靠内容比对）。 */
const MAX_NAME_SUFFIX = 50

/**
 * 同一仓库同一张图的保存排队（进程内互斥，审查 P2）：查重与写入必须是一次连续的操作。
 * 没有这道锁时，两个请求会各自查到"还没存过"、各自挑到不同时间戳的名字，于是各存一份
 * 同内容版本（可跑复现：相隔 1 秒的两个并发请求 → 2 个版本）。
 * 跨进程（两个 DSH 实例同时存同一张图）不在这道锁的范围内，仍由"同名被抢先 → 重来一轮"
 * 的去重兜住同一秒的情形；不同秒的两个进程仍可能各存一份，属边界，如实说明不夸大。
 */
const saveQueues = new Map<string, Promise<unknown>>()

function withChartLock<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = saveQueues.get(key) ?? Promise.resolve()
  const run = previous.then(task, task) // 前一个失败也接着排，不让队列卡死
  const tail = run.then(() => undefined, () => undefined)
  saveQueues.set(key, tail)
  void tail.then(() => {
    if (saveQueues.get(key) === tail) saveQueues.delete(key) // 排空了就撤掉，不攒 key
  })
  return run
}

/**
 * 标签写下去之后的失败：版本其实已经登记了，只是读回核对没走完。一律换成这个码并带上
 * 版本名——页面据此说"已经写上去了，去版本列表核对"，不再说"没能保存"（审查 P2）。
 */
export function createdUnverifiedError(tag: string, error: unknown): CoreError {
  if (error instanceof CoreError && error.code === 'save-created-unverified') return error
  const reason = error instanceof Error ? error.message : String(error)
  return new CoreError(
    'save-created-unverified',
    `版本 ${tag} 已经写上去了，但读回核对没做完：${reason}。请刷新页面看版本列表确认。`,
    500,
  )
}

/** 登记信息校验（400）：名称必填 ≤200 字、阶段二选一、说明可选 ≤1000 字；名称与说明去首尾空白。 */
function validateInput(raw: unknown): { name: string; stage: SnapshotStage; note?: string } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new CoreError('bad-request', '保存信息不合法（必须是对象）', 400)
  }
  const m = raw as Record<string, unknown>
  const name = typeof m.name === 'string' ? m.name.trim() : ''
  if (name.length < 1 || name.length > NAME_MAX) {
    throw new CoreError('bad-request', `版本名称必填，且不超过 ${NAME_MAX} 个字`, 400)
  }
  const stage = m.stage === 'design' || m.stage === 'implemented' ? m.stage : null
  if (stage === null) {
    throw new CoreError('bad-request', '阶段必须是 design（设计版）或 implemented（实现版）', 400)
  }
  if (m.note !== undefined && m.note !== null && typeof m.note !== 'string') {
    throw new CoreError('bad-request', '保存说明不合法（必须是文本）', 400)
  }
  let note: string | undefined
  if (typeof m.note === 'string' && m.note.trim()) {
    note = m.note.trim()
    if (note.length > NOTE_MAX) {
      throw new CoreError('bad-request', `保存说明不超过 ${NOTE_MAX} 个字`, 400)
    }
  }
  return { name, stage, note }
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/** 本地时区 iso8601（带 ±HH:MM 偏移，与 for-each-ref 的 creatordate 同形：排序与显示一致）。 */
function localIso(d: Date): string {
  const offsetMin = -d.getTimezoneOffset()
  const sign = offsetMin >= 0 ? '+' : '-'
  const abs = Math.abs(offsetMin)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`
}

/** 版本标识：本地时间 YYYYMMDD-HHMMSS（refname 安全字符）。 */
function localStamp(d: Date): string {
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`
}

/**
 * 保存（(c)）：把确认过的那次提交打上附注标签。对仓库的唯一写入是一个标签。
 * input 按 unknown 收：HTTP 层把解析后的正文原样转交（形状见 types.ts 的 SaveChartInput），
 * 合法与否只由本文件的 validateInput 一处判定并一律 400，避免接线层再判一遍而两处走样。
 * options.expectedHead / fingerprint 来自弹层打开时的检查结果（页面送回），用于钉提交与核摘要；
 * options.now 供测试钉死时间戳（默认当前时间）。
 * 入参校验与图的定位在锁外（错的请求没必要排队），其余整段在同一张图的锁里跑：
 * 查重与写入是一次连续操作，否则并发请求各挑一个时间戳名字、各存一份同内容版本（审查 P2）。
 */
export async function saveChartSnapshot(
  repoRoot: string,
  businessId: string,
  chartId: string,
  input: unknown,
  options: { expectedHead: string; fingerprint: string; now?: Date },
): Promise<SaveChartResult> {
  const { name, stage, note } = validateInput(input)
  if (!/^[0-9a-f]{40}$/.test(options.expectedHead)) {
    throw new CoreError('bad-request', `确认过的提交号不合法：${options.expectedHead}`, 400)
  }
  const chartDir = await locateChartDir(repoRoot, businessId, chartId)
  return withChartLock(
    `${repoRoot}\u0000${chartId}`,
    () => createSnapshot(repoRoot, chartDir, chartId, { name, stage, note }, options),
  )
}

/** 锁内的保存本体：读当前提交 → 钉提交、核摘要 → 去重与打标签 → 读回验证。 */
async function createSnapshot(
  repoRoot: string,
  chartDir: string,
  chartId: string,
  meta: { name: string; stage: SnapshotStage; note?: string },
  options: { expectedHead: string; fingerprint: string; now?: Date },
): Promise<SaveChartResult> {
  const { name, stage, note } = meta
  const head = await resolveHeadOptional(repoRoot)
  if (head === null) {
    throw new CoreError('uncommitted-changes', '这个仓库还没有任何提交，没有可保存的内容', 409)
  }
  const check = await collectSaveCheck(repoRoot, chartDir, head)
  if (check.problems.length > 0) {
    throw new CoreError(
      'uncommitted-changes',
      `当前图还有未提交的修改，请先提交，再保存版本：\n- ${check.problems.join('\n- ')}`,
      409,
    )
  }
  // 钉提交：后台又有新提交 → 拦下要求刷新，绝不临时换成最新提交。
  if (head !== options.expectedHead) {
    throw new CoreError('content-updated', '内容已更新，请刷新后确认（后台有了新的提交）', 409)
  }
  // 核摘要：页面正展示的内容与将要保存的不一致（页面是旧的）→ 同样拦下。
  if (options.fingerprint !== check.fingerprint) {
    throw new CoreError('content-updated', '内容已更新，请刷新后确认（页面展示的内容与将要保存的不一致）', 409)
  }

  // 重复识别 (b) 与打标签：两步放在一个带上限的重试里——打标签是会与"同内容重复请求"
  // 竞争的一步（手抖连点、网络重试可能同时在途）。每轮都重新取一次标签清单：先看这份
  // 内容是否已经被存过（去重），再挑一个没被占用的名字。名字被抢先（git 报标签已存在，
  // 或写消息文件的冲突）不算内部错误——重来一轮，上面的去重就会认出对方存下的同一份
  // 内容；只有确认不是竞争（名字仍空着、也没有同内容快照）才把 git 的报错如实抛出。
  // 重试有上限，不无限重试（红线 10）。
  const headIds = await chartBlobIds(repoRoot, head, chartDir)
  const now = options.now ?? new Date()
  const base = `specdev/${chartId}/${localStamp(now)}`
  // message 严格按读取侧校验的约定生成（snapshots.ts validateRecord 五项）。
  const savedAt = localIso(now)
  const message = JSON.stringify({
    schema: SCHEMA.snapshot,
    chart: chartId,
    name,
    stage,
    ...(note !== undefined ? { note } : {}),
    dir: chartDir,
    savedAt,
  })

  let created: string | null = null
  for (let attempt = 0; attempt < MAX_TAG_ATTEMPTS && created === null; attempt += 1) {
    const records = await listSpecdevTags(repoRoot)
    const duplicate = await findDuplicateSnapshot(repoRoot, records, chartId, stage, headIds)
    if (duplicate) return { snapshot: duplicate, alreadySaved: true }
    const tag = pickTagName(records, base)
    try {
      await runGit(repoRoot, ['tag', '-a', tag, '-m', message, head])
      created = tag
    } catch (error) {
      const latest = await listSpecdevTags(repoRoot)
      const contention =
        latest.some((r) => r.tag === tag)
        || (await findDuplicateSnapshot(repoRoot, latest, chartId, stage, headIds)) !== null
      if (!contention) throw error
    }
  }
  if (created === null) {
    throw new CoreError(
      'save-conflict',
      `连续 ${MAX_TAG_ATTEMPTS} 次都没能占用版本名（同名标签一直被抢先），请稍后重试`,
      409,
    )
  }

  // 读回验证：立即用读取侧自己的 findSnapshot 认账，并核对元数据与三个文件逐字不丢。
  // 这一段跑在标签已经写下去之后：任何失败（读不回来、核对不一致）都必须报成
  // "版本已写上、只是没核完"，不能混进"没能保存"——所以整段包住，异常一律换码带上版本名
  // （审查 P2）。换码是幂等的：下面自己抛的已经是这个码。
  try {
    const entry = findSnapshot(await listSpecdevTags(repoRoot), created)
    const expected = { schema: SCHEMA.snapshot, chart: chartId, name, stage, note, dir: chartDir, savedAt } as const
    const mismatch = (Object.keys(expected) as (keyof typeof expected)[]).filter((k) => entry.meta[k] !== expected[k])
    if (entry.commit !== head || mismatch.length > 0) {
      throw new CoreError(
        'save-created-unverified',
        `版本 ${created} 已经写上去了，但读回核对不一致（${['commit', ...mismatch].join('、')}）。请刷新页面看版本列表确认。`,
        500,
      )
    }
    for (const n of CHART_FILE_NAMES) {
      const back = await gitShowFileOptional(repoRoot, entry.commit, `${chartDir}/${n}`)
      if (back !== check.headFiles[FILE_KEY[n]]) {
        throw new CoreError(
          'save-created-unverified',
          `版本 ${created} 已经写上去了，但 ${n} 的读回内容与将要保存的不一致。请刷新页面看版本列表确认。`,
          500,
        )
      }
    }
    return { snapshot: entry, alreadySaved: false }
  } catch (error) {
    throw createdUnverifiedError(created, error)
  }
}

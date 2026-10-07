// 快照登记：附注标签即版本记录（D2 裁定）。
// 读取校验：只把满足全部条件的标签当快照——
//   附注标签（objecttype=tag，剥壳后指向提交）、message 可解析为 JSON 对象、
//   必填字段齐全（schema/chart/name/stage/dir 且取值合法）、chart 与标签名前缀一致、
//   dir 以约定根开头。不符合的跳过并计数，绝不当作快照，也绝不因此崩溃。
import { runGit } from './git.ts'
import type { GitReadOptions } from './git.ts'
import { CoreError } from './errors.ts'
import { CONVENTION_ROOT, SCHEMA, TYPED_SCHEMA, type ChartSnapshots, type SnapshotEntry, type SnapshotMeta, type SnapshotStage } from './types.ts'
import { LIFECYCLE_FINGERPRINT_SCHEME } from './chart-files.ts'

/** for-each-ref 的一条原始记录（未校验）。 */
export interface RawTagRecord {
  tag: string
  objecttype: string
  /** 剥壳后的对象号；轻量标签此字段与 objecttype 一起用于判否。 */
  derefObject: string
  /** 剥壳后的对象类型（评审 #2：必须是 commit；指向树/blob 等非提交对象一律无效）。 */
  derefType: string
  createdDate: string
  message: string
}

const STAGES: readonly SnapshotStage[] = ['design', 'implemented']

/** 标签名第二段 = 图稳定编号；第三段起 = 版本标识（版本标识里允许再有斜杠）。 */
export function parseTagName(tag: string): { chart: string; version: string } | null {
  const parts = tag.split('/')
  if (parts.length < 3 || parts[0] !== 'specdev' || !parts[1] || parts.some((p) => p === '')) return null
  return { chart: parts[1], version: parts.slice(2).join('/') }
}

/**
 * 列出 refs/tags/specdev/ 前缀下的全部标签（一次调用，不整仓扫描）。
 * 记录以格式串末尾的 %00（NUL）分隔，标签 message 里的换行不会切断记录。
 * %(*objecttype) 取剥壳后的对象类型（评审 #2）：要求 commit，防止"40 位但指向树/blob"混进快照。
 */
export async function listSpecdevTags(repoRoot: string, options: GitReadOptions = {}): Promise<RawTagRecord[]> {
  const format = '%(refname:short)%09%(objecttype)%09%(*objectname)%09%(*objecttype)%09%(creatordate:iso8601-strict)%09%(contents)%00'
  const out = await runGit(repoRoot, ['for-each-ref', `refs/tags/${'specdev'}/`, `--format=${format}`], options)
  const records: RawTagRecord[] = []
  for (const raw of out.split('\0')) {
    // 每条记录实际形如 "<字段们>\n\0\n"（%00 后 git 还补了换行）——先剥掉两端换行再按制表符切字段。
    const chunk = raw.replace(/^[\r\n]+/, '').replace(/[\r\n]+$/, '')
    if (!chunk) continue
    // 首个制表符前是标签名；message 可能含换行与制表符，取第 5 个字段之后的全部。
    const head = chunk.indexOf('\t')
    if (head < 0) continue
    const rest = chunk.slice(head + 1)
    const fields = rest.split('\t')
    records.push({
      tag: chunk.slice(0, head),
      objecttype: fields[0],
      derefObject: fields[1],
      derefType: fields[2],
      createdDate: fields[3],
      message: fields.slice(4).join('\t'),
    })
  }
  return records
}

/** 校验单条标签；不合法返回原因字符串（调用方跳过并计数）。 */
function validateRecord(record: RawTagRecord): { meta: SnapshotMeta; commit: string } | { invalid: string } {
  const parsed = parseTagName(record.tag)
  if (!parsed) return { invalid: '标签名不符合 specdev/<图编号>/<版本> 结构' }
  if (record.objecttype !== 'tag') return { invalid: '不是附注标签（轻量标签不登记快照）' }
  if (!/^[0-9a-f]{40}$/.test(record.derefObject)) return { invalid: '剥壳后没有指向有效对象' }
  if (record.derefType !== 'commit') {
    return { invalid: `标签剥壳后指向的不是提交（${record.derefType || '无对象'}），快照必须落在具体提交上` }
  }
  let meta: unknown
  try {
    meta = JSON.parse(record.message)
  } catch {
    return { invalid: '标签 message 不是合法 JSON' }
  }
  if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) return { invalid: '标签 message 不是 JSON 对象' }
  const m = meta as Record<string, unknown>
  if (![SCHEMA.snapshot, TYPED_SCHEMA.snapshot].includes(m.schema as any)) return { invalid: 'message.schema 不支持' }
  if (m.schema === TYPED_SCHEMA.snapshot) {
    if (m.diagramType !== 'lifecycle' || m.sourceFile !== 'lifecycle.json' || m.fingerprintScheme !== LIFECYCLE_FINGERPRINT_SCHEME) return { invalid: 'typed快照类型/源文件/fingerprintScheme不支持' }
    if (typeof m.dir !== 'string' || !/^docs\/specdev\/[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(m.dir) || m.dir.split('/').at(-1) !== m.chart) return { invalid: 'typed快照目录越界或与图编号不一致' }
  }
  if (typeof m.chart !== 'string' || !m.chart) return { invalid: 'message.chart 缺失或不是字符串' }
  if (typeof m.name !== 'string' || !m.name.trim()) return { invalid: 'message.name 缺失或为空' }
  if (!STAGES.includes(m.stage as SnapshotStage)) return { invalid: `message.stage 必须是 ${STAGES.join(' / ')}` }
  if (typeof m.dir !== 'string' || !m.dir.startsWith(CONVENTION_ROOT + '/')) {
    return { invalid: `message.dir 必须以 ${CONVENTION_ROOT}/ 开头` }
  }
  if (m.chart !== parsed.chart) return { invalid: `message.chart（${m.chart}）与标签名里的图编号（${parsed.chart}）不一致` }
  if (m.savedAt !== undefined && typeof m.savedAt !== 'string') return { invalid: 'message.savedAt 不是字符串' }
  if (m.note !== undefined && typeof m.note !== 'string') return { invalid: 'message.note 不是字符串' }
  return {
    meta: {
      schema: m.schema as SnapshotMeta['schema'],
      ...(m.schema === TYPED_SCHEMA.snapshot ? { diagramType: 'lifecycle' as const, sourceFile: 'lifecycle.json' as const, fingerprintScheme: LIFECYCLE_FINGERPRINT_SCHEME } : {}),
      chart: m.chart,
      name: m.name,
      stage: m.stage as SnapshotStage,
      note: m.note as string | undefined,
      dir: m.dir,
      savedAt: m.savedAt as string | undefined,
    } as SnapshotMeta,
    commit: record.derefObject,
  }
}

/** 取某张图的快照清单（按 savedAt/标签时间降序，最新在前）。 */
export function snapshotsForChart(records: readonly RawTagRecord[], chartId: string): ChartSnapshots {
  const snapshots: SnapshotEntry[] = []
  let invalidCount = 0
  const invalidSamples: string[] = []
  for (const record of records) {
    const parsed = parseTagName(record.tag)
    if (!parsed || parsed.chart !== chartId) continue
    const result = validateRecord(record)
    if ('invalid' in result) {
      invalidCount += 1
      if (invalidSamples.length < 5) invalidSamples.push(record.tag)
      continue
    }
    snapshots.push({
      tag: record.tag,
      version: parsed.version,
      chart: chartId,
      commit: result.commit,
      createdDate: record.createdDate,
      meta: result.meta,
    })
  }
  snapshots.sort((a, b) => {
    const keyA = a.meta.savedAt ?? a.createdDate
    const keyB = b.meta.savedAt ?? b.createdDate
    if (keyA !== keyB) return keyA < keyB ? 1 : -1
    return a.tag < b.tag ? 1 : -1
  })
  return { snapshots, invalidCount, invalidSamples }
}

/** 按标签全名取单条已校验的快照；找不到或无效时抛带说明的 CoreError。 */
export function findSnapshot(records: readonly RawTagRecord[], tag: string): SnapshotEntry {
  const record = records.find((item) => item.tag === tag)
  if (!record) {
    throw new CoreError('not-found', `标签 ${tag} 不存在`, 404)
  }
  const result = validateRecord(record)
  if ('invalid' in result) {
    throw new CoreError('not-found', `标签 ${tag} 不符合快照约定（${result.invalid}），已被忽略`, 404)
  }
  const parsed = parseTagName(tag)
  return {
    tag,
    version: parsed!.version,
    chart: parsed!.chart,
    commit: result.commit,
    createdDate: record.createdDate,
    meta: result.meta,
  }
}

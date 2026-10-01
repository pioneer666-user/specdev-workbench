// 第一批示例项目生成器：在 local-artifacts 下生成一个虚构业务的小 git 仓库，
// 作为第一批开发与验收的数据源（作者裁决③：第一批用虚构示例仓；真实项目接入时点由作者另定）。
//
// 用法：node sample/generate.mjs [目标目录]（默认 local-artifacts/2026-09-14-第一批示例项目/sample-repo）
// 目标目录必须不存在（不覆盖、不删除既有产物；要重生成请换目录或先自行归档旧目录）。
//
// 仓库内容（虚构业务 Campus Services，非真实业务）：
//   业务 activity-registration（活动报名）
//     · submit-review  两版快照（v1-design / v2-implemented），v2 证据引用固定提交 c4 的 12–16 行
//     · seat-refund    无快照图（验收"没有快照也必须能读"）
//     · fresh-chart    同名图样本（评审 #1）：与 member-points/fresh-chart 编号冲突，验收全局唯一拦截
//   业务 member-points（会员积分）
//     · points-earn    一版快照 + 工作区未提交改动（验收"已改动"徽标）+ 6 个坏标签（验收无效标签跳过：
//                       轻量标签/非JSON message/schema不对/图编号张冠李戴/dir越界/指向树对象）
//     · bad-evidence   坏证据样本图：1 条合法引用 + 4 条坏引用（验收严格校验）
//     · fresh-chart    最小新图：只有 chart.json + workflow.json（验收缺失降级）
//     · bad-missing    缺图文件样本图（B·说人话）：工作区与快照都没有 workflow.json
//     · bad-read       坏图内容样本图（B·说人话）：坏格式快照 v1 + 内容对不上快照 v2 + 完好的当前版本
//     · oversize-demo  超限样本图（评审二修）：当前 workflow.json 超 2MB 读不开，v1 快照正常——验收页面不死、能切历史
//
// 确定性：提交与标签的作者/日期固定（Git 环境变量逐次注入），仓库本地 core.autocrlf=false。
// 同一台机器、同一 git 版本下输入相同则产物逐字节可复现；跨 git 版本不承诺（诚实边界）。
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const execFileAsync = promisify(execFile)
const HERE = path.dirname(fileURLToPath(import.meta.url))
const DATA = path.join(HERE, 'data')
const DEFAULT_TARGET = path.resolve(HERE, '..', '..', 'local-artifacts', '2026-09-14-第一批示例项目', 'sample-repo')

const target = path.resolve(process.argv[2] ?? DEFAULT_TARGET)
if (existsSync(target)) {
  console.error(`目标目录已存在，不覆盖：${target}\n要重新生成请换一个目录，或先把旧目录归档移走。`)
  process.exit(2)
}

const IDENTITY = { name: 'SpecDev Sample', email: 'sample@specdev.local' }
const run = (args, env = {}) => execFileAsync('git', ['-C', target, ...args], { encoding: 'utf8', env: { ...process.env, ...env } })
const read = (name) => readFileSync(path.join(DATA, name), 'utf8')

// 固定时间线（虚构，与贯通小样同日不同时刻）
const T = {
  c1: '2026-09-14T10:00:00+08:00',
  c2: '2026-09-14T10:05:00+08:00',
  tagSubmitV1: '2026-09-14T10:06:00+08:00',
  c3: '2026-09-14T10:10:00+08:00',
  tagPointsV1: '2026-09-14T10:11:00+08:00',
  c4: '2026-09-14T10:15:00+08:00',
  c5: '2026-09-14T10:20:00+08:00',
  tagSubmitV2: '2026-09-14T10:21:00+08:00',
  c6: '2026-09-14T10:25:00+08:00',
  badTags: '2026-09-14T10:30:00+08:00',
  c7: '2026-09-14T10:35:00+08:00',
  tagBadMissingV1: '2026-09-14T10:36:00+08:00',
  tagBadReadV1: '2026-09-14T10:36:30+08:00',
  c8: '2026-09-14T10:40:00+08:00',
  tagBadReadV2: '2026-09-14T10:41:00+08:00',
  c9: '2026-09-14T10:45:00+08:00',
  c10a: '2026-09-14T10:50:00+08:00',
  tagOversizeV1: '2026-09-14T10:51:00+08:00',
  c10b: '2026-09-14T10:55:00+08:00',
}
const dateEnv = (when) => ({
  GIT_AUTHOR_NAME: IDENTITY.name, GIT_AUTHOR_EMAIL: IDENTITY.email,
  GIT_COMMITTER_NAME: IDENTITY.name, GIT_COMMITTER_EMAIL: IDENTITY.email,
  GIT_AUTHOR_DATE: when, GIT_COMMITTER_DATE: when,
})
const snapshotMessage = (meta) => JSON.stringify(meta)

const DATA_ROOT = 'docs/specdev'
const DIR_SUBMIT = `${DATA_ROOT}/activity-registration/submit-review`
const DIR_POINTS = `${DATA_ROOT}/member-points/points-earn`

const manifest = { target, commits: {}, tags: {}, worktreeChange: null }

const write = (rel, content) => {
  const full = path.join(target, rel)
  mkdirSync(path.dirname(full), { recursive: true })
  writeFileSync(full, content, 'utf8')
}
const commit = async (message, when) => {
  await run(['add', '-A'], dateEnv(when))
  await run(['commit', '-m', message], dateEnv(when))
  const { stdout } = await run(['rev-parse', 'HEAD'])
  return stdout.trim()
}
const annotatedTag = async (tag, meta, when) => {
  await run(['tag', '-a', tag, '-m', snapshotMessage(meta)], dateEnv(when))
  manifest.tags[tag] = { date: when }
}

console.log(`生成示例仓库：${target}`)
mkdirSync(target, { recursive: true })
await run(['init', '-b', 'main'])
await run(['config', 'core.autocrlf', 'false'])
await run(['config', 'core.quotepath', 'false'])

// ── c1：初版源码与业务文档 ─────────────────────────────────────────────
write('src/activity-eligibility.js', read('src-activity-eligibility-v1.js'))
write('docs/活动报名说明.md', '# 活动报名业务说明（虚构）\n\n示例项目素材：活动报名的入口、名额与候补规则。\n')
manifest.commits.c1 = await commit('c1: 初版源码与业务文档', T.c1)

// ── c2：submit-review v1（设计版，无证据）+ 标签 ──────────────────────
write(`${DATA_ROOT}/project.json`, JSON.stringify({
  schema: 'specdev/project/1',
  name: '示例项目 · 校园活动服务（虚构）',
  description: '第一批实现用的虚构示例仓：两个业务、九张图，覆盖快照/无快照/坏证据/坏标签/同名编号/坏图内容（缺文件/坏格式/对不上）与超限读不开样本。',
}, null, 2) + '\n')
write(`${DATA_ROOT}/activity-registration/business.json`, JSON.stringify({
  schema: 'specdev/business/1',
  id: 'activity-registration',
  name: '活动报名',
  intro: '校园活动的报名、资格校验与候补（虚构业务）。',
  docs: ['docs/活动报名说明.md'],
}, null, 2) + '\n')
write(`${DIR_SUBMIT}/chart.json`, JSON.stringify({
  schema: 'specdev/chart/1', id: 'submit-review', name: '提交复核流程',
  summary: '从提交报名到确认/拒绝/候补的主流程（两版快照样本）。',
}, null, 2) + '\n')
write(`${DIR_SUBMIT}/workflow.json`, read('wf-submit-v1.json'))
write(`${DIR_SUBMIT}/details.md`, read('details-submit-v1.md'))
write(`${DIR_SUBMIT}/evidence.json`, JSON.stringify({ schema: 'specdev/evidence/1', refs: [] }, null, 2) + '\n')
manifest.commits.c2 = await commit('c2: 提交复核流程 v1（设计版）', T.c2)
await annotatedTag('specdev/submit-review/v1-design', {
  schema: 'specdev/snapshot/1', chart: 'submit-review', name: '首版设计（尚无证据）',
  stage: 'design', dir: DIR_SUBMIT, savedAt: '2026-09-14T10:06:00+08:00',
}, T.tagSubmitV1)

// ── c3：member-points 业务与 points-earn v1 + 标签 ─────────────────────
write(`${DATA_ROOT}/member-points/business.json`, JSON.stringify({
  schema: 'specdev/business/1', id: 'member-points', name: '会员积分',
  intro: '积分的获取、校验与到账通知（虚构业务）。',
}, null, 2) + '\n')
write(`${DIR_POINTS}/chart.json`, JSON.stringify({
  schema: 'specdev/chart/1', id: 'points-earn', name: '会员积分获取',
  summary: '积分获取主流程（一版快照 + 工作区改动样本；另有 6 个坏标签样本挂在本图名下）。',
}, null, 2) + '\n')
write(`${DIR_POINTS}/workflow.json`, read('wf-points.json'))
write(`${DIR_POINTS}/details.md`, read('details-points.md'))
write(`${DIR_POINTS}/evidence.json`, JSON.stringify({ schema: 'specdev/evidence/1', refs: [] }, null, 2) + '\n')
manifest.commits.c3 = await commit('c3: 会员积分业务与积分获取 v1', T.c3)
await annotatedTag('specdev/points-earn/v1-design', {
  schema: 'specdev/snapshot/1', chart: 'points-earn', name: '首版设计',
  stage: 'design', dir: DIR_POINTS, savedAt: '2026-09-14T10:11:00+08:00',
}, T.tagPointsV1)

// ── c4：源码行漂移（v2 证据指向的固定提交；checkEligibility 在 12–16 行）──
write('src/activity-eligibility.js', read('src-activity-eligibility-v2.js'))
manifest.commits.c4 = await commit('c4: 资格校验源码补注释（行号漂移，证据目标提交）', T.c4)

// ── c5：submit-review v2（实现版，证据引用 c4 固定提交）+ 标签 ─────────
write(`${DIR_SUBMIT}/workflow.json`, read('wf-submit-v2.json'))
write(`${DIR_SUBMIT}/details.md`, read('details-submit-v2.md'))
write(`${DIR_SUBMIT}/evidence.json`, JSON.stringify({
  schema: 'specdev/evidence/1',
  refs: [{
    id: 'eligibility-core', label: '资格判定核心（c4 提交，12–16 行）', repo: '.',
    commit: manifest.commits.c4, path: 'src/activity-eligibility.js', fromLine: 12, toLine: 16,
  }],
}, null, 2) + '\n')
manifest.commits.c5 = await commit('c5: 提交复核流程 v2（实现版，补证据）', T.c5)
await annotatedTag('specdev/submit-review/v2-implemented', {
  schema: 'specdev/snapshot/1', chart: 'submit-review', name: '实现版（已补证据）',
  stage: 'implemented', note: '候补通知边 waitlist-notify 已接入；证据指向 c4 固定提交。',
  dir: DIR_SUBMIT, savedAt: '2026-09-14T10:21:00+08:00',
}, T.tagSubmitV2)

// ── c6：补齐其余三张图（seat-refund / bad-evidence / fresh-chart）──────
const DIR_SEAT = `${DATA_ROOT}/activity-registration/seat-refund`
write(`${DIR_SEAT}/chart.json`, JSON.stringify({
  schema: 'specdev/chart/1', id: 'seat-refund', name: '座位退改流程',
  summary: '无快照样本：只有工作区内容，也必须能完整阅读。',
}, null, 2) + '\n')
write(`${DIR_SEAT}/workflow.json`, read('wf-seat.json'))
write(`${DIR_SEAT}/details.md`, read('details-seat.md'))
write(`${DIR_SEAT}/evidence.json`, JSON.stringify({
  schema: 'specdev/evidence/1',
  refs: [{
    id: 'refund-guard', label: '退改资格校验（c4 提交，8–10 行）', repo: '.',
    commit: manifest.commits.c4, path: 'src/activity-eligibility.js', fromLine: 8, toLine: 10,
  }],
}, null, 2) + '\n')

const DIR_BAD = `${DATA_ROOT}/member-points/bad-evidence`
write(`${DIR_BAD}/chart.json`, JSON.stringify({
  schema: 'specdev/chart/1', id: 'bad-evidence', name: '坏证据样本图',
  summary: 'evidence.json 含 1 条合法引用与 4 条坏引用：坏引用必须明确报错，不得展示近似内容。',
}, null, 2) + '\n')
write(`${DIR_BAD}/workflow.json`, read('wf-bad-evidence.json'))
write(`${DIR_BAD}/details.md`, read('details-bad-evidence.md'))
write(`${DIR_BAD}/evidence.json`, JSON.stringify({
  schema: 'specdev/evidence/1',
  refs: [
    { id: 'ok-line', label: '合法引用（应正常切片）', repo: '.', commit: manifest.commits.c4, path: 'src/activity-eligibility.js', fromLine: 12, toLine: 16 },
    { id: 'bad-commit', label: '坏样本：提交不存在', repo: '.', commit: 'deadbeef'.repeat(5), path: 'src/activity-eligibility.js', fromLine: 1, toLine: 2 },
    { id: 'bad-file', label: '坏样本：文件不在该提交上', repo: '.', commit: manifest.commits.c4, path: 'src/never-exists.js', fromLine: 1, toLine: 2 },
    { id: 'bad-lines', label: '坏样本：行范围越界', repo: '.', commit: manifest.commits.c4, path: 'src/activity-eligibility.js', fromLine: 900, toLine: 999 },
    { id: 'bad-repo', label: '坏样本：跨仓引用', repo: 'other', commit: manifest.commits.c4, path: 'src/activity-eligibility.js', fromLine: 1, toLine: 2 },
  ],
}, null, 2) + '\n')

const DIR_FRESH = `${DATA_ROOT}/member-points/fresh-chart`
write(`${DIR_FRESH}/chart.json`, JSON.stringify({
  schema: 'specdev/chart/1', id: 'fresh-chart', name: '新建图（最小样本）',
  summary: '只有 chart.json + workflow.json：details 与 evidence 缺失时的降级样本。',
}, null, 2) + '\n')
write(`${DIR_FRESH}/workflow.json`, read('wf-fresh.json'))

// 评审 #1 样本：与 member-points/fresh-chart 同名——图编号跨业务重复，验收全局唯一拦截
const DIR_DUP = `${DATA_ROOT}/activity-registration/fresh-chart`
write(`${DIR_DUP}/chart.json`, JSON.stringify({
  schema: 'specdev/chart/1', id: 'fresh-chart', name: '同名图样本（编号冲突）',
  summary: '与 member-points/fresh-chart 编号相同：清单应标记编号冲突、直达阅读页应明确报错。',
}, null, 2) + '\n')
write(`${DIR_DUP}/workflow.json`, read('wf-fresh.json'))
manifest.commits.c6 = await commit('c6: 补齐无快照图 / 坏证据图 / 最小新图 / 同名图样本', T.c6)

// ── 坏标签（挂在 points-earn 名下：轻量标签 + 五种不合约定的附注标签）────
await run(['tag', 'specdev/points-earn/bad-lightweight'], dateEnv(T.badTags)) // 轻量标签：不是附注标签
await run(['tag', '-a', 'specdev/points-earn/bad-not-json', '-m', '这不是 JSON 的标签说明'], dateEnv(T.badTags))
await run(['tag', '-a', 'specdev/points-earn/bad-schema', '-m', JSON.stringify({ schema: '别的格式', chart: 'points-earn', name: 'x', stage: 'design', dir: DIR_POINTS })], dateEnv(T.badTags))
await run(['tag', '-a', 'specdev/points-earn/bad-mismatch', '-m', snapshotMessage({ schema: 'specdev/snapshot/1', chart: 'submit-review', name: '张冠李戴', stage: 'design', dir: DIR_SUBMIT })], dateEnv(T.badTags))
await run(['tag', '-a', 'specdev/points-earn/bad-dir', '-m', snapshotMessage({ schema: 'specdev/snapshot/1', chart: 'points-earn', name: '目录越界', stage: 'design', dir: 'src/points' })], dateEnv(T.badTags))
// 评审 #2 样本：附注标签指向树对象——message 五项全合规，唯一不满足"剥壳后必须是提交"
const headTree = (await run(['rev-parse', 'HEAD^{tree}'])).stdout.trim()
await run(['tag', '-a', 'specdev/points-earn/bad-not-commit', '-m', snapshotMessage({ schema: 'specdev/snapshot/1', chart: 'points-earn', name: '指向树对象', stage: 'design', dir: DIR_POINTS }), headTree], dateEnv(T.badTags))

// ── 坏图演示（B·渲染失败说人话）：三类读不了的版本，验收阅读页的中文提示 ──
// c7：bad-missing 只有 chart.json（工作区与快照都缺 workflow.json，验收"文件没了"）
//     bad-read 首版的 workflow.json 不是合法 JSON（验收"文件坏了"）
const DIR_BADMISSING = `${DATA_ROOT}/member-points/bad-missing`
write(`${DIR_BADMISSING}/chart.json`, JSON.stringify({
  schema: 'specdev/chart/1', id: 'bad-missing', name: '缺图文件样本图',
  summary: '工作区与快照都没有 workflow.json：阅读页应说明文件缺失，而不是空白或报错原文。',
}, null, 2) + '\n')

const DIR_BADREAD = `${DATA_ROOT}/member-points/bad-read`
write(`${DIR_BADREAD}/chart.json`, JSON.stringify({
  schema: 'specdev/chart/1', id: 'bad-read', name: '坏图内容样本图',
  summary: '两个坏快照（坏格式 v1、内容对不上 v2）+ 完好的当前版本：验收三类失败提示与换版本建议。',
}, null, 2) + '\n')
write(`${DIR_BADREAD}/workflow.json`, read('wf-bad-json.txt'))
manifest.commits.c7 = await commit('c7: 坏图演示——缺图文件样本 + 坏 JSON 首版', T.c7)
await annotatedTag('specdev/bad-missing/v1-empty', {
  schema: 'specdev/snapshot/1', chart: 'bad-missing', name: '空存档（无图文件）',
  stage: 'design', dir: DIR_BADMISSING, savedAt: '2026-09-14T10:36:00+08:00',
}, T.tagBadMissingV1)
await annotatedTag('specdev/bad-read/v1-broken-json', {
  schema: 'specdev/snapshot/1', chart: 'bad-read', name: '坏格式首版',
  stage: 'design', dir: DIR_BADREAD, savedAt: '2026-09-14T10:36:30+08:00',
}, T.tagBadReadV1)

// c8：bad-read 二版——合法 JSON 但有边指向不存在的节点（验收"内容对不上"，从完好样本现场派生）
const badRefs = JSON.parse(read('wf-fresh.json'))
badRefs.meta = { ...badRefs.meta, title: '坏图内容样本（内容对不上）', subtitle: '演示：一条边指向不存在的节点，编译不过。' }
const danglingEdge = badRefs.edges.find((edge) => edge.id === 'eligible')
if (!danglingEdge) { console.error('坏图派生失败：wf-fresh.json 里没有 id 为 eligible 的边'); process.exit(2) }
danglingEdge.to = 'nonexistent_step'
write(`${DIR_BADREAD}/workflow.json`, JSON.stringify(badRefs, null, 2) + '\n')
manifest.commits.c8 = await commit('c8: 坏图演示——二版边指向不存在的节点', T.c8)
await annotatedTag('specdev/bad-read/v2-contradictory', {
  schema: 'specdev/snapshot/1', chart: 'bad-read', name: '内容对不上二版',
  stage: 'design', dir: DIR_BADREAD, savedAt: '2026-09-14T10:41:00+08:00',
}, T.tagBadReadV2)

// c9：bad-read 当前版本修好（工作区可读，验证"坏版本不影响好版本"）
write(`${DIR_BADREAD}/workflow.json`, read('wf-fresh.json'))
manifest.commits.c9 = await commit('c9: 坏图演示——当前版本修好', T.c9)

// ── 超限样本图（评审二修·超限死路）：当前读不开，历史正常 ────────────────
// c10a：先放正常大小的图并打 v1 快照；c10b：把当前版本撑过 2MB 读取上限。
// 验收"当前读不开仍能从版本条切历史"——页面不死、如实说明"读不开"（不是"缺失"）。
const DIR_OVERSIZE = `${DATA_ROOT}/member-points/oversize-demo`
write(`${DIR_OVERSIZE}/chart.json`, JSON.stringify({
  schema: 'specdev/chart/1', id: 'oversize-demo', name: '超限样本图',
  summary: '当前 workflow.json 超过 2MB 读取上限（读不开，不是缺失）：阅读页应保留版本条、如实说明、可切到正常的历史快照。',
}, null, 2) + '\n')
write(`${DIR_OVERSIZE}/workflow.json`, read('wf-fresh.json'))
write(`${DIR_OVERSIZE}/details.md`,
  '# 超限样本图\n\n当前版本的图文件被人为撑到超过读取上限，验收"读不开"的降级：页面不整页失败、版本条在、能切历史。\n\n## submit_registration\n提交报名——正常写法的节点说明，用于确认说明文档面板不受图文件超限的牵连。\n')
manifest.commits.c10a = await commit('c10: 超限样本图——先放正常大小的 v1', T.c10a)
await annotatedTag('specdev/oversize-demo/v1-normal', {
  schema: 'specdev/snapshot/1', chart: 'oversize-demo', name: '正常首版',
  stage: 'design', dir: DIR_OVERSIZE, savedAt: '2026-09-14T10:51:00+08:00',
}, T.tagOversizeV1)

// 填充字段让文件超过 2MB（仍是合法 JSON；"读不开"发生在读取的大小检查，轮不到解析编译）
const oversized = JSON.parse(read('wf-fresh.json'))
oversized.meta = { ...oversized.meta, title: '超限样本图（当前版本读不开）', subtitle: '演示：文件超过 2MB 读取上限。' }
oversized.pad = '超限演示填充。'.repeat(110000)
write(`${DIR_OVERSIZE}/workflow.json`, JSON.stringify(oversized))
manifest.commits.c10b = await commit('c10b: 超限样本图——当前版本撑过 2MB 读取上限', T.c10b)

// ── 工作区未提交改动：points-earn 的 workflow.json 改一个副标签（不提交）──
const pointsWfPath = path.join(target, DIR_POINTS, 'workflow.json')
const pointsWf = readFileSync(pointsWfPath, 'utf8')
const modified = pointsWf.replace('account + duplicates', 'account + duplicates（工作区草稿）')
if (modified === pointsWf) { console.error('工作区改动注入失败：未匹配到目标文本'); process.exit(2) }
writeFileSync(pointsWfPath, modified, 'utf8')
manifest.worktreeChange = `${DIR_POINTS}/workflow.json`

writeFileSync(path.join(path.dirname(target), 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8')
console.log('完成。清单：' + path.join(path.dirname(target), 'manifest.json'))
console.log('提交：', JSON.stringify(manifest.commits, null, 2))

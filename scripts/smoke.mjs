// src/core 行为冒烟：自包含、可重跑。
// 流程：① 在 local-artifacts/smoke-runs/<时间戳>/ 下生成全新示例仓（sample/generate.mjs）
//      ② 对该仓跑清单 / 阅读页 / 证据 / 错误语义四组断言 ③ 回执写入同目录 receipt.txt。
// 用法（在 specdev-workbench/ 下）：node scripts/smoke.mjs
// 说明：直接 import src/core 的 .ts（本包 "type":"module"，Node 原生剥类型可加载；
//      与正式包无关——正式包走 esbuild 产物）。仓库每次全新生成，git 对象哈希含时间戳，
//      但断言只依赖内容与结构。
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const execFileAsync = promisify(execFile)
const HERE = path.dirname(fileURLToPath(import.meta.url))
const MANAGER = path.resolve(HERE, '..')
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const RUN_DIR = path.resolve(MANAGER, '..', 'local-artifacts', 'smoke-runs', stamp)
const TARGET = path.join(RUN_DIR, 'sample-repo')

const lines = []
const log = (text = '') => {
  console.log(text)
  lines.push(text)
}

log(`# core 冒烟回执 · ${new Date().toISOString()}`)
log(`运行目录：${RUN_DIR}`)
mkdirSync(RUN_DIR, { recursive: true })

log('\n## ① 生成示例仓')
const gen = await execFileAsync(process.execPath, [path.join(MANAGER, 'sample', 'generate.mjs'), TARGET], { encoding: 'utf8' })
log(gen.stdout.trim())
if (gen.stderr) log(gen.stderr.trim())

log('\n## ② 断言')
const core = await import('../src/core/index.ts')
const manifest = JSON.parse(readFileSync(path.join(RUN_DIR, 'manifest.json'), 'utf8'))
const REPO = TARGET

let failures = 0
let passed = 0
const expect = (name, actual, wanted) => {
  const ok = JSON.stringify(actual) === JSON.stringify(wanted)
  if (ok) passed += 1
  else failures += 1
  log(`${ok ? '  ✓' : '  ✗'} ${name}${ok ? '' : `\n      期望 ${JSON.stringify(wanted)}\n      实际 ${JSON.stringify(actual)}`}`)
}

// 一、清单
const inv = await core.readInventory(REPO)
expect('项目名', inv.project.name, '示例项目 · 校园活动服务（虚构）')
expect('业务数', inv.businesses.length, 2)
const byId = Object.fromEntries(inv.businesses.map(b => [b.id, b]))
const chartsOf = (bid) => Object.fromEntries(byId[bid].charts.map(c => [c.id, c]))
const ar = chartsOf('activity-registration'), mp = chartsOf('member-points')
expect('图总数', Object.keys(ar).length + Object.keys(mp).length, 9) // 9=submit/seat/fresh(同名)×2/points/bad-evidence/bad-missing/bad-read/oversize-demo
expect('submit-review 快照数', ar['submit-review'].snapshotCount, 2)
expect('submit-review 当前状态=一致', ar['submit-review'].currentStatus, 'identical')
expect('seat-refund 快照数', ar['seat-refund'].snapshotCount, 0)
expect('seat-refund 当前状态=无快照', ar['seat-refund'].currentStatus, 'no-snapshot')
expect('points-earn 快照数', mp['points-earn'].snapshotCount, 1)
expect('points-earn 无效标签数', mp['points-earn'].invalidTagCount, 6)
expect('points-earn 当前状态=已改动', mp['points-earn'].currentStatus, 'changed')
expect('bad-evidence 有 workflow', mp['bad-evidence'].hasWorkflow, true)
expect('fresh-chart 快照数', mp['fresh-chart'].snapshotCount, 0)

// 评审 #1：图编号全局唯一——同名图两侧都标记冲突，直达阅读页报 409
expect('同名图冲突标记（member-points 侧）',
  [Boolean(mp['fresh-chart'].idConflict), (mp['fresh-chart'].idConflict ?? '').includes('activity-registration')],
  [true, true])
expect('同名图冲突标记（activity-registration 侧）',
  [Boolean(ar['fresh-chart'].idConflict), (ar['fresh-chart'].idConflict ?? '').includes('member-points')],
  [true, true])
for (const biz of ['member-points', 'activity-registration']) {
  try {
    await core.readChartPage(REPO, biz, 'fresh-chart', 'current')
    expect(`编号冲突的图（${biz}）应被拒绝`, '未抛错', '抛错')
  } catch (e) {
    expect(`编号冲突的图（${biz}）409 duplicate-chart-id`, [e.httpStatus, e.code], [409, 'duplicate-chart-id'])
  }
}

// 二、阅读页（当前 vs 历史快照）
const cur = await core.readChartPage(REPO, 'activity-registration', 'submit-review', 'current')
expect('当前版本 workflow 是 v2（6 边）', JSON.parse(cur.version.files.workflow).edges.length, 6)
expect('当前状态徽标数据', cur.currentStatus, 'identical')
const v1 = await core.readChartPage(REPO, 'activity-registration', 'submit-review', 'specdev/submit-review/v1-design')
expect('v1 快照 workflow 是 5 边', JSON.parse(v1.version.files.workflow).edges.length, 5)
expect('v1 快照显示名', v1.version.label, '首版设计（尚无证据）')
expect('v1 快照提交', v1.version.commit, manifest.commits.c2)
expect('v2 最前', v1.snapshots.snapshots[0].tag, 'specdev/submit-review/v2-implemented')
const pointsCur = await core.readChartPage(REPO, 'member-points', 'points-earn', 'current')
expect('points-earn 当前状态=已改动（阅读页）', pointsCur.currentStatus, 'changed')
expect('points-earn 无效标签样本数', pointsCur.snapshots.invalidSamples.length, 5)

// 三、证据严格性
const badEvText = (await core.readWorktreeFileOptional(REPO, 'docs/specdev/member-points/bad-evidence/evidence.json'))
const badEv = await core.loadEvidence(REPO, badEvText)
expect('坏证据图共 5 条引用', badEv.refs.length, 5)
expect('ok-line 切片行数', badEv.refs[0].ok ? core.splitLines(badEv.refs[0].text).length : -1, 5)
for (const [i, keyword] of [[1, '无法在本仓库解析'], [2, '不存在'], [3, '行范围越界'], [4, '同仓引用']]) {
  const ref = badEv.refs[i]
  expect(`坏引用[${i}] 报错含"${keyword}"`, ref.ok ? '(意外成功)' : ref.error.includes(keyword), true)
}
const evTextAtC5 = await core.gitShowFileOptional(REPO, manifest.commits.c5, 'docs/specdev/activity-registration/submit-review/evidence.json')
const submitEvRes = await core.loadEvidence(REPO, evTextAtC5)
expect('submit-review v2 证据 1 条', submitEvRes.refs.length, 1)
expect('eligibility-core 切片含 checkEligibility', submitEvRes.refs[0].ok ? submitEvRes.refs[0].text.includes('checkEligibility') : false, true)
expect('eligibility-core 行数=5', submitEvRes.refs[0].ok ? core.splitLines(submitEvRes.refs[0].text).length : -1, 5)

// 四、错误语义
try {
  await core.readChartPage(REPO, 'activity-registration', 'submit-review', 'specdev/points-earn/v1-design')
  expect('跨图标签应被拒绝', '未抛错', '抛错')
} catch (e) {
  expect('跨图标签被拒绝（400）', [e.httpStatus, e.message.includes('必须是 current 或本图')], [400, true])
}
try {
  await core.readChartPage(REPO, 'activity-registration', 'no-such-chart', 'current')
  expect('不存在的图应 404', '未抛错', '抛错')
} catch (e) {
  expect('不存在的图 404', e.httpStatus, 404)
}
try {
  core.findSnapshot(await core.listSpecdevTags(REPO), 'specdev/points-earn/bad-not-commit')
  expect('指向树对象的标签应被拒绝', '未抛错', '抛错')
} catch (e) {
  expect('指向树对象的标签被拒（404 且写明不是提交）', [e.httpStatus, e.message.includes('不是提交')], [404, true])
}

// 评审 #3：git 不可用时必须报 git-unavailable（子进程剥掉 PATH 验证传播语义，不误报 not-found）
{
  const { pathToFileURL } = await import('node:url')
  const coreUrl = pathToFileURL(path.join(MANAGER, 'src', 'core', 'index.ts')).href
  const probeCode = `
    const core = await import(${JSON.stringify(coreUrl)})
    try {
      await core.resolveCommit(${JSON.stringify(REPO)}, ${JSON.stringify(manifest.commits.c1)})
      console.log('UNEXPECTED-OK')
    } catch (e) {
      console.log(e.code ?? e.message)
    }
  `
  const probe = await execFileAsync(process.execPath, ['--input-type=module', '-e', probeCode], {
    encoding: 'utf8',
    env: { ...process.env, PATH: '' },
  })
  expect('git 不可用时 resolveCommit 报 git-unavailable', probe.stdout.trim(), 'git-unavailable')
}

// 五、保存版本（写入侧步骤 1：检查 / 去重 / 钉提交 / 打标签）。本组会改动示例仓
//    （打标签、写工作区、人为提交一次），放在前四组断言之后执行，互不影响。
{
  const { createHash } = await import('node:crypto')
  // 生成器只逐次注入身份环境变量；补仓级配置，让 core 的 git tag 与人为提交可用
  await execFileAsync('git', ['-C', REPO, 'config', 'user.name', 'SpecDev Sample'], { encoding: 'utf8' })
  await execFileAsync('git', ['-C', REPO, 'config', 'user.email', 'sample@specdev.local'], { encoding: 'utf8' })
  const tagCount = async (prefix) =>
    (await core.listSpecdevTags(REPO)).filter((r) => r.tag.startsWith(prefix)).length
  // 独立重算摘要（同一规则换一路实现）：换行归一 → 固定顺序 JSON 数列 → SHA-256
  const fpAt = async (commit, dir) => {
    const parts = []
    for (const n of ['workflow.json', 'details.md', 'evidence.json']) {
      parts.push(((await core.gitShowFileOptional(REPO, commit, `${dir}/${n}`)) ?? '').replace(/\r\n/g, '\n'))
    }
    return createHash('sha256').update(JSON.stringify(parts), 'utf8').digest('hex')
  }
  const trySave = async (repoRoot, business, chart, input, opts) => {
    try { await core.saveChartSnapshot(repoRoot, business, chart, input, opts); return null } catch (e) { return e }
  }

  // 5.1 干净图保存成功（seat-refund：c6 提交后无改动、无快照）
  const seat = await core.checkChartCommitted(REPO, 'activity-registration', 'seat-refund')
  expect('seat-refund 保存前检查干净', [seat.head === manifest.commits.c10b, seat.ok, seat.problems.length], [true, true, 0])
  expect('摘要与独立重算一致', seat.fingerprint, await fpAt(manifest.commits.c10b, 'docs/specdev/activity-registration/seat-refund'))
  const saved1 = await core.saveChartSnapshot(REPO, 'activity-registration', 'seat-refund',
    { name: '首版设计 · 中文名往返', stage: 'design', note: '超过一万元需要主管确认' },
    { expectedHead: seat.head, fingerprint: seat.fingerprint })
  expect('首次保存 alreadySaved=false', saved1.alreadySaved, false)
  expect('标签名形如 specdev/seat-refund/YYYYMMDD-HHMMSS',
    [/^specdev\/seat-refund\//.test(saved1.snapshot.tag), /^[0-9]{8}-[0-9]{6}(-[0-9]+)?$/.test(saved1.snapshot.tag.split('/').pop())],
    [true, true])
  expect('标签钉在确认过的提交上', saved1.snapshot.commit, seat.head)
  expect('中文名与说明往返逐字一致', [saved1.snapshot.meta.name, saved1.snapshot.meta.note],
    ['首版设计 · 中文名往返', '超过一万元需要主管确认'])
  expect('savedAt 本地 iso8601 形', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(saved1.snapshot.meta.savedAt), true)
  const entry1 = core.findSnapshot(await core.listSpecdevTags(REPO), saved1.snapshot.tag)
  expect('保存后读取侧立即认账', [entry1.commit, entry1.meta.name], [seat.head, '首版设计 · 中文名往返'])
  for (const n of ['workflow.json', 'details.md', 'evidence.json']) {
    expect(`读回 ${n} 逐字一致`,
      await core.gitShowFileOptional(REPO, entry1.commit, `${entry1.meta.dir}/${n}`),
      await core.gitShowFileOptional(REPO, seat.head, `docs/specdev/activity-registration/seat-refund/${n}`))
  }

  // 5.2 去重：同内容同阶段不新增；同内容不同阶段允许
  const again = await core.saveChartSnapshot(REPO, 'activity-registration', 'seat-refund',
    { name: '换名字的重复请求', stage: 'design' }, { expectedHead: seat.head, fingerprint: seat.fingerprint })
  expect('同内容同阶段再存返回已有那份', [again.alreadySaved, again.snapshot.tag], [true, saved1.snapshot.tag])
  expect('连存两次只有一份', await tagCount('specdev/seat-refund/'), 1)
  const stage2 = await core.saveChartSnapshot(REPO, 'activity-registration', 'seat-refund',
    { name: '同内容升为实现版', stage: 'implemented' }, { expectedHead: seat.head, fingerprint: seat.fingerprint })
  expect('同内容不同阶段允许新增', stage2.alreadySaved, false)
  expect('seat-refund 共两份', await tagCount('specdev/seat-refund/'), 2)

  // 5.3 换行：提交里 LF、工作区 CRLF 不误拦；真改了字仍拦（bad-evidence）
  const detailsFull = path.join(REPO, 'docs/specdev/member-points/bad-evidence/details.md')
  const detailsText = readFileSync(detailsFull, 'utf8')
  writeFileSync(detailsFull, detailsText.replace(/\n/g, '\r\n'), 'utf8')
  const crlf = await core.checkChartCommitted(REPO, 'member-points', 'bad-evidence')
  expect('只差换行不误报未提交', [crlf.ok, crlf.problems.length], [true, 0])
  const crlfSaved = await core.saveChartSnapshot(REPO, 'member-points', 'bad-evidence', { name: '换行归一版', stage: 'design' },
    { expectedHead: crlf.head, fingerprint: crlf.fingerprint })
  expect('CRLF 工作区可保存', crlfSaved.alreadySaved, false)
  // 存下之后阅读页也要认这份内容：快照指向的提交是 LF，工作区是 CRLF——两边必须是同一套换行规则，
  // 否则会出现"刚保存完却显示已改动"（审查 P2）
  const crlfPage = await core.readChartPage(REPO, 'member-points', 'bad-evidence', 'current')
  expect('只差换行的已存内容，阅读页认作一致', crlfPage.currentStatus, 'identical')
  writeFileSync(detailsFull, detailsText + '\n真实改动：多了一行。\n', 'utf8')
  const realEdit = await core.checkChartCommitted(REPO, 'member-points', 'bad-evidence')
  expect('真改文字仍被拦', [realEdit.ok, realEdit.problems.includes('details.md 有未提交的修改')], [false, true])

  // 5.4 钉提交：检查通过后人为新提交（只提交图外文件），按旧提交保存被拒
  const beforePin = await core.checkChartCommitted(REPO, 'activity-registration', 'seat-refund')
  const docFull = path.join(REPO, 'docs', '活动报名说明.md')
  writeFileSync(docFull, readFileSync(docFull, 'utf8') + '\n钉提交测试：人为多一行。\n', 'utf8')
  await execFileAsync('git', ['-C', REPO, 'add', 'docs/活动报名说明.md'], { encoding: 'utf8' })
  await execFileAsync('git', ['-C', REPO, 'commit', '-m', '钉提交测试：人为新提交'], { encoding: 'utf8' })
  const pinErr = await trySave(REPO, 'activity-registration', 'seat-refund', { name: '应被拒绝', stage: 'design' },
    { expectedHead: beforePin.head, fingerprint: beforePin.fingerprint })
  expect('后台新提交后按旧提交保存被拒', [pinErr?.httpStatus, pinErr?.code, (pinErr?.message ?? '').includes('请刷新后确认')],
    [409, 'content-updated', true])
  const afterNew = await core.checkChartCommitted(REPO, 'activity-registration', 'seat-refund')
  const fpErr = await trySave(REPO, 'activity-registration', 'seat-refund', { name: '应被拒绝', stage: 'design' },
    { expectedHead: afterNew.head, fingerprint: '0'.repeat(64) })
  expect('摘要不符（页面旧了）被拒', [fpErr?.httpStatus, fpErr?.code], [409, 'content-updated'])
  expect('两次拒绝后仍只有两份', await tagCount('specdev/seat-refund/'), 2)

  // 5.5 脏图 409：points-earn 工作区改动来自生成器
  const dirty = await core.checkChartCommitted(REPO, 'member-points', 'points-earn')
  expect('points-earn 检查报未提交', [dirty.ok, dirty.problems.join('；').includes('workflow.json 有未提交的修改')], [false, true])
  const dirtyErr = await trySave(REPO, 'member-points', 'points-earn', { name: 'x', stage: 'design' },
    { expectedHead: dirty.head, fingerprint: dirty.fingerprint })
  expect('脏图保存 409', [dirtyErr?.httpStatus, dirtyErr?.code], [409, 'uncommitted-changes'])
  expect('points-earn 有效快照仍 1 份', core.snapshotsForChart(await core.listSpecdevTags(REPO), 'points-earn').snapshots.length, 1)

  // 5.6 同秒撞名加 -2 后缀（bad-read，钉死 now；其两个旧快照内容不同，不会撞去重）
  const br = await core.checkChartCommitted(REPO, 'member-points', 'bad-read')
  expect('bad-read 干净可保存', br.ok, true)
  const fixedNow = new Date('2026-09-16T09:08:07')
  const off = -fixedNow.getTimezoneOffset()
  const expSavedAt = `2026-09-16T09:08:07${off >= 0 ? '+' : '-'}${String(Math.floor(Math.abs(off) / 60)).padStart(2, '0')}:${String(Math.abs(off) % 60).padStart(2, '0')}`
  const br1 = await core.saveChartSnapshot(REPO, 'member-points', 'bad-read', { name: '同秒首存', stage: 'design' },
    { expectedHead: br.head, fingerprint: br.fingerprint, now: fixedNow })
  const br2 = await core.saveChartSnapshot(REPO, 'member-points', 'bad-read', { name: '同秒二存', stage: 'implemented' },
    { expectedHead: br.head, fingerprint: br.fingerprint, now: fixedNow })
  expect('同秒撞名自动 -2 后缀', [br1.snapshot.tag, br2.snapshot.tag, br2.alreadySaved],
    ['specdev/bad-read/20260916-090807', 'specdev/bad-read/20260916-090807-2', false])
  expect('savedAt 用指定时间', br2.snapshot.meta.savedAt, expSavedAt)

  // 5.7 输入校验 400（先于一切仓库检查）
  for (const [label, input] of [
    ['空名称', { name: '   ', stage: 'design' }],
    ['名称超 200 字', { name: '长'.repeat(201), stage: 'design' }],
    ['坏阶段', { name: 'x', stage: '草稿' }],
    ['说明超 1000 字', { name: 'x', stage: 'design', note: '注'.repeat(1001) }],
  ]) {
    const e400 = await trySave(REPO, 'activity-registration', 'seat-refund', input, { expectedHead: br.head, fingerprint: 'x' })
    expect(`${label} 拒 400`, [e400?.httpStatus, e400?.code], [400, 'bad-request'])
  }

  // 5.8 无提交仓库：明确态，不算 git 故障
  const UNBORN = path.join(RUN_DIR, 'unborn-repo')
  mkdirSync(path.join(UNBORN, 'docs/specdev/act/chart'), { recursive: true })
  writeFileSync(path.join(UNBORN, 'docs/specdev/act/chart/workflow.json'), '{}\n', 'utf8')
  await execFileAsync('git', ['-C', UNBORN, 'init', '-b', 'main'], { encoding: 'utf8' })
  const unborn = await core.checkChartCommitted(UNBORN, 'act', 'chart')
  expect('无提交仓库是明确态', [unborn.head, unborn.ok, unborn.fingerprint, (unborn.problems[0] ?? '').includes('还没有任何提交')],
    [null, false, null, true])
  const unbornErr = await trySave(UNBORN, 'act', 'chart', { name: 'x', stage: 'design' },
    { expectedHead: '0'.repeat(40), fingerprint: '0'.repeat(64) })
  expect('无提交仓库保存被拒', [unbornErr?.httpStatus, unbornErr?.code, (unbornErr?.message ?? '').includes('还没有任何提交')],
    [409, 'uncommitted-changes', true])

  // 5.9 空图（无 workflow.json）拒绝；超限读不开过不了检查
  const empty = await core.checkChartCommitted(REPO, 'member-points', 'bad-missing')
  expect('空图拒绝保存', [empty.ok, empty.problems.join('；').includes('图还不存在')], [false, true])
  const over = await core.checkChartCommitted(REPO, 'member-points', 'oversize-demo')
  expect('读不开过不了检查且摘要为空', [over.ok, over.problems.join('；').includes('workflow.json 读不开'), over.fingerprint],
    [false, true, null])

  // 5.10 检查的 404/409 语义与阅读页同源（locateChartDir 共用）
  const notFound = await (async () => {
    try { await core.checkChartCommitted(REPO, 'activity-registration', 'no-such-chart'); return null } catch (e) { return e }
  })()
  expect('未知图检查 404', notFound?.httpStatus, 404)
  const idConflict = await (async () => {
    try { await core.checkChartCommitted(REPO, 'member-points', 'fresh-chart'); return null } catch (e) { return e }
  })()
  expect('编号冲突图检查 409', idConflict?.httpStatus, 409)

  // 5.11 摘要分得开"文件不存在"与"空文件"（审查 P2）：先造一张只有两个文件的图，提交；
  //      再补一个空的 evidence.json 提交（模拟页面打开之后后台又提交了东西）。
  //      页面上的摘要取自"缺 evidence"的那一刻，提交号按新的送——只剩摘要这一道闸。
  const NOEV = path.join(REPO, 'docs/specdev/activity-registration/no-evidence')
  mkdirSync(NOEV, { recursive: true })
  writeFileSync(path.join(NOEV, 'workflow.json'), '{\n  "nodes": [],\n  "edges": []\n}\n', 'utf8')
  writeFileSync(path.join(NOEV, 'details.md'), '# 还没有证据文件的图\n', 'utf8')
  await execFileAsync('git', ['-C', REPO, 'add', 'docs/specdev/activity-registration/no-evidence'], { encoding: 'utf8' })
  await execFileAsync('git', ['-C', REPO, 'commit', '-m', '自造：还没有证据文件的图'], { encoding: 'utf8' })
  const noEv = await core.checkChartCommitted(REPO, 'activity-registration', 'no-evidence')
  expect('缺 evidence.json 也能过检查', [noEv.ok, noEv.problems.length], [true, 0])
  writeFileSync(path.join(NOEV, 'evidence.json'), '', 'utf8')
  await execFileAsync('git', ['-C', REPO, 'add', 'docs/specdev/activity-registration/no-evidence/evidence.json'], { encoding: 'utf8' })
  await execFileAsync('git', ['-C', REPO, 'commit', '-m', '补一个空的 evidence.json'], { encoding: 'utf8' })
  const emptyEv = await core.checkChartCommitted(REPO, 'activity-registration', 'no-evidence')
  expect('空 evidence.json 也能过检查', [emptyEv.ok, emptyEv.problems.length], [true, 0])
  expect('缺文件与空文件是两份不同的内容（摘要不同）', noEv.fingerprint === emptyEv.fingerprint, false)
  const staleEv = await trySave(REPO, 'activity-registration', 'no-evidence', { name: '按页面旧摘要存', stage: 'design' },
    { expectedHead: emptyEv.head, fingerprint: noEv.fingerprint })
  expect('按"缺文件那一眼"的摘要保存被拦', [staleEv?.httpStatus, staleEv?.code], [409, 'content-updated'])
  expect('被拦之后一个版本都没多', await tagCount('specdev/no-evidence/'), 0)

  // 5.12 并发（受控交错）：同一份内容、两个不同时间戳的保存同时发起，只能留下一份（审查 P2）。
  //      这就是查重与写入之间那道排队的针对性用例——不同时间戳会各自挑到不同的名字，
  //      没有排队时两个 git tag 都会成功（修复前实测：存出 2 份同内容版本）。
  const [cc1, cc2] = await Promise.all([
    core.saveChartSnapshot(REPO, 'activity-registration', 'no-evidence', { name: '并发 A', stage: 'design' },
      { expectedHead: emptyEv.head, fingerprint: emptyEv.fingerprint, now: new Date('2026-09-16T11:00:00') }),
    core.saveChartSnapshot(REPO, 'activity-registration', 'no-evidence', { name: '并发 B', stage: 'design' },
      { expectedHead: emptyEv.head, fingerprint: emptyEv.fingerprint, now: new Date('2026-09-16T11:00:01') }),
  ])
  const both = [cc1, cc2]
  const creator = both.find((r) => r.alreadySaved === false)
  expect('不同时间戳的并发保存只留一份', both.filter((r) => r.alreadySaved === false).length, 1)
  expect('另一条返回同一份版本', both.filter((r) => r.alreadySaved === true).map((r) => r.snapshot.tag), [creator.snapshot.tag])
  expect('该图最终只有 1 个版本', await tagCount('specdev/no-evidence/'), 1)

  // 5.13 写入之后的失败一律报成"版本已写上、只是没核完"，并带上版本名（审查 P2）。
  //      这条翻译规则本身直接可测；真实的"标签写下去了、读回却失败"逼不出来——本机试过
  //      把无法原样往返的字符放进名称（孤立代理项），实测 git 与 JSON 都能原往返，故不造。
  const mapped = core.createdUnverifiedError('specdev/x/20260101-000000', new Error('git 超时'))
  expect('写入后失败换成"已写上、没核完"并带上版本名',
    [mapped.code, mapped.httpStatus, mapped.message.includes('specdev/x/20260101-000000'), mapped.message.includes('已经写上去了')],
    ['save-created-unverified', 500, true, true])
  const mappedAgain = core.createdUnverifiedError('specdev/x/20260101-000000', mapped)
  expect('已是这个码就不重复包装', [mappedAgain.code, mappedAgain.message === mapped.message], ['save-created-unverified', true])
}

// 六、N2c 契约边界；只在本次 RUN_DIR 搭建虚构探针仓，读取期间不写资料。
{
  expect('N2c 根与五类登记 schema', [core.CONVENTION_ROOT, core.SCHEMA],
    ['docs/specdev', { project: 'specdev/project/1', business: 'specdev/business/1', chart: 'specdev/chart/1', evidence: 'specdev/evidence/1', snapshot: 'specdev/snapshot/1' }])
  expect('N2c 建筑常量', [core.BUILDING_FORMAT, core.BUILDING_SCHEMA], ['specdev-building', 'specdev/building/1'])
  expect('新标签保留斜杠版本', core.parseTagName('specdev/probe/v1/design'), { chart: 'probe', version: 'v1/design' })
  expect('旧标签前缀不解析', core.parseTagName('archify/probe/legacy'), null)
  const probe = path.join(RUN_DIR, 'contract-probe')
  const git = async (...args) => (await execFileAsync('git', ['-C', probe, ...args], { encoding: 'utf8' })).stdout.trim()
  const put = (rel, data) => {
    const full = path.join(probe, rel)
    mkdirSync(path.dirname(full), { recursive: true })
    writeFileSync(full, JSON.stringify(data, null, 2) + '\n', 'utf8')
  }
  const oldProject = 'docs/archify/project.json', oldBusiness = 'docs/archify/legacy/business.json'
  put(oldProject, { schema: 'specdev-archify/project/1', name: '旧项目' })
  put(oldBusiness, { schema: 'specdev-archify/business/1', id: 'legacy', name: '旧业务' })
  const oldBytes = () => [oldProject, oldBusiness].map(rel => readFileSync(path.join(probe, rel)).toString('hex'))
  await git('init', '-b', 'main')
  await git('config', 'user.name', 'SpecDev Sample')
  await git('config', 'user.email', 'sample@specdev.local')
  await git('add', '.')
  await git('commit', '-m', '虚构旧根')
  const beforeOld = oldBytes(), beforeStatus = await git('status', '--porcelain')
  const failure = async (fn) => { try { await fn(); return null } catch (e) { return e } }
  const missing = await failure(() => core.readInventory(probe))
  expect('只有旧根报新根缺失', [missing?.code, missing?.message.includes('docs/specdev/project.json')], ['no-convention-root', true])
  expect('旧根读取不自动迁移', [await core.worktreeFileExists(probe, 'docs/specdev/project.json'), oldBytes(), await git('status', '--porcelain')], [false, beforeOld, beforeStatus])
  const projectRel = 'docs/specdev/project.json', businessRel = 'docs/specdev/biz/business.json', chartRel = 'docs/specdev/biz/probe/chart.json'
  put(projectRel, { schema: 'specdev/project/1', name: '新项目' })
  put(businessRel, { schema: 'specdev/business/1', id: 'biz', name: '新业务' })
  put(chartRel, { schema: 'specdev/chart/1', id: 'probe', name: '探针图' })
  put('docs/specdev/biz/probe/workflow.json', { nodes: [], edges: [] })
  await git('add', '.')
  await git('commit', '-m', '显式搭建新契约')
  const commit = await git('rev-parse', 'HEAD'), newStatus = await git('status', '--porcelain')
  const inventory = await core.readInventory(probe)
  expect('双根只读新项目与新身份', [inventory.project.name, inventory.businesses.map(b => [b.id, b.charts.map(c => c.id)])], ['新项目', [['biz', ['probe']]]])
  expect('双根读取保持旧字节与状态', [oldBytes(), await git('status', '--porcelain')], [beforeOld, newStatus])
  for (const [kind, rel] of [['project', projectRel], ['business', businessRel], ['chart', chartRel]]) {
    const original = readFileSync(path.join(probe, rel), 'utf8')
    try {
      put(rel, { ...JSON.parse(original), schema: `specdev-archify/${kind}/1` })
      if (kind === 'project') {
        const err = await failure(() => core.readInventory(probe))
        expect('旧 project schema 严格拒收', [err?.code, err?.message.includes('specdev/project/1')], ['bad-inventory', true])
      } else {
        const result = await core.readInventory(probe)
        const item = kind === 'business' ? result.businesses[0] : result.businesses[0].charts[0]
        expect(`旧 ${kind} schema 标记 descriptorError`, item.descriptorError?.includes(`specdev/${kind}/1`), true)
      }
    } finally { writeFileSync(path.join(probe, rel), original, 'utf8') }
  }
  const meta = { schema: 'specdev/snapshot/1', chart: 'probe', name: '有效快照', stage: 'design', dir: 'docs/specdev/biz/probe' }
  await git('tag', '-a', 'specdev/probe/valid', '-m', JSON.stringify(meta))
  await git('tag', '-a', 'archify/probe/legacy', '-m', JSON.stringify({ ...meta, schema: 'specdev-archify/snapshot/1', dir: 'docs/archify/legacy/probe' }))
  const legacyObject = await git('rev-parse', 'refs/tags/archify/probe/legacy')
  const records = await core.listSpecdevTags(probe)
  expect('真实扫描只列新标签', records.map(r => r.tag), ['specdev/probe/valid'])
  const snapshot = core.findSnapshot(records, 'specdev/probe/valid')
  expect('真实新快照 schema、dir 与提交', [snapshot.meta.schema, snapshot.meta.dir, snapshot.commit], ['specdev/snapshot/1', 'docs/specdev/biz/probe', commit])
  for (const [key, value] of [['schema', 'specdev-archify/snapshot/1'], ['dir', 'docs/archify/biz/probe']]) {
    const invalid = { ...records[0], message: JSON.stringify({ ...JSON.parse(records[0].message), [key]: value }) }
    const list = core.snapshotsForChart([invalid], 'probe')
    const err = await failure(() => core.findSnapshot([invalid], invalid.tag))
    expect(`只换旧快照 ${key} 被拒收`, [list.snapshots.length, list.invalidCount, err?.code, err?.message.includes(`message.${key}`)], [0, 1, 'not-found', true])
  }
  expect('探针读取不改旧标签、旧根与工作区', [await git('rev-parse', 'refs/tags/archify/probe/legacy'), oldBytes(), await git('status', '--porcelain')], [legacyObject, beforeOld, newStatus])
  const blueprint = JSON.parse(readFileSync(path.join(MANAGER, 'tests/fixtures/building-single.json'), 'utf8'))
  const sources = { project: { name: '一房样张' }, businesses: [{ id: 'sample-business', name: '样张业务', intro: '占位业务' }] }
  const generated = core.generateBuilding(blueprint, sources)
  expect('真实新建筑生成契约', [generated.ok, generated.model?.format, generated.model?.generator], [true, 'specdev-building-model', 'specdev/building/1'])
  for (const [key, value] of [['format', 'archify-house'], ['schema', 'specdev-archify/building/1']]) {
    const result = core.generateBuilding({ ...blueprint, [key]: value }, sources)
    expect(`只换旧建筑 ${key} 精确拒收`, [result.ok, result.diagnostics.some(d => d.severity === 'error' && d.subject.path === `/${key}`)], [false, true])
  }
  log(`N2c 探针仓保留：${probe}`)
}

log(`\n## ③ 结果：通过 ${passed} / 失败 ${failures}（共 ${passed + failures} 项断言）`)
writeFileSync(path.join(RUN_DIR, 'receipt.txt'), lines.join('\n') + '\n', 'utf8')
log(`回执已写入：${path.join(RUN_DIR, 'receipt.txt')}`)
process.exit(failures ? 1 : 0)

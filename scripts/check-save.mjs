// 保存版本·接口层验收：入库、可重跑、自包含。
// 流程：① 构建 dist（scripts/build.mjs）→ ② 用假 DSH 装载**构建产物** dist/index.js
//       （给 webServer / effect / connection / skills / fs 与工作区软探测，访问其他能力当场报错）→ ③ 本地起 HTTP →
//       ④ 走真实路由断言 GET/POST /api/snapshots 的语义 → ⑤ 回执写 local-artifacts/smoke-runs/。
// 用法（在 specdev-workbench/ 下）：node scripts/check-save.mjs
// 说明：示例仓每次全新生成（sample/generate.mjs），本脚本会往那个临时仓里打标签、造一次
//       人为提交——都在 local-artifacts/ 下的临时目录里，不碰本工作区、不碰产品代码。
//       摘要由本脚本用 git 命令 + Node 哈希独立重算（不复用产品代码），避免"同错同过"。
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import http from 'node:http'
import path from 'node:path'
// 页面真正加载的模块之一：保存弹层的状态规则（纯逻辑，可在这里直接跑断言）
import { rememberShown, shownFingerprint, saveGate, saveOutcome } from '../web/assets/save-result.js'

const execFileAsync = promisify(execFile)
const HERE = path.dirname(fileURLToPath(import.meta.url))
const MANAGER = path.resolve(HERE, '..')
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const RUN_DIR = path.resolve(MANAGER, '..', 'local-artifacts', 'smoke-runs', `${stamp}-check-save`)
const REPO = path.join(RUN_DIR, 'sample-repo')
const PREFIX = '/specdev-workbench'
const BIZ = 'activity-registration'
const CHART = 'seat-refund' // 干净图：生成后工作区无改动、无版本
const CLEAN_DIR = `docs/specdev/${BIZ}/${CHART}`
const DIRTY_BIZ = 'member-points'
const DIRTY_CHART = 'points-earn' // 生成器改了工作区且未提交
const DIRTY_DIR = `docs/specdev/${DIRTY_BIZ}/${DIRTY_CHART}`
const PROBE_BIZ = 'probe-biz' // 脚本自造的干净小图，专供并发用例（不依赖生成器的既有状态）
const PROBE_CHART = 'probe-chart'
const PROBE_DIR = `docs/specdev/${PROBE_BIZ}/${PROBE_CHART}`
const PROBE2_CHART = 'probe-noev' // 只提交两个文件的干净小图：分辨"缺证据文件"与"空证据文件"
const PROBE2_DIR = `docs/specdev/${PROBE_BIZ}/${PROBE2_CHART}`
const FILES = [['workflow.json', 'workflow'], ['details.md', 'details'], ['evidence.json', 'evidence']]

const lines = []
const log = (text = '') => {
  console.log(text)
  lines.push(text)
}
const writeReceipt = () => {
  mkdirSync(RUN_DIR, { recursive: true })
  const file = path.join(RUN_DIR, 'receipt.txt')
  writeFileSync(file, lines.join('\n') + '\n', 'utf8')
  return file
}

let passed = 0
let failures = 0
const expect = (name, actual, wanted) => {
  const ok = JSON.stringify(actual) === JSON.stringify(wanted)
  if (ok) passed += 1
  else failures += 1
  log(`${ok ? '  ✓' : '  ✗'} ${name}${ok ? '' : `\n      期望 ${JSON.stringify(wanted)}\n      实际 ${JSON.stringify(actual)}`}`)
}

log(`# 保存版本·接口层验收回执 · ${new Date().toISOString()}`)
log(`运行目录：${RUN_DIR}`)
log(`产品代码：${MANAGER}\n`)

// ── ① 构建产物 ───────────────────────────────────────────────────────────────
log('## ① 构建 dist（与发版同一个脚本）')
const build = await execFileAsync(process.execPath, [path.join(MANAGER, 'scripts', 'build.mjs')], { cwd: MANAGER, encoding: 'utf8' })
log(build.stdout.trim() + (build.stderr.trim() ? '\n' + build.stderr.trim() : ''))
const DIST = path.join(MANAGER, 'dist', 'index.js')
expect('dist/index.js 已生成', existsSync(DIST), true)
const bundle = readFileSync(DIST, 'utf8')
expect('产物里就是本步的代码', [bundle.includes('saveChartSnapshot'), bundle.includes('checkChartCommitted'), bundle.includes('snapshots')], [true, true, true])
// 产物里中文按 esbuild 默认（charset=ascii）转义成 \uXXXX，只认句中的 ASCII 段
expect('产物含新的方法守卫文案', [bundle.includes('POST /api/evidence'), bundle.includes('POST /api/snapshots')], [true, true])

// ── ② 示例仓 ─────────────────────────────────────────────────────────────────
log('\n## ② 生成一次性示例仓')
const gen = await execFileAsync(process.execPath, [path.join(MANAGER, 'sample', 'generate.mjs'), REPO], { encoding: 'utf8' })
log(gen.stdout.trim() + (gen.stderr.trim() ? '\n' + gen.stderr.trim() : ''))
await execFileAsync('git', ['-C', REPO, 'config', 'user.name', 'SpecDev Check'], { encoding: 'utf8' })
await execFileAsync('git', ['-C', REPO, 'config', 'user.email', 'sample@specdev.local'], { encoding: 'utf8' })

// 自造一张干净、无版本的小图并提交：并发用例要有"此前没有同内容版本"的起点
mkdirSync(path.join(REPO, PROBE_DIR), { recursive: true })
writeFileSync(path.join(REPO, PROBE_DIR, 'workflow.json'), '{\n  "nodes": [],\n  "edges": []\n}\n', 'utf8')
writeFileSync(path.join(REPO, PROBE_DIR, 'details.md'), '# probe\n\n并发用例专用图。\n', 'utf8')
writeFileSync(path.join(REPO, PROBE_DIR, 'evidence.json'), '{\n  "refs": []\n}\n', 'utf8')
await execFileAsync('git', ['-C', REPO, 'add', PROBE_DIR], { encoding: 'utf8' })
await execFileAsync('git', ['-C', REPO, 'commit', '-m', '并发用例：自造一张干净的小图'], { encoding: 'utf8' })

// 再自造一张"还没有证据文件"的干净小图：用来分辨"文件不存在"与"空文件"（审查 P2）
mkdirSync(path.join(REPO, PROBE2_DIR), { recursive: true })
writeFileSync(path.join(REPO, PROBE2_DIR, 'workflow.json'), '{\n  "nodes": [],\n  "edges": []\n}\n', 'utf8')
writeFileSync(path.join(REPO, PROBE2_DIR, 'details.md'), '# probe-noev\n\n还没有证据文件的小图。\n', 'utf8')
await execFileAsync('git', ['-C', REPO, 'add', PROBE2_DIR], { encoding: 'utf8' })
await execFileAsync('git', ['-C', REPO, 'commit', '-m', '自造一张还没有证据文件的小图'], { encoding: 'utf8' })

const gitShow = async (commit, relPath) => {
  try {
    const { stdout } = await execFileAsync('git', ['-C', REPO, 'show', `${commit}:${relPath}`], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
    return stdout
  } catch {
    return null
  }
}
/** 独立重算摘要：换行归一 → 固定顺序 JSON 数列 → SHA-256（与产品同一规则，另一路实现）。
 *  缺文件记 null、空文件记空串——两边必须分得开，否则这个"独立重算"会跟着产品一起错。 */
const fpAt = async (commit, dir) => {
  const parts = []
  for (const [name] of FILES) {
    const text = await gitShow(commit, `${dir}/${name}`)
    parts.push(text === null ? null : text.replace(/\r\n/g, '\n'))
  }
  return createHash('sha256').update(JSON.stringify(parts), 'utf8').digest('hex')
}
const headNow = async () => (await execFileAsync('git', ['-C', REPO, 'rev-parse', 'HEAD'], { encoding: 'utf8' })).stdout.trim()
/** 提交一次人为改动（只碰图外文件），用于造"弹层确认后后台又有新提交"。 */
const humanCommit = async (note) => {
  const doc = path.join(REPO, 'docs', '活动报名说明.md')
  writeFileSync(doc, readFileSync(doc, 'utf8') + `\n${note}\n`, 'utf8')
  await execFileAsync('git', ['-C', REPO, 'add', 'docs/活动报名说明.md'], { encoding: 'utf8' })
  await execFileAsync('git', ['-C', REPO, 'commit', '-m', note], { encoding: 'utf8' })
  return headNow()
}
const HEAD0 = await headNow()

// ── ③ 假 DSH 装载构建产物 ────────────────────────────────────────────────────
log('\n## ③ 假 DSH（只提供 webServer.register / effect）装载 dist/index.js')
const plugin = await import(pathToFileURL(DIST).href)
const registered = []
let disposer = null
let effectLabel = null
const capabilities = {
  webServer: {
    register(route) {
      registered.push(route)
      return () => { registered.length = 0 }
    },
  },
  effect(fn, label) {
    effectLabel = label
    disposer = fn()
  },
  // 1d 起插件装载时会注册随包技能（inject 含 skills/fs）：假环境按 runtime provider 语义给
  // register/list/get，并给一个能读盘的 fs。只给 register 会让自查在 list 上抛 TypeError，
  // 日志里出现**假的**"技能自查失败"（2026-09-25 前就是这样）。
  skills: (() => {
    const entries = []
    return {
      entries,
      register(entry) { entries.push(entry) },
      list: async () => entries.map((entry) => ({ name: entry.name })),
      get: async (name) => {
        const hit = entries.find((entry) => entry.name === name)
        return hit === undefined ? undefined : { name: hit.name, content: hit.content }
      },
    }
  })(),
  fs: {
    resolve: async (file) => ({ targetKey: file, displayPath: file }),
    readText: async (target) => readFileSync(target.targetKey, 'utf8'),
  },
  // 路由入口统一过 connection.requestRejection：本脚本聚焦保存业务，桩明确放行（undefined）；
  // 认证门的拒绝行为不在本脚本范围。
  connection: { requestRejection: () => undefined },
  // 第二期：带 workspace 的链接按请求软探测注册表；假环境没有这个服务（探测缺席的真实语义）。
  get(name) {
    return undefined
  },
}
// 只提供这几项能力：插件一旦访问别的 DSH 能力，这里当场抛错（不静默放过）
const fakeCtx = new Proxy(capabilities, {
  get(target, key) {
    if (key in target) return target[key]
    throw new Error(`插件访问了未提供的 DSH 能力：${String(key)}`)
  },
})
plugin.apply(fakeCtx, { repoRoot: REPO })
expect('插件导出的 name', plugin.name, 'specdev-workbench')
expect('插件声明的 inject', plugin.inject, ['webServer', 'connection', 'skills', 'fs'])
expect('注册了一次前缀路由', registered.length, 1)
expect('路由形状', [registered[0]?.kind, registered[0]?.path], ['prefix', PREFIX])
expect('effect 拿到的是清理函数与标签', [typeof disposer, effectLabel], ['function', '流程图管理路由清理'])

const server = http.createServer((req, res) => {
  // 真实 DSH 只把本前缀下的请求交给这个 handler，这里照做
  if (registered.length === 0 || !(req.url ?? '').startsWith(PREFIX)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('not handled')
    return
  }
  registered[0].handler(req, res)
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`
log(`  本地服务：${origin}${PREFIX}`)

const getJson = async (p) => {
  const r = await fetch(origin + p)
  const text = await r.text()
  let body
  try { body = JSON.parse(text) } catch { body = text }
  return { status: r.status, body }
}
const postRaw = async (body) => {
  const r = await fetch(`${origin}${PREFIX}/api/snapshots`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
  })
  const text = await r.text()
  let parsed
  try { parsed = JSON.parse(text) } catch { parsed = text }
  return { status: r.status, body: parsed }
}
const postSave = (payload) => postRaw(JSON.stringify(payload))
const check = (biz, chart) => getJson(`${PREFIX}/api/snapshots?business=${biz}&chart=${chart}`)
/** 该图实际留下的标签数：直接用 git 数（独立于产品代码，作"版本数"的准绳）。 */
const tagCount = async (chart) =>
  (await execFileAsync('git', ['-C', REPO, 'tag', '--list', `specdev/${chart}/*`], { encoding: 'utf8' })).stdout.split('\n').filter(Boolean).length
/** 该图当前有效版本数：从清单接口取，与页面看到的是同一份账。 */
const versionCount = async (biz, chart) => {
  const inv = await getJson(`${PREFIX}/api/inventory`)
  return inv.body.businesses.find((x) => x.id === biz)?.charts.find((c) => c.id === chart)?.snapshotCount
}

// ── ④ 断言 ───────────────────────────────────────────────────────────────────
log('\n## ④ 真实路由断言')

log('\n### 4.1 GET 检查')
// 出错响应也带 repo 块（空状态/错误页要显示工作区信息；手动模式同样带）
const missingChart = await getJson(`${PREFIX}/api/chart?business=${BIZ}&chart=no-such-chart&v=current`)
expect('图不存在 404 且响应带 repo 块', [missingChart.status, missingChart.body.code, missingChart.body.repo?.mode], [404, 'not-found', 'manual'])
const clean = await check(BIZ, CHART)
expect('干净图 200 且 ok=true、没有问题', [clean.status, clean.body.ok, clean.body.problems], [200, true, []])
expect('干净图 head＝仓库 HEAD', clean.body.head, HEAD0)
expect('干净图摘要＝独立重算', clean.body.fingerprint, await fpAt(HEAD0, CLEAN_DIR))
expect('初始版本数 0（脚本自己造的状态）', await versionCount(BIZ, CHART), 0)
// 页面自查"我正看的这一版是不是旧了"就靠这个摘要：v=current 的响应必须带上它，且与检查结果同值
const currentPage = await getJson(`${PREFIX}/api/chart?business=${BIZ}&chart=${CHART}&v=current`)
expect('v=current 的响应带内容摘要，且与检查结果一致',
  [currentPage.status, currentPage.body.currentFingerprint, currentPage.body.currentFingerprint === clean.body.fingerprint], [200, clean.body.fingerprint, true])

const dirty = await check(DIRTY_BIZ, DIRTY_CHART)
expect('不干净图 ok=false 且报出是哪个文件', [dirty.status, dirty.body.ok, dirty.body.problems.join('；').includes('workflow.json 有未提交的修改')], [200, false, true])
expect('不干净图仍给出 HEAD 侧的 head 与摘要', [dirty.body.head, dirty.body.fingerprint], [HEAD0, await fpAt(HEAD0, DIRTY_DIR)])

log('\n### 4.2 并发同内容请求（防连点 / 网络重试同时到达，此前没有同内容版本）')
const probeCheck = await check(PROBE_BIZ, PROBE_CHART)
expect('探测图干净可存', [probeCheck.body.ok, probeCheck.body.problems], [true, []])
const burst = await Promise.all([1, 2, 3, 4].map((i) => postSave({
  business: PROBE_BIZ, chart: PROBE_CHART, name: `并发第 ${i} 条`, stage: 'design',
  head: probeCheck.body.head, fingerprint: probeCheck.body.fingerprint,
})))
const winners = burst.filter((r) => r.body?.alreadySaved === false)
if (burst.some((r) => r.status !== 200)) log(`  非 200 的响应正文：${JSON.stringify(burst.filter((r) => r.status !== 200).map((r) => r.body))}`)
expect('四条同时到达的相同请求都成功（不该出现 500）', burst.map((r) => r.status), [200, 200, 200, 200])
expect('只有一条真的新建版本', winners.length, 1)
expect('其余各条返回同一份已保存的版本',
  burst.filter((r) => r.body?.alreadySaved === true).map((r) => r.body.snapshot.tag), Array(3).fill(winners[0]?.body.snapshot.tag))
expect('该图最终只有 1 个版本', await tagCount(PROBE_CHART), 1)

log('\n### 4.3 POST 保存成功（中文名过 HTTP ＋ 整版读回）')
const before = await getJson(`${PREFIX}/api/chart?business=${BIZ}&chart=${CHART}&v=current`)
expect('保存前 v=current 可读', [before.status, before.body.version.kind], [200, 'current'])
const NAME = '首版设计 · 中文名过 HTTP'
const saved = await postSave({ business: BIZ, chart: CHART, name: NAME, stage: 'design', note: '超过一万元需要主管确认', head: clean.body.head, fingerprint: clean.body.fingerprint })
expect('保存 200', saved.status, 200)
expect('返回 snapshot 且 alreadySaved=false', [typeof saved.body.snapshot?.tag, saved.body.alreadySaved], ['string', false])
expect('标签名形如 specdev/<图编号>/YYYYMMDD-HHMMSS',
  [/^specdev\/seat-refund\//.test(saved.body.snapshot.tag), /^[0-9]{8}-[0-9]{6}(-[0-9]+)?$/.test(saved.body.snapshot.tag.split('/').pop())], [true, true])
expect('标签钉在确认过的提交上', saved.body.snapshot.commit, clean.body.head)
expect('中文名与说明经 HTTP 往返逐字一致', [saved.body.snapshot.meta.name, saved.body.snapshot.meta.note], [NAME, '超过一万元需要主管确认'])
expect('保存后版本数 +1', await versionCount(BIZ, CHART), 1)

const tag = saved.body.snapshot.tag
const back = await getJson(`${PREFIX}/api/chart?business=${BIZ}&chart=${CHART}&v=${encodeURIComponent(tag)}`)
expect('新版本整版读回',
  [back.status, back.body.version.kind, back.body.version.label, back.body.version.stage, back.body.version.commit],
  [200, 'snapshot', NAME, 'design', clean.body.head])
const backMatched = []
for (const [file, key] of FILES) backMatched.push(back.body.version.files[key] === await gitShow(clean.body.head, `${CLEAN_DIR}/${file}`))
expect('读回的三文件与提交上的逐字一致', backMatched, [true, true, true])
expect('该版本出现在版本清单里', back.body.snapshots.snapshots.some((s) => s.tag === tag), true)
expect('看历史版本时不给自查摘要（null，页面据此不显示保存入口）', back.body.currentFingerprint, null)

log('\n### 4.4 重复请求不多存')
const dup = await postSave({ business: BIZ, chart: CHART, name: '换个名字的重复请求', stage: 'design', head: clean.body.head, fingerprint: clean.body.fingerprint })
expect('同内容同阶段再发返回已有那份', [dup.status, dup.body.alreadySaved, dup.body.snapshot.tag], [200, true, tag])
expect('版本数没多', await versionCount(BIZ, CHART), 1)

log('\n### 4.5 页面过期拒绝（钉提交 ＋ 核摘要）')
// 页面旧了的第三态：确认之后后台又有新提交（只提交图外文件，图内容没动）
await humanCommit('过期测试：人为新提交')
const afterCommit = await check(BIZ, CHART)
expect('新提交后 head 前移', afterCommit.body.head !== clean.body.head, true)
expect('图内容没变则摘要不变（页面靠 head 知道自己旧了）', afterCommit.body.fingerprint === clean.body.fingerprint, true)
expect('新 head 与仓库 HEAD 一致', afterCommit.body.head, await headNow())

const staleHead = await postSave({ business: BIZ, chart: CHART, name: '应被拒绝', stage: 'design', head: clean.body.head, fingerprint: clean.body.fingerprint })
expect('按弹层确认过的旧提交保存被拒', [staleHead.status, staleHead.body.code, staleHead.body.error.includes('请刷新后确认')], [409, 'content-updated', true])
expect('被拒后版本数不变', await versionCount(BIZ, CHART), 1)

const staleFp = await postSave({ business: BIZ, chart: CHART, name: '应被拒绝', stage: 'design', head: afterCommit.body.head, fingerprint: '0'.repeat(64) })
expect('摘要不符（页面是旧的）被拒', [staleFp.status, staleFp.body.code, staleFp.body.error.includes('请刷新后确认')], [409, 'content-updated', true])
expect('被拒后版本数仍不变', await versionCount(BIZ, CHART), 1)

const acrossCommit = await postSave({ business: BIZ, chart: CHART, name: '跨提交的重复请求', stage: 'design', head: afterCommit.body.head, fingerprint: afterCommit.body.fingerprint })
expect('换提交号但内容相同→仍认作已保存', [acrossCommit.status, acrossCommit.body.alreadySaved, acrossCommit.body.snapshot.tag], [200, true, tag])
expect('版本数仍 1', await versionCount(BIZ, CHART), 1)

log('\n### 4.5b 缺文件 ≠ 空文件：页面打开之后，后台补了一个空的 evidence.json（审查 P2）')
const noevPage = await getJson(`${PREFIX}/api/chart?business=${PROBE_BIZ}&chart=${PROBE2_CHART}&v=current`)
expect('缺 evidence.json 的图照常出页面，并带上当时那份内容的摘要',
  [noevPage.status, typeof noevPage.body.currentFingerprint], [200, 'string'])
writeFileSync(path.join(REPO, PROBE2_DIR, 'evidence.json'), '', 'utf8')
await execFileAsync('git', ['-C', REPO, 'add', PROBE2_DIR], { encoding: 'utf8' })
await execFileAsync('git', ['-C', REPO, 'commit', '-m', '补一个空的 evidence.json'], { encoding: 'utf8' })
const noevCheck = await check(PROBE_BIZ, PROBE2_CHART)
expect('缺文件与空文件是两份不同的内容（新摘要 ≠ 页面上的旧摘要，且等于独立重算）',
  [noevCheck.body.fingerprint === noevPage.body.currentFingerprint, noevCheck.body.fingerprint === await fpAt(noevCheck.body.head, PROBE2_DIR)],
  [false, true])
const noevStale = await postSave({
  business: PROBE_BIZ, chart: PROBE2_CHART, name: '按页面上的旧摘要存', stage: 'design',
  head: noevCheck.body.head, fingerprint: noevPage.body.currentFingerprint,
})
expect('按页面上那份（缺文件的）摘要保存被拒', [noevStale.status, noevStale.body.code], [409, 'content-updated'])
expect('被拒之后这张图一个版本都没有', await tagCount(PROBE2_CHART), 0)

log('\n### 4.6 失败语义（每种失败之后版本数数得清）')
const cases = [
  ['正文非 JSON', await postRaw('这不是 JSON'), [400, 'bad-request']],
  ['JSON 但不是对象', await postRaw('"x"'), [400, 'bad-request']],
  ['空名称', await postSave({ business: BIZ, chart: CHART, name: '   ', stage: 'design', head: afterCommit.body.head, fingerprint: afterCommit.body.fingerprint }), [400, 'bad-request']],
  ['坏阶段', await postSave({ business: BIZ, chart: CHART, name: 'x', stage: '草稿', head: afterCommit.body.head, fingerprint: afterCommit.body.fingerprint }), [400, 'bad-request']],
  ['未知图', await postSave({ business: BIZ, chart: 'no-such-chart', name: 'x', stage: 'design', head: afterCommit.body.head, fingerprint: afterCommit.body.fingerprint }), [404, 'not-found']],
  ['缺 chart', await postSave({ business: BIZ, name: 'x', stage: 'design', head: afterCommit.body.head, fingerprint: afterCommit.body.fingerprint }), [400, 'bad-request']],
  ['脏图（未提交）', await postSave({ business: DIRTY_BIZ, chart: DIRTY_CHART, name: 'x', stage: 'design', head: dirty.body.head, fingerprint: dirty.body.fingerprint }), [409, 'uncommitted-changes']],
]
for (const [label, got, wanted] of cases) expect(`${label} → ${wanted[0]} ${wanted[1]}`, [got.status, got.body?.code], wanted)
expect('这一轮失败后该图版本数仍 1', await versionCount(BIZ, CHART), 1)
expect('脏图版本数没变（生成器给的 1）', await versionCount(DIRTY_BIZ, DIRTY_CHART), 1)

const put = await fetch(`${origin}${PREFIX}/api/snapshots`, { method: 'PUT' })
expect('PUT 405 且说明两个 POST 例外', [put.status, (await put.json()).error.includes('POST /api/snapshots')], [405, true])
const missing = await getJson(`${PREFIX}/api/snapshots`)
expect('GET 缺参数 400', [missing.status, missing.body.code], [400, 'bad-request'])
const badId = await getJson(`${PREFIX}/api/snapshots?business=${BIZ}&chart=..%2Fx`)
expect('GET 非法图编号 400', [badId.status, badId.body.code], [400, 'bad-request'])
const evidence = await fetch(`${origin}${PREFIX}/api/evidence`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{"refs":[]}' })
expect('旧接口 POST /api/evidence 未被守卫误伤', [evidence.status, (await evidence.json()).missing], [200, false])
const pageRes = await fetch(`${origin}${PREFIX}/read/${BIZ}/${CHART}`)
expect('阅读页照旧可服务（前缀路由没被改动影响）', [pageRes.status, pageRes.headers.get('content-type')], [200, 'text/html; charset=utf-8'])

log('\n### 4.7 保存弹层的两条状态规则（直接 import 页面加载的那个模块跑断言，审查 P1/P2）')
// ① 页面正展示内容的摘要：只有"加载并展示了内容"才登记。拿它去自查时，后台改过的内容一律被拦。
rememberShown({ currentFingerprint: 'A'.repeat(64) })
expect('展示的内容摘要被记下', shownFingerprint(), 'A'.repeat(64))
rememberShown({ currentFingerprint: null })
expect('v 不是 current（拿不到摘要）时记作空', shownFingerprint(), null)
rememberShown({ currentFingerprint: 'A'.repeat(64) })
const printA = 'A'.repeat(64)
expect('请求没回来：不放行，说没能检查', saveGate(printA, { failed: 'Failed to fetch' }).state, 'check-failed')
expect('仓库没配：不放行，如实说明', saveGate(printA, { code: 'repo-not-configured', error: '这个仓库还没配置' }).state, 'no-repo')
const gateDirty = saveGate(printA, { ok: false, problems: ['workflow.json 有未提交的修改'] })
expect('还有没提交的改动：不放行，并列出问题',
  [gateDirty.state, gateDirty.text, gateDirty.problems], ['uncommitted', '请先提交，再保存版本：', ['workflow.json 有未提交的修改']])
expect('摘要取不出来：不放行，说无法自查', saveGate(null, { ok: true, head: 'h'.repeat(40), fingerprint: printA }).state, 'unknown')
const gateStale = saveGate(printA, { ok: true, head: 'h'.repeat(40), fingerprint: 'B'.repeat(64) })
expect('后台内容与页面展示的不一致：拦下并提示刷新',
  [gateStale.state, gateStale.text.includes('内容已更新，请刷新后确认')], ['stale', true])
const gateOk = saveGate(printA, { ok: true, head: 'abcdef1234'.repeat(4), fingerprint: printA })
expect('一致：放行，并说明存的是哪次提交', [gateOk.state, gateOk.text.includes('abcdef12')], ['ok', true])

// ② 一次保存请求的结果：ok 只认"状态成功 + 正文完整"，缺一不可（审查 P2）
const unverifiedBody = { code: 'save-created-unverified', error: '版本 specdev/x/20260101-000000 已经写上去了，但读回核对没做完：git 超时。请刷新页面看版本列表确认。' }
const outcomeCases = [
  ['请求没有回应', { responded: false, ok: false, status: 0, body: null }, 'unknown'],
  ['状态成功但正文读不出来', { responded: true, ok: true, status: 200, body: null }, 'unknown'],
  ['状态成功但正文缺 snapshot', { responded: true, ok: true, status: 200, body: { alreadySaved: false } }, 'unknown'],
  ['状态成功但 snapshot 里没有名字', { responded: true, ok: true, status: 200, body: { snapshot: { meta: {} } } }, 'unknown'],
  ['服务端明确拒绝', { responded: true, ok: false, status: 409, body: { code: 'uncommitted-changes', error: '还有没提交的改动' } }, 'rejected'],
  ['版本已写上、只是没核完', { responded: true, ok: false, status: 500, body: unverifiedBody }, 'created-unverified'],
  ['存下了', { responded: true, ok: true, status: 200, body: { alreadySaved: false, snapshot: { tag: 't', meta: { name: '首版设计' } } } }, 'created'],
  ['早就存过', { responded: true, ok: true, status: 200, body: { alreadySaved: true, snapshot: { tag: 't', meta: { name: '首版设计' } } } }, 'already'],
]
for (const [label, input, kind] of outcomeCases) expect(`${label} → ${kind}`, saveOutcome(input).kind, kind)
const unverified = saveOutcome({ responded: true, ok: false, status: 500, body: unverifiedBody })
expect('"已写上、没核完"不许说成没能保存（并带上版本名）',
  [unverified.text.includes('没能保存'), unverified.text.includes('specdev/x/20260101-000000'), unverified.text.includes('不要急着重存')],
  [false, true, true])
expect('真没存上才说没能保存',
  saveOutcome({ responded: true, ok: false, status: 409, body: { error: '还有没提交的改动' } }).text, '没能保存：还有没提交的改动')
expect('成功的结果带回版本名（状态条要说"已保存「…」"）',
  saveOutcome({ responded: true, ok: true, status: 200, body: { alreadySaved: false, snapshot: { tag: 't', meta: { name: '首版设计' } } } }).label, '首版设计')

log('\n### 4.8 页面接线形状（读真实服务出来的 HTML/JS 原文；观感与手感以浏览器实际页面为准）')
const readHtml = await (await fetch(`${origin}${PREFIX}/read/${BIZ}/${CHART}`)).text()
const readJs = await (await fetch(`${origin}${PREFIX}/assets/read.js`)).text()
const resultJs = await (await fetch(`${origin}${PREFIX}/assets/save-result.js`)).text()
expect('页面加载的规则模块能取到（取不到，保存弹层整块失灵）',
  [resultJs.includes('export function saveGate'), resultJs.includes('export function saveOutcome')], [true, true])
expect('阅读页含保存弹层与三处关闭控件、名称/阶段/说明字段', [
  readHtml.includes('id="saveDialog"'), readHtml.includes('id="saveClose"'),
  readHtml.includes('id="saveCancel"'), readHtml.includes('id="saveName"'),
  readHtml.includes('name="saveStage"'), readHtml.includes('id="saveNote"'),
], Array(6).fill(true))
expect('脚本接线齐全（先问检查、POST、失败说清楚、原地刷新）', [
  readJs.includes('/api/snapshots?business='), readJs.includes("'/specdev-workbench/api/snapshots'"),
  readJs.includes("method: 'POST'"), readJs.includes('这一版已经保存过'),
  readJs.includes('已保存，请刷新查看'), readJs.includes('renderVersions(data)'),
  readJs.includes('renderStatus(data'), readJs.includes('图名与摘要取自当前说明文件'),
  readJs.includes('设计版'), readJs.includes('实现版'),
], Array(10).fill(true))
// 页面正展示内容的摘要只在一处登记（加载内容时），刷新版本条不碰它——
// 否则屏幕上还是旧图、过期检查却按新内容放行，就会存下没展示过的内容（审查 P1）
const refreshBody = readJs.slice(readJs.indexOf('async function refreshBar'), readJs.indexOf('async function refreshAfterSave'))
expect('刷新版本条不碰"页面正展示内容的摘要"',
  [refreshBody.includes('rememberShown'), refreshBody.includes('shownFingerprint'), refreshBody.includes('currentFingerprint')],
  [false, false, false])
expect('登记展示摘要只在加载内容时一处', (readJs.match(/rememberShown\(/g) || []).length, 1)
expect('提交时送的是展示摘要，不是版本条刷新过的新数据',
  [readJs.includes('fingerprint: shownFingerprint()'), readJs.includes('fingerprint: pageState.data.currentFingerprint')], [true, false])
// 「保存版本」入口只在"正看当前"的分支里创建（看历史快照时不该出现）
// 锚点用分支里的注释原文（// 开头），避免命中函数上方文档注释里的同一个词
const currentBranch = readJs.indexOf("if (v === 'current')")
const saveEntry = readJs.indexOf('save-open')
const historyBranch = readJs.indexOf('// 正在看历史时')
expect('保存入口只挂在"当前"分支内', [currentBranch > 0, saveEntry > currentBranch, historyBranch > saveEntry], [true, true, true])
// 连点只存一次：禁用按钮的语句在发出请求之前
expect('点保存就先禁用（防连点）', readJs.indexOf('button.disabled = true') < readJs.indexOf("method: 'POST'"), true)

log('\n### 4.9 卸载清理')
disposer()
const afterDispose = await getJson(`${PREFIX}/api/snapshots?business=${BIZ}&chart=${CHART}`)
expect('清理后前缀不再被接管（路由已移除）', [afterDispose.status, afterDispose.body], [404, 'not handled'])
await server.closeAllConnections()
await new Promise((resolve) => server.close(resolve))

// ── ⑤ 回执 ───────────────────────────────────────────────────────────────────
log(`\n## ⑤ 结果：通过 ${passed} / 失败 ${failures}（共 ${passed + failures} 项断言）`)
log(`回执：${writeReceipt()}`)
process.exit(failures ? 1 : 0)

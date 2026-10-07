// 内部Node接口：官方原件在独立子进程运行，业务仓只读；无路由、HTML执行或浏览器桥接。
import { createHash } from 'node:crypto'
import { readFile, realpath, mkdtemp, writeFile, rm, lstat } from 'node:fs/promises'
import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { assertRepoTopLevel, originalGitEnvironment } from './git.ts'
import { CoreError } from './errors.ts'
import { captureArchifyEvidence } from './archify-evidence.ts'
import type { ArchifyEvidenceContext, RepositoryContract } from './archify-evidence.ts'
import { lifecycleProblems } from './lifecycle.ts'

export interface ArchifyRenderInput {
  readonly repoRoot: string
  readonly graphId: string
  readonly candidateText: string
  readonly version: '3.0.1'
}
/** 宿主提供已存在的任务临时根；禁止在业务仓内写临时文件。 */
export interface ArchifyRenderOptions { readonly tempRoot: string; readonly timeoutMs?: number }
export type ArchifyRenderResult =
  | ({ readonly ok: true; readonly html: string; readonly version: '3.0.1'; readonly graphId: string; readonly candidateSha256: string; readonly diagnostics: string } & ArchifyEvidenceContext)
  | { readonly ok: false; readonly code: string; readonly error: string; readonly diagnostics: string }
const MANIFEST_SHA = '1a521634a75f021ed89497725e61d55edefd98711ef9c3a08aabe9a75ba91cb3'
const MAX_CANDIDATE_BYTES = 2 * 1024 * 1024
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024
const sha = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex')
const contained = (root: string, file: string) => {
  const rel = path.relative(root, file)
  return !path.isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + path.sep)
}

function vendorRoot(): string {
  // 源码直接调用与dist单档均按本模块实际位置定位，无cwd/实验/上游副本兜底。
  const source = import.meta.url.endsWith('/src/core/archify-render.ts')
  return fileURLToPath(new URL(source ? '../../vendor/archify-3.0.1/' : '../vendor/archify-3.0.1/', import.meta.url))
}
async function checkedVendor(): Promise<string> {
  const requested = vendorRoot()
  const packageRoot = await realpath(path.resolve(requested, '../..'))
  const root = await realpath(requested)
  if (root !== path.join(packageRoot, 'vendor', 'archify-3.0.1')) throw Error('官方资源根必须位于当前包内，不能链接到外部上游')
  const bytes = await readFile(path.join(root, 'manifest.json'))
  if (sha(bytes) !== MANIFEST_SHA) throw Error('官方固定闭包清单摘要不符')
  const manifest = JSON.parse(bytes.toString())
  for (const entry of manifest.files) {
    const file = await realpath(path.join(root, entry.path))
    if (!contained(root, file) || sha(await readFile(file)) !== entry.sha256) throw Error('官方资源缺失或摘要不符：' + entry.path)
  }
  return root
}

async function executeOfficial(entry: string, input: string, output: string, cwd: string, env: NodeJS.ProcessEnv, timeoutMs: number) {
  return new Promise<{ code: number | null; stdout: string; stderr: string; stopped: string | null; stopConfirmed: boolean }>((resolve, reject) => {
    const child = spawn(process.execPath, [entry, input, output], { cwd, env, shell: false, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] })
    const stdout: Buffer[] = [], stderr: Buffer[] = []
    let bytes = 0, stopped: string | null = null, stopping: Promise<void> | undefined, stopConfirmed = true, stopDiagnostic = ''
    const stop = (reason: string) => {
      if (stopped) return
      stopped = reason
      stopping = (async () => {
        if (!child.pid) return
        if (process.platform === 'win32') {
          try { await promisify(execFile)('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, timeout: 5000, encoding: 'buffer' }) }
          catch (error) {
            const failure = error as Error & { code?: unknown; stdout?: Buffer; stderr?: Buffer }
            const decoder = new TextDecoder('gbk')
            const report = decoder.decode(failure.stdout ?? Buffer.alloc(0)) + decoder.decode(failure.stderr ?? Buffer.alloc(0))
            stopDiagnostic = `进程树终止工具返回${String(failure.code)}：${report}`
            // 固定闭包只有同步等待的Git子程序，禁用远程品牌后没有其他子程序来源。
            // 正常退出0/1发生在终止工具启动期间时，其Git调用已全部收尾，允许清理。
            // 活进程或原生异常退出仍不能用单进程kill冒称树已停止。
            const targets = new Set<number>([child.pid])
            // taskkill的每行首个PID是这次操作的目标；括号里的祖先PID不是终止目标。
            // 工具可在树内部分进程先退出时返回128，仍须逐个确认所报告目标已不存在。
            for (const line of report.split(/\r?\n/)) {
              const match = /\bPID\s+(\d+)/i.exec(line)
              if (match) targets.add(Number(match[1]))
            }
            stopConfirmed = [...targets].every(pid => {
              try { process.kill(pid, 0); return false }
              catch (probe) { return (probe as NodeJS.ErrnoException).code === 'ESRCH' }
            })
            if (!stopConfirmed && (child.exitCode === 0 || child.exitCode === 1) && targets.size === 1) stopConfirmed = true
            if (!stopConfirmed && child.exitCode === null) child.kill()
          }
        } else {
          try { process.kill(-child.pid, 'SIGKILL') } catch { child.kill('SIGKILL') }
        }
      })()
    }
    const timer = setTimeout(() => stop('render-timeout'), timeoutMs)
    const collect = (chunks: Buffer[]) => (data: Buffer) => {
      bytes += data.length
      if (bytes > MAX_OUTPUT_BYTES) stop('render-output-limit')
      else chunks.push(data)
    }
    child.stdout.on('data', collect(stdout))
    child.stderr.on('data', collect(stderr))
    child.on('error', error => { clearTimeout(timer); reject(error) })
    child.on('close', async (code, signal) => {
      clearTimeout(timer)
      await stopping
      resolve({ code, stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8') + stopDiagnostic, stopConfirmed, stopped: stopped ?? (signal || (code !== null && code > 255) ? 'render-native-abnormal' : null) })
    })
  })
}

export async function renderArchify(input: ArchifyRenderInput, options: ArchifyRenderOptions): Promise<ArchifyRenderResult> {
  let owned: string | undefined, tempRoot: string | undefined, cleanupSafe = true
  // 先登记宿主给定路径；realpath失败也必须脱敏，不能等读取成功后才加入。
  const redactions: string[] = [input.repoRoot, options.tempRoot].filter(p => typeof p === 'string' && p.length > 0)
  const clean = (text: string) => redactions.reduce((value, p) => value.split(p).join('[内部路径]').split(p.replaceAll('\\', '/')).join('[内部路径]').split(p.replaceAll('\\', '\\\\')).join('[内部路径]'), text)
  const fail = (code: string, error: string, diagnostics = ''): ArchifyRenderResult => ({ ok: false, code, error: clean(error), diagnostics: clean(diagnostics) })
  try {
    redactions.push(path.resolve(input.repoRoot), path.resolve(options.tempRoot), vendorRoot())
    if (input.version !== '3.0.1') return fail('unsupported-version', '本接口只支持固定3.0.1')
    if (!input.graphId || typeof input.graphId !== 'string' || /[\u0000-\u001f]/.test(input.graphId)) return fail('invalid-input', '图身份无效')
    if (typeof input.candidateText !== 'string' || Buffer.byteLength(input.candidateText) > MAX_CANDIDATE_BYTES) return fail('invalid-input', 'candidate文本超过上限或类型无效')
    const candidate = JSON.parse(input.candidateText)
    if (!candidate || !['workflow', 'sequence', 'lifecycle'].includes(candidate.diagram_type)) return fail('unsupported-type', '内部渲染仅支持workflow/sequence/lifecycle')
    if (candidate.diagram_type === 'lifecycle' && lifecycleProblems(candidate).length) return fail('invalid-lifecycle', lifecycleProblems(candidate).map(item => item.message).join('；'))
    if (!candidate.meta || typeof candidate.meta !== 'object' || Array.isArray(candidate.meta)) return fail('invalid-input', 'candidate缺少meta对象')
    // 原数据不改；输出路径仅在内存副本统一为安全虚构值，实际输出由参数数组限定。
    candidate.meta.output = 'render.html'
    const entities = candidate[candidate.diagram_type === 'workflow' ? 'nodes' : candidate.diagram_type === 'lifecycle' ? 'states' : 'participants']
    if (Array.isArray(entities) && entities.some(entity => entity?.brand && typeof entity.brand === 'object')) return fail('remote-brand-not-supported', '本单不抓取远程品牌图标；需后续明确联网边界')
    const repoRoot = await realpath(input.repoRoot)
    redactions.push(repoRoot, input.repoRoot)
    try { await assertRepoTopLevel(repoRoot, { originalObjects: true }) }
    catch (error) {
      if (error instanceof CoreError && error.code === 'repo-not-top-level') throw Error('受控repoRoot必须是Git仓库顶层；不自动改绑外层仓库')
      throw error
    }
    tempRoot = await realpath(options.tempRoot)
    redactions.push(tempRoot)
    if (contained(repoRoot, tempRoot)) return fail('invalid-temp-root', '任务临时根必须在业务仓之外')
    const vendor = await checkedVendor()
    redactions.push(vendor)
    const timeout = options.timeoutMs ?? 30000
    if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 60000) return fail('invalid-timeout', '渲染超时须为1–60000毫秒')
    owned = await mkdtemp(path.join(tempRoot, 'archify-'))
    redactions.push(owned)
    const inputFile = path.join(owned, 'candidate.json'), output = path.join(owned, 'render.html')
    await writeFile(inputFile, JSON.stringify(candidate), { flag: 'wx' })
    const env = originalGitEnvironment()
    for (const key of Object.keys(env)) if (/^(ARCHIFY_|NODE_OPTIONS$|NODE_PATH$)/i.test(key)) delete env[key]
    env.ARCHIFY_REPO_ROOT = repoRoot
    env.ARCHIFY_DIAGNOSTIC_FORMAT = 'json'
    const entry = path.join(vendor, `archify/renderers/${candidate.diagram_type}/render-${candidate.diagram_type}.mjs`)
    const result = await executeOfficial(entry, inputFile, output, owned, env, timeout)
    if (!result.stopConfirmed) {
      cleanupSafe = false
      return fail('render-stop-unconfirmed', '子进程树终止未确认，已保留本次临时目录；须停对应操作核实，不自动重试', result.stderr)
    }
    if (result.stopped) return fail(result.stopped, '官方子程序已停止；未自动重试', result.stderr)
    if (result.code !== 0) return fail('official-rejected', `官方3.0.1拒绝渲染（退出${result.code}）`, result.stderr)
    const info = await lstat(output)
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > MAX_OUTPUT_BYTES || await realpath(output) !== output) return fail('invalid-output', '官方产物必须是独占临时目录内的有界普通HTML')
    const html = await readFile(output, 'utf8')
    const contract = await import(pathToFileURL(path.join(vendor, 'archify/renderers/shared/repository-location.mjs')).href) as RepositoryContract
    const context = await captureArchifyEvidence(repoRoot, input.graphId, candidate, contract)
    return Object.freeze({ ok: true, html, version: '3.0.1', graphId: input.graphId, candidateSha256: sha(input.candidateText), diagnostics: clean(result.stderr), ...context })
  } catch (error) {
    return fail('render-failed', error instanceof Error ? error.message : String(error))
  } finally {
    if (cleanupSafe && owned && tempRoot && contained(tempRoot, owned) && path.dirname(owned) === tempRoot && path.basename(owned).startsWith('archify-')) await rm(owned, { recursive: true, force: true })
  }
}

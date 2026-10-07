// git 封装：全异步（D1 要求，禁 execSync/execFileSync/spawnSync）、每次调用带超时、
// 单文件读取带大小上限（超限明确报错，不截断、不静默）。只在工作目录与引用前缀范围内操作。
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, stat } from 'node:fs/promises'
import { realpathSync } from 'node:fs'
import path from 'node:path'
import { CoreError } from './errors.ts'

const execFileAsync = promisify(execFile)

/** 单次 git 调用超时（毫秒）。超时明确报错，不悬挂事件循环。 */
export const GIT_TIMEOUT_MS = 10_000
/** 单文件读取上限（字节）。工作区读取与 git 对象读取共用。 */
export const MAX_FILE_BYTES = 2 * 1024 * 1024
/** execFile 缓冲上限：略高于文件上限，让"超限"错误由本模块的精确检查给出。 */
const EXEC_MAX_BUFFER = MAX_FILE_BYTES * 2

/** 运行一次 git 命令（-C repoRoot），成功返回 stdout（utf8 文本）。 */
/** 新版固定证据调用局部禁replacement、lazy fetch及外部Git环境覆盖；旧调用语义不变。 */
export interface GitReadOptions { readonly originalObjects?: boolean }

export function originalGitEnvironment(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  for (const key of Object.keys(env)) if (/^GIT_/i.test(key)) delete env[key]
  env.GIT_NO_REPLACE_OBJECTS = '1'
  env.GIT_NO_LAZY_FETCH = '1'
  env.GIT_OPTIONAL_LOCKS = '0'
  return env
}

export async function runGit(repoRoot: string, args: readonly string[], options: GitReadOptions = {}): Promise<string> {
  let caught: unknown
  try {
    const { stdout } = await execFileAsync('git', [...(options.originalObjects ? ['--no-replace-objects', '--no-lazy-fetch', '--no-optional-locks'] : []), '-C', repoRoot, ...args], {
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: EXEC_MAX_BUFFER,
      encoding: 'utf8',
      windowsHide: true,
      ...(options.originalObjects ? { env: originalGitEnvironment() } : {}),
    })
    return stdout
  } catch (error) {
    caught = error
  }
  // 统一映射为 CoreError：无法执行 / 超时 / 缓冲超限 / 普通 git 失败，message 可直接上页面。
  const err = caught as NodeJS.ErrnoException & { killed?: boolean; signal?: string; stderr?: string }
  if (err.code === 'ENOENT') {
    throw new CoreError('git-unavailable', '无法启动 git：未找到可执行文件（请确认已安装 git 且在 PATH 中）', 500)
  }
  if (err.killed || err.signal === 'SIGTERM') {
    throw new CoreError('git-timeout', `git ${args[0]} 超过 ${GIT_TIMEOUT_MS / 1000} 秒未返回，已中止`, 504)
  }
  const rawText = String(err.stderr || err.message || '')
  // 目录不是 Git 仓库是独立状态（第 2 步定稿四状态之一），不能混进普通 git 失败里
  if (/not a git repository/i.test(rawText)) {
    throw new CoreError(
      'not-a-git-repo',
      `这个目录不是可用的 Git 仓库：${repoRoot}（历史版本与快照信息存放在 Git 里，需要是 Git 仓库才能管理）`,
      422,
    )
  }
  const firstLine = rawText.split('\n')[0].trim()
  throw new CoreError('git-failed', `git ${args[0]} 失败：${firstLine || '未知错误'}`)
}

function isHex40(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{40}$/.test(value)
}

/**
 * 仓库根可用性预检（第 2 步状态区分）：目录不存在/不是目录/读不了分别给明确错误，
 * 不让这几种情况糊成后面的"没有流程图资料"。只 stat 一次，不读内容。
 */
export async function assertRepoUsable(repoRoot: string): Promise<void> {
  let info: Awaited<ReturnType<typeof stat>>
  try {
    info = await stat(repoRoot)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      throw new CoreError('repo-unavailable', `目录不存在或已被移动：${repoRoot}`, 404)
    }
    throw new CoreError('repo-unavailable', `目录无法读取（${code ?? String(error)}）：${repoRoot}`, 403)
  }
  if (!info.isDirectory()) {
    throw new CoreError('repo-unavailable', `路径不是一个目录：${repoRoot}`, 404)
  }
}

/** 两个路径是否指同一个真实位置：先取 realpath 再归一分隔符；Windows 忽略大小写。 */
function sameRealPath(a: string, b: string): boolean {
  const norm = (p: string) => {
    let resolved: string
    try {
      resolved = realpathSync(p)
    } catch {
      resolved = p
    }
    const unified = path.resolve(resolved)
    return process.platform === 'win32' ? unified.toLowerCase() : unified
  }
  return norm(a) === norm(b)
}

/**
 * 工作区目录必须是 Git 仓库顶层：目录在某个外层仓库里但
 * 自己不是顶层时，`git -C` 会向上找到父仓——标签清单与历史文件都会混入父项目
 * （页头是子项目、历史图来自父项目），且 `git show <commit>:<路径>` 按父仓根解析。
 * 这里明确拒绝并说明原因，不自动改绑父仓；仓库内多项目支持以后单独设计。
 * 只用于工作区绑定（自动绑定必须防）；手动模式（用户自己填 repoRoot）不经过本检查。
 * 非 Git 目录在此同样报 not-a-git-repo（rev-parse 的 stderr 走 runGit 统一映射）。
 */
export async function assertRepoTopLevel(repoRoot: string, options: GitReadOptions = {}): Promise<void> {
  const output = (await runGit(repoRoot, ['rev-parse', '--show-toplevel'], options)).trim()
  if (!output) {
    throw new CoreError('not-a-git-repo', `无法确定 ${repoRoot} 的 Git 仓库顶层`, 422)
  }
  if (!sameRealPath(output, repoRoot)) {
    throw new CoreError(
      'repo-not-top-level',
      `这个目录不是 Git 仓库的顶层：${repoRoot} 属于外层仓库 ${output}。历史版本会与外层仓库混在一起，管理页不会自动改绑；请把仓库顶层（${output}）登记为工作区。`,
      422,
    )
  }
}

/**
 * 读取某提交上的文件内容；确认不存在返回 null。
 * 存在性用 ls-tree 判断（评审 #3）：找不到路径时 git 正常退出且输出为空——只有这种
 * "确认不存在"才返回 null；超时/git 失败/git 不可执行由 runGit 抛出并继续传递，
 * 不再被吞成"不存在"。行格式 "<mode> <type> <sha>\t<path>"，type 不是 blob
 * （路径上是目录/子模块）也按该文件不存在处理。
 * 大小先用 cat-file -s 探测，超限直接报错（不会把大文件拉进内存）。
 */
export async function gitShowFileOptional(
  repoRoot: string,
  commit: string,
  relPath: string,
  options: GitReadOptions = {},
): Promise<string | null> {
  if (!isHex40(commit)) {
    // 内部约定：本模块只按已剥壳的 40 位提交号读对象，防止把任意 refspec 透传进 git。
    throw new CoreError('bad-request', `内部错误：gitShowFileOptional 只接受 40 位提交号，收到 ${commit}`, 400)
  }
  const spec = `${commit}:${relPath}`
  const entry = (await runGit(repoRoot, ['ls-tree', commit, '--', relPath], options)).trim()
  if (entry === '') return null
  const objectType = entry.split('\t')[0].split(' ')[1]
  if (objectType !== 'blob') return null
  const sizeText = await runGit(repoRoot, ['cat-file', '-s', spec], options)
  const size = Number(sizeText.trim())
  if (!Number.isFinite(size) || size < 0) {
    throw new CoreError('git-failed', `无法确定 ${relPath} 在提交 ${commit.slice(0, 8)} 上的大小`)
  }
  if (size > MAX_FILE_BYTES) {
    throw new CoreError(
      'file-too-large',
      `文件 ${relPath} 在提交 ${commit.slice(0, 8)} 上为 ${size} 字节，超过读取上限 ${MAX_FILE_BYTES} 字节`,
      413,
    )
  }
  return runGit(repoRoot, ['show', spec], options)
}

/** 解析一个提交号：验证 40 位且能在本仓库解析为提交对象；失败抛明确错误。 */
export async function resolveCommit(repoRoot: string, commit: string, options: GitReadOptions = {}): Promise<string> {
  if (!isHex40(commit)) {
    throw new CoreError('bad-request', `提交号必须是 40 位十六进制，收到：${commit}`, 400)
  }
  let out: string | null = null
  try {
    out = await runGit(repoRoot, ['rev-parse', '--verify', `${commit}^{commit}`], options)
  } catch (error) {
    // 只有 git 明确拒绝该对象才按"确认不存在"处理（实测 stderr 首行
    // 为 "fatal: Needed a single revision"〔对象不存在〕或 "error: … expected commit type …"
    // 〔对象存在但剥不到提交〕两种措辞）；超时、git 不可执行与其余 git 失败继续传递，不误报 not-found。
    const confirmedAbsent =
      error instanceof CoreError &&
      error.code === 'git-failed' &&
      ['Needed a single revision', 'expected commit type'].some((hint) => error.message.includes(hint))
    if (!confirmedAbsent) throw error
  }
  const resolved = out?.trim()
  if (!isHex40(resolved)) {
    throw new CoreError('not-found', `提交 ${commit} 无法在本仓库解析`, 404)
  }
  return resolved
}

/** stat 失败里属于"确认不存在"的错误码（其余如权限失败按评审 #3 继续传递，不吞成不存在）。 */
function statConfirmedAbsent(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException)?.code
  return code === 'ENOENT' || code === 'ENOTDIR'
}

function fsFailed(relPath: string, error: unknown): CoreError {
  const code = (error as NodeJS.ErrnoException)?.code
  return new CoreError('fs-failed', `访问 ${relPath} 失败（${code ?? String(error)}）`, 500)
}

/** 工作区路径是否是一个存在的目录（只 stat，不递归、不读内容）。 */
export async function worktreeDirExists(repoRoot: string, relPath: string): Promise<boolean> {
  const normalized = relPath.split('/').filter((part) => part !== '' && part !== '.')
  if (normalized.some((part) => part === '..') || path.isAbsolute(relPath)) {
    throw new CoreError('bad-request', `非法路径：${relPath}`, 400)
  }
  const full = path.resolve(repoRoot, ...normalized)
  try {
    return (await stat(full)).isDirectory()
  } catch (error) {
    if (statConfirmedAbsent(error)) return false
    throw fsFailed(relPath, error)
  }
}

/** 工作区文件是否存在（只 stat，不读内容）。 */
export async function worktreeFileExists(repoRoot: string, relPath: string): Promise<boolean> {
  const normalized = relPath.split('/').filter((part) => part !== '' && part !== '.')
  if (normalized.some((part) => part === '..') || path.isAbsolute(relPath)) {
    throw new CoreError('bad-request', `非法路径：${relPath}`, 400)
  }
  const full = path.resolve(repoRoot, ...normalized)
  try {
    return (await stat(full)).isFile()
  } catch (error) {
    if (statConfirmedAbsent(error)) return false
    throw fsFailed(relPath, error)
  }
}

/** 读取工作区文件内容；不存在返回 null。带路径防逃逸与大小上限。 */
export async function readWorktreeFileOptional(repoRoot: string, relPath: string): Promise<string | null> {
  const normalized = relPath.split('/').filter((part) => part !== '' && part !== '.')
  if (normalized.some((part) => part === '..') || path.isAbsolute(relPath)) {
    throw new CoreError('bad-request', `非法路径：${relPath}`, 400)
  }
  const full = path.resolve(repoRoot, ...normalized)
  const root = path.resolve(repoRoot)
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new CoreError('bad-request', `路径越出仓库根：${relPath}`, 400)
  }
  let size: number
  try {
    size = (await stat(full)).size
  } catch (error) {
    if (statConfirmedAbsent(error)) return null
    throw fsFailed(relPath, error)
  }
  if (size > MAX_FILE_BYTES) {
    throw new CoreError(
      'file-too-large',
      `文件 ${relPath} 为 ${size} 字节，超过读取上限 ${MAX_FILE_BYTES} 字节`,
      413,
    )
  }
  return readFile(full, 'utf8')
}

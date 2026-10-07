import { rendererOverride } from '../core/chart-renderer.ts'
// DSH 接入层（D1 三块结构的第二块）：把 src/core 的管理逻辑挂到 DSH 的 webServer 上。
// 只依赖注入的 ctx.webServer 服务，不 import 其他 DSH 内部模块。
// 装载双路径：开发态 --patch 直指本 .ts（tsx，探针已验证）；正式包指构建产物 dist/index.js。
import { existsSync, readFileSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { createArchifyReader } from '../core/archify-reader.ts'
import {createRoomExportRequests} from './room-export.ts'
import {
  CoreError,
  MAX_FILE_BYTES,
  assertRepoTopLevel,
  assertRepoUsable,
  readInventory,
  readChartPage,
  readWorktreeFileOptional,
  loadEvidence,
  checkChartCommitted,
  saveChartSnapshot,
  readBuildingBinding,
  presentBuilding,
  readRoomLayout,
} from '../core/index.ts'

export const name = 'specdev-workbench'
// skills＝DSH 技能注册表（dsh-skill）、fs＝文件后端（dsh-fs-sandbox，读不受沙箱限制）、
// connection＝宿主认证（dsh-client-connection 的 requestRejection：Host/Origin 栅栏＋会话 cookie），
// 都是 dsh 基座必挂服务，与 webServer 同源，按必填注入——装载时即保证自查可用。
// 若未来出现"有 webServer 无这几项"的组合，装载会等不到服务——那是部署面变化，届时再议。
export const inject = ['webServer', 'connection', 'skills', 'fs']

interface ManageConfig {
  repoRoot?: string
}

/** 从当前文件向上找最近的 package.json 所在目录：开发态=specdev-workbench/，安装态=包根。 */
function findPackageRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url))
  while (true) {
    if (existsSync(path.join(dir, 'package.json'))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) throw new Error('找不到包根（package.json）')
    dir = parent
  }
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8',
}

function sendJson(res: import('node:http').ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(text),
  })
  res.end(text)
}

function sendError(res: import('node:http').ServerResponse, error: unknown): void {
  if (error instanceof CoreError) {
    sendJson(res, error.httpStatus, { code: error.code, error: error.message })
    return
  }
  sendJson(res, 500, { code: 'internal', error: error instanceof Error ? error.message : String(error) })
}

/** POST 正文最长接收时间：拖住不发完的连接到点回 408 并断开，不留挂起连接。 */
const BODY_TIMEOUT_MS = 10_000

/**
 * 收 POST 正文为文本。按实际收到的字节数查上限（与文件读取同一个 MAX_FILE_BYTES）：
 * 超限或超时只回复一次，响应写完就断开未完成的上传；写不完时最多再等一秒。
 * 正常收完返回正文；拒收或客户端断开返回 null，调用方不再答复。
 */
async function readRequestText(
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse,
  maxBytes = MAX_FILE_BYTES,
): Promise<string | null> {
  return await new Promise((resolve) => {
    const chunks: Buffer[] = []
    let received = 0
    let settled = false
    const finish = (value: string | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      chunks.length = 0
      req.off('data', onData)
      req.off('end', onEnd)
      req.off('aborted', onAborted)
      res.off('close', onResponseClose)
      resolve(value)
    }

    const rejectBody = (error: CoreError) => {
      if (settled) return
      // 先结算并取消正文定时器，413 之后不再有机会发送 408。
      finish(null)
      req.pause()
      const disconnect = () => {
        clearTimeout(closeTimer)
        res.off('finish', disconnect)
        res.off('close', disconnect)
        req.destroy()
      }
      const closeTimer = setTimeout(disconnect, 1_000)
      closeTimer.unref?.()
      // 先注册再发送，既尽量送达错误响应，也不无限等待对方接收。
      res.once('finish', disconnect)
      res.once('close', disconnect)
      if (!res.headersSent && !res.destroyed) {
        res.setHeader('Connection', 'close')
        sendError(res, error)
      } else {
        disconnect()
      }
    }
    const onData = (chunk: Buffer) => {
      received += chunk.length
      if (received > maxBytes) {
        rejectBody(new CoreError('request-too-large', `请求正文超过读取上限 ${maxBytes} 字节，已停止接收`, 413))
        return
      }
      chunks.push(chunk)
    }
    const onEnd = () => finish(Buffer.concat(chunks).toString('utf8'))
    const onAborted = () => finish(null)
    const onError = () => finish(null)
    const onResponseClose = () => {
      finish(null)
      if (!req.complete) req.destroy()
    }
    const onRequestClose = () => {
      finish(null)
      // destroy/aborted 后仍可能发出 error，保留处理器到 close 再清理。
      req.off('error', onError)
    }
    const timer = setTimeout(() => rejectBody(new CoreError(
      'request-timeout', `请求正文超过 ${BODY_TIMEOUT_MS / 1000} 秒没有收完，已断开`, 408,
    )), BODY_TIMEOUT_MS)
    timer.unref?.()
    req.on('data', onData)
    req.once('end', onEnd)
    req.once('aborted', onAborted)
    req.on('error', onError)
    req.once('close', onRequestClose)
    res.once('close', onResponseClose)
  })
}

/** repoRoot 未配置时的统一响应：插件正常加载，页面据此渲染可复制的配置指引。 */
function repoNotConfigured(res: import('node:http').ServerResponse): void {
  sendJson(res, 400, {
    code: 'repo-not-configured',
    error: '尚未配置业务项目目录（repoRoot）。插件本身已正常加载；请按下面的示例在 profile 配置里指定后重启 DSH。',
    guide: {
      where: '$DSH_HOME/profiles/<profile名>/cordis.patch.yml（profile 自己的配置层，按 id 覆盖本插件的行）',
      // 勿写 - insert：insert 是新增条目，会与本包自带条目撞 id（duplicate loader entry）启动失败；
      // 同 id 不带 insert 才是覆盖。
      example: [
        "- id: specdev-workbench",
        "  config:",
        "    repoRoot: 'D:/你的/业务项目仓库'",
      ].join('\n'),
      takesEffect: '保存配置后重启 DSH 生效（配置在启动时组合，改配置文件不会热生效）。',
    },
  })
}

/** 服务一个静态文件（限制在 base 目录内、带大小上限）；不存在返回 false 由调用方决定回退。 */
async function serveFile(
  res: import('node:http').ServerResponse,
  base: string,
  rel: string,
): Promise<boolean> {
  const parts = rel.split('/').filter((p) => p !== '' && p !== '.')
  if (parts.length === 0 || parts.some((p) => p === '..')) return false
  const full = path.resolve(base, ...parts)
  const root = path.resolve(base)
  if (!full.startsWith(root + path.sep)) return false
  let size: number
  try {
    size = (await stat(full)).size
  } catch {
    return false
  }
  if (size > MAX_FILE_BYTES) {
    sendError(res, new CoreError('file-too-large', `静态资源 ${rel} 为 ${size} 字节，超过读取上限 ${MAX_FILE_BYTES} 字节`, 413))
    return true
  }
  const body = await readFile(full)
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(full).toLowerCase()] ?? 'application/octet-stream',
    'Cache-Control': 'no-store',
    'Content-Length': body.length,
  })
  res.end(body)
  return true
}

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

function requireId(res: import('node:http').ServerResponse, value: string | null, what: string): string | null {
  if (value === null || !ID_PATTERN.test(value)) {
    sendError(res, new CoreError('bad-request', `参数 ${what} 不合法：${value ?? '(缺失)'}`, 400))
    return null
  }
  return value
}

// ── 工作区绑定（第二期第 2 步）──────────────────────────────
// 链接带 ?workspace=<工作区标识> 时按该工作区的目录读写；不带时用配置的 repoRoot（手动模式，老用法原样兼容）。
// 注册表按请求软探测（服务异步激活，装载时点可能缺席）。

/**
 * connection 服务的结构类型（只声明认证门用到的 requestRejection；不 import DSH 内部模块，
 * 与本文件既有约定一致）。返回值：undefined＝放行，401＝未认证，403＝Host/Origin 栅栏拒绝。
 */
interface ConnectionLike {
  requestRejection: (request: unknown) => number | undefined
}

/**
 * workspaceRegistry 服务里用到的形状（只声明 get/list；不 import DSH 内部模块，与本文件既有约定一致）。
 * list 同步返回工作区实体数组。
 */
interface WorkspaceRegistryLike {
  get: (id: string) => { readonly title?: unknown; readonly path?: unknown } | undefined
  list: () => Array<{ readonly id?: unknown; readonly title?: unknown; readonly path?: unknown }>
}

/** 一次请求绑定的业务目录：root 供读写；info 供页面头部展示与辨认（工作区名/路径或手动配置）。 */
export interface RepoBinding {
  root: string
  info: { mode: 'workspace' | 'manual'; title: string; path: string; workspaceId: string }
}

/**
 * 按请求参数解析业务目录。纯函数（不碰 fs/git；目录本身的可用性由调用方随后 assertRepoUsable 预检）。
 * 解析失败返回带稳定 code 的 CoreError，由调用方按 code 决定怎么回（repo-not-configured 有专门的配置指引）。
 */
export function resolveRepoBinding(params: {
  workspaceParam: string | null
  manualRepoRoot: string
  registry: WorkspaceRegistryLike | undefined
}): RepoBinding | { error: CoreError } {
  const manual = params.manualRepoRoot.trim()
  if (params.workspaceParam === null) {
    if (!manual) {
      return { error: new CoreError('repo-not-configured', '尚未配置业务项目目录（repoRoot），链接里也没有工作区标识。', 400) }
    }
    return { root: manual, info: { mode: 'manual', title: '手动配置', path: manual, workspaceId: '' } }
  }
  if (!ID_PATTERN.test(params.workspaceParam)) {
    return { error: new CoreError('bad-request', `工作区标识不合法：${params.workspaceParam}`, 400) }
  }
  if (params.registry === undefined) {
    return {
      error: new CoreError(
        'workspace-service-unavailable',
        '当前 DSH 没有提供工作区服务（可能是 DSH 版本变化）。请从 DSH 的工作区重新进入；或改用手动配置模式：在插件配置里填 repoRoot，并去掉链接里的 workspace 参数。',
        503,
      ),
    }
  }
  const workspace = params.registry.get(params.workspaceParam)
  if (workspace === undefined) {
    return {
      error: new CoreError(
        'workspace-not-found',
        `工作区不存在或已失效（${params.workspaceParam}）。可能该工作区已被删除，或这个链接来自另一个 DSH 实例；请从 DSH 的工作区重新进入。`,
        404,
      ),
    }
  }
  const root = typeof workspace.path === 'string' ? workspace.path.trim() : ''
  if (!root) {
    return { error: new CoreError('workspace-not-found', `工作区 ${params.workspaceParam} 没有可用的目录路径。`, 500) }
  }
  const title = typeof workspace.title === 'string' && workspace.title.trim() ? workspace.title.trim() : '(未命名工作区)'
  return { root, info: { mode: 'workspace', title, path: root, workspaceId: params.workspaceParam } }
}

/**
 * 列出 DSH 工作区（第 4 步·入口 B）：侧栏按钮点开后取这份清单供挑选，每项带
 * id（进链接）、title（显示）、path（辨认同名工作区）。纯函数，不碰 fs/git。
 * 注册表缺席（版本漂移）返回稳定错误码，由按钮就地说明并保留"直接打开管理页"兜底。
 */
export function listWorkspaces(
  registry: WorkspaceRegistryLike | undefined,
): { workspaces: Array<{ id: string; title: string; path: string }> } | { error: CoreError } {
  if (registry === undefined) {
    return {
      error: new CoreError(
        'workspace-service-unavailable',
        '当前 DSH 没有提供工作区服务（可能是 DSH 版本变化），列不出工作区清单。',
        503,
      ),
    }
  }
  const workspaces: Array<{ id: string; title: string; path: string }> = []
  for (const workspace of registry.list()) {
    const id = typeof workspace.id === 'string' ? workspace.id : ''
    // 没有可用编号的工作区进不了链接，跳过该项，不中断整个清单。
    if (!ID_PATTERN.test(id)) continue
    workspaces.push({
      id,
      title: typeof workspace.title === 'string' && workspace.title.trim() ? workspace.title.trim() : '(未命名工作区)',
      path: typeof workspace.path === 'string' ? workspace.path : '',
    })
  }
  return { workspaces }
}

// ── 随包技能注册（1d 方案 A）──────────────────────────────────
// DSH 的技能扫描根不含插件安装目录（发行版 dsh-skill-filesystem roots()），
// 设计路径是 deployment 插件向注册表全局层注册（dsh-web-app 补丁注释）。
// 这里按 dsh-skill-badge 同款范式（inject skills + ctx.skills.register）接通。

/** dsh-skill 注册表的结构类型（只声明用到的方法；不 import DSH 内部模块，与本文件既有约定一致）。 */
interface SkillRegistryLike {
  register: (skill: {
    name: string
    description: string
    content: string
    source: string
    resourceBase?: { kind: 'directory'; path: string }
  }) => unknown
  list: (options?: Record<string, unknown>) => Promise<Array<{ name: string }>>
  get: (name: string, options?: Record<string, unknown>) => Promise<{ name: string; content: string } | undefined>
}

/**
 * 随包技能清单（`skills/<dir>/`）：插件安装目录不在 DSH 的技能扫描根里，靠运行时注册挂进全局层。
 * `sample` 是各自的自查参考文件——三份技能的资源布局不同，读不到就说明该技能的参考文件没进包。
 */
export const BUNDLED_SKILLS = [
  { dir: 'specdev-business', sample: 'references/specification.md' },
  { dir: 'specdev-building', sample: 'references/blueprint-contract.md' },
  { dir: 'specdev-room', sample: 'references/room-contract.md' },
] as const

/** fs 后端的结构类型：模型读取工具背后的服务（fs 沙箱只圈写，读不受限）。readText 吃 resolve 的返回对象。 */
interface FsBackendLike {
  resolve: (path: string, options?: Record<string, unknown>) => Promise<{ targetKey: string; displayPath: string }>
  readText: (target: { targetKey: string; displayPath: string }, signal?: unknown) => Promise<string>
}

/**
 * 解析 SKILL.md：frontmatter 只取 name 与 description 两键，正文原样返回；不合式返回 null。
 * 换行按 LF 解析、容忍 CRLF；正文不做任何改写。
 */
export function parseSkillFrontmatter(raw: string): { name: string; description: string; content: string } | null {
  const text = raw.startsWith('﻿') ? raw.slice(1) : raw
  if (!text.startsWith('---\n') && !text.startsWith('---\r\n')) return null
  const end = text.indexOf('\n---', 4)
  if (end < 0) return null
  let body = text.slice(end + 4)
  if (body.startsWith('\r')) body = body.slice(1)
  if (body.startsWith('\n')) body = body.slice(1)
  if (!body.trim()) return null
  let parsedName = ''
  let description = ''
  for (const line of text.slice(4, end).split('\n')) {
    // 捕获组排除行终结符（CRLF 行尾的 \r 不被 . 匹配），取值再 trim 掉两端空白。
    const matched = /^([A-Za-z][A-Za-z0-9_-]*):[ \t]?([^\r\n]*)/.exec(line)
    if (!matched) continue
    if (matched[1] === 'name') parsedName = matched[2].trim()
    else if (matched[1] === 'description') description = matched[2].trim()
  }
  if (!parsedName || !description) return null
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(parsedName)) return null
  return { name: parsedName, description, content: body }
}

/**
 * 注册后自查：走模型侧同款 ctx.skills.list()/get() 与 ctx.fs.readText()，
 * 就地取证"能发现、能加载正文、能读参考文件"；结果只落日志，不抛出。
 * get() 内部会跑 validateDefinition——漏 source 之类的注册缺陷在这里现形（评审第 1 条）。
 */
async function selfCheckSkill(
  ctx: { skills?: SkillRegistryLike; fs?: FsBackendLike },
  expected: { name: string; content: string },
  skillDir: string,
  sampleRel: string,
  log: (message: string) => void,
): Promise<void> {
  const registry = ctx.skills
  if (!registry) return
  const listed = (await registry.list()).some((skill) => skill.name === expected.name)
  const definition = await registry.get(expected.name)
  let sample: string | undefined
  let sampleWhy = ''
  if (ctx.fs === undefined) sampleWhy = 'ctx.fs 不可用'
  else {
    try {
      // 与模型读取工具同链路：先 resolve 成 target 对象，再 readText（直接传字符串会因缺 targetKey 报错）。
      const target = await ctx.fs.resolve(path.join(skillDir, sampleRel))
      sample = await ctx.fs.readText(target)
    } catch (error) {
      sampleWhy = String(error)
    }
  }
  const contentOk = definition !== undefined && definition.content === expected.content
  const sampleNote = sample === undefined ? `未通过（${sampleWhy}）` : `${sample.length} 字`
  log(
    `技能自查（${expected.name}）：list ${listed ? '已见' : '未见'}；`
    + `get 正文 ${definition === undefined ? '未取到' : `${definition.content.length} 字${contentOk ? '（与 SKILL.md 一致）' : '（与 SKILL.md 不一致）'}`}；`
    + `fs 读 ${sampleRel} ${sampleNote}`,
  )
  if (!listed || !contentOk || sample === undefined) {
    log(`技能自查存在未过项（${expected.name}）：list=${listed} 正文=${contentOk} 参考文件=${sample !== undefined}`)
  }
}

/**
 * 把随包技能注册进 DSH 技能注册表。成功返回 true；任何失败只记日志、不抛——
 * 注册是管理页之外的附加能力，不能拖垮主功能。resourceBase 只是指给模型的路径提示，
 * 参考文件由模型用自身读取工具按需读取（fs 沙箱不限制读）。
 */
export function registerBundledSkill(
  ctx: { skills?: SkillRegistryLike; fs?: FsBackendLike },
  skillDir: string,
  sampleRel: string,
  log: (message: string) => void,
): boolean {
  let raw: string
  try {
    raw = readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8')
  } catch (error) {
    log(`随包技能注册失败：读不到 ${path.join(skillDir, 'SKILL.md')}（${String(error)}）`)
    return false
  }
  const parsed = parseSkillFrontmatter(raw)
  if (!parsed) {
    log('随包技能注册失败：SKILL.md frontmatter 不合式（需 --- 包裹的 name 与 description，name 须小写中划线）')
    return false
  }
  if (!ctx.skills) {
    log(`随包技能注册跳过：ctx.skills 服务不可用（已解析 ${parsed.name}）`)
    return false
  }
  // 注册接口会同步抛（重名、定义校验不过等）：按**单份**技能兜住，一份失败不作废其余技能，
  // 也不让异常穿出 apply——否则调用方（apply 的循环、插件装载）会跟着断。
  try {
    const accepted = ctx.skills.register({
      name: parsed.name,
      description: parsed.description,
      content: parsed.content,
      // source 必填：register() 只代补 invocation/provider，加载侧 validateDefinition 校验 source 必须是字符串。
      source: 'runtime',
      resourceBase: { kind: 'directory', path: skillDir },
    })
    // 注册表契约是同步的；万一宿主返回 Promise，拒绝也要记账，不能变成未处理拒绝。
    if (accepted !== null && typeof accepted === 'object' && typeof (accepted as PromiseLike<unknown>).then === 'function') {
      void Promise.resolve(accepted).catch((error) => {
        log(`随包技能 ${parsed.name} 注册失败：${String(error)}`)
      })
    }
  } catch (error) {
    log(`随包技能 ${parsed.name} 注册失败：${String(error)}`)
    return false
  }
  log(`技能 ${parsed.name} 已注册（source=runtime，resourceBase=${skillDir}）`)
  void selfCheckSkill(ctx, parsed, skillDir, sampleRel, log).catch((error) => {
    log(`技能 ${parsed.name} 自查失败：${String(error)}`)
  })
  return true
}

export function apply(
  ctx: {
    webServer: { register: (route: unknown) => () => void }
    effect: (disposer: () => void, label?: string) => unknown
    get: (name: string) => unknown
    connection: ConnectionLike
    skills?: SkillRegistryLike
    fs?: FsBackendLike
  },
  config: ManageConfig,
): void {
  // 启动观测（验收后可降噪）：装载路径、repoRoot 是否进来了、路由是否注册成功。
  // 第二期起 repoRoot 只是"手动模式"兜底：带工作区标识的链接按请求查注册表，不在装载时定死。
  console.error(`[specdev-workbench] apply 运行：repoRoot=${JSON.stringify(config?.repoRoot ?? '(缺省)')}（手动模式兜底；带 workspace 的链接按请求解析）`)
  const manualRepoRoot = typeof config?.repoRoot === 'string' ? config.repoRoot.trim() : ''
  const packageRoot = findPackageRoot()
  const webRoot = path.join(packageRoot, 'web')
  const vendorRoot = path.join(packageRoot, 'vendor', 'archify-renderer')
  const reader = createArchifyReader({ renderer: async (input, options) => {
    const sourceMode = import.meta.url.endsWith('/src/dsh/index.ts')
    const entry = path.join(packageRoot, sourceMode ? 'src/core/archify-render.ts' : 'dist/archify-node.js')
    console.error(`[specdev-workbench] 新版Node渲染入口：${entry}`)
    const module = await import(pathToFileURL(entry).href)
    return module.renderArchify(input, options)
  } })
  const routeContext: RouteContext = {
    exports: createRoomExportRequests(),
    connection: ctx.connection,
    manualRepoRoot,
    webRoot,
    vendorRoot,
    workspaceRegistry: () => ctx.get('workspaceRegistry') as WorkspaceRegistryLike | undefined,
    reader,
  }

  // N2b：只注册统一的新 URL 前缀，宿主按精确前缀边界分派。
  const dispose = ctx.webServer.register({
    kind: 'prefix',
    path: '/specdev-workbench',
    async handler(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) {
      try {
        // 认证门在一切业务处理之前；拒绝时响应已写完，直接返回。
        if (!authorizeRequest(ctx.connection, req, res)) return
        await handle(req, res, routeContext)
      } catch (error) {
        if (!res.headersSent && /^\/specdev-workbench\/api\/room-export(?:-catalog)?(?:\?|$)/.test(req.url??'')) sendJson(res,error instanceof CoreError?error.httpStatus:500,{code:error instanceof CoreError?error.code:'export-request',error:'导出请求无法处理，请核对当前项目、业务和资料'})
        else if (!res.headersSent) sendError(res, error)
        else res.end()
      }
    },
  })
  console.error('[specdev-workbench] /specdev-workbench 前缀路由已注册（入口统一认证，fail-closed）')
  // effect 的回调在加载时执行、其返回值才是卸载时的清理函数——返回 dispose 本身，不要当场调用。
  ctx.effect(() => () => { dispose(); void reader.dispose(); routeContext.exports.dispose() }, '流程图管理路由清理')

  // 随包技能注册（1d 方案 A）：安装目录不在 DSH 技能扫描根里，靠运行时注册把随包技能
  // （specdev-business 业务设计与维护、specdev-building 建筑布置、specdev-room 独立房间布置）挂进注册表全局层；注册后各自自查取证
  // （发现／正文／该技能自己的参考文件），日志与上面两行同风格。
  const log = (message: string) => console.error(`[specdev-workbench] ${message}`)
  for (const skill of BUNDLED_SKILLS) {
    registerBundledSkill(ctx, path.join(packageRoot, 'skills', skill.dir), skill.sample, log)
  }
}

interface RouteContext {
  exports: ReturnType<typeof createRoomExportRequests>
  connection: ConnectionLike
  reader: ReturnType<typeof createArchifyReader>
  /** 手动模式兜底目录（配置的 repoRoot）；带 workspace 标识的请求不用它。 */
  manualRepoRoot: string
  webRoot: string
  vendorRoot: string
  /** 每次请求时软探测工作区注册表（服务异步激活，装载时点可能缺席，不能点查一次了事）。 */
  workspaceRegistry: () => WorkspaceRegistryLike | undefined
}

/**
 * 认证门：整个 /specdev-workbench 前缀在所有业务处理
 * 之前统一过宿主 connection.requestRejection——先 Host/Origin 栅栏（403，防 DNS rebinding
 * 与跨站请求），再验宿主签名的会话 cookie（401）。判定与宿主自己的 RPC 通道同款
 * （deepseek-harness packages/client/connection/src/rpc-host.ts 的通道路由）。
 * fail-closed：connection 缺席、方法形状不对、调用抛错或返回意外值时一律
 * 拒绝（503），绝不放行。通过返回 true；拒绝时已写完响应，调用方直接返回。
 * 响应格式：API 路径回稳定 code 的 JSON 错误体，页面路径回中文纯文本。
 */
export function authorizeRequest(
  connection: unknown,
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse,
): boolean {
  let rejection: unknown = 503
  if (connection !== null && typeof connection === 'object'
    && typeof (connection as ConnectionLike).requestRejection === 'function') {
    try {
      rejection = (connection as ConnectionLike).requestRejection(req)
    } catch {
      rejection = 503
    }
  }
  if (rejection === undefined) return true
  // 只认宿主约定的 401/403；其他任何返回值（含字符串、5xx）按服务异常兜底拒绝。
  const status = rejection === 401 || rejection === 403 ? rejection : 503
  // API/页面与 handle 的分段口径一致（pathname 第二段是否为 api；不去 query、不解码）。
  const isApi = (req.url ?? '').split('?')[0].split('/').filter((s) => s !== '')[1] === 'api'
  if (isApi) {
    const body = status === 401
      ? { code: 'unauthorized', error: '未登录或会话已过期：请先打开 DSH 启动地址完成登录，再使用流程图管理。' }
      : status === 403
        ? { code: 'forbidden', error: '请求来源不被信任（Host/Origin 校验未通过），已拒绝访问。' }
        : { code: 'auth-unavailable', error: '认证服务不可用，已拒绝访问（fail-closed，不放行）。' }
    sendJson(res, status, body)
    return false
  }
  const text = status === 401
    ? '请先通过 DSH 启动地址登录\n'
    : status === 403
      ? '请求来源不被信任（Host/Origin 校验未通过），已拒绝访问。\n'
      : '认证服务不可用，已拒绝访问。\n'
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(text)
  return false
}

async function handle(
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse,
  ctx: RouteContext,
): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1')
  const segments = url.pathname.split('/').filter((s) => s !== '') // ['specdev-workbench', ...]
  // 接口以只读为主（GET/HEAD）；以下四项POST例外：
  //   /api/evidence —— 正文提交第一次响应（/api/chart）里的证据清单原文，消除"页面两次请求
  //     之间文件被保存，图与证据来自两个版本"的错配；只解析、不写任何文件。
  //   /api/snapshots —— 保存版本：本插件唯一的写操作，只给确认过的那次提交打一个附注标签，
  //     工作区文件、分支与提交一概不动。
  //   /api/reader-render 与 /api/reader-release —— 冻结渲染与内存上下文释放，不写业务仓。
  const apiPost =
    req.method === 'POST' && segments.length === 3 && segments[1] === 'api'
    && ['evidence', 'snapshots', 'reader-render', 'reader-release', 'room-export'].includes(segments[2])
  if (req.method !== 'GET' && req.method !== 'HEAD' && !apiPost) {
    sendError(res, new CoreError('bad-request', '接口只读；仅允许既有保存/证据及新版渲染/释放POST', 405))
    return
  }

  // 页面
  if (segments.length === 1) {
    if (await serveFile(res, ctx.webRoot, 'index.html')) return
  } else if (segments.length === 2 && segments[1] === 'workspaces') {
    // 独立项目选择页不先绑定仓库，沿用入口认证与 GET/HEAD 守卫。
    if (await serveFile(res, ctx.webRoot, 'workspaces.html')) return
  } else if (segments.length === 2 && segments[1] === 'business') {
    if (await serveFile(res, ctx.webRoot, 'business.html')) return
  } else if (segments.length === 3 && segments[1] === 'business' && ID_PATTERN.test(segments[2])) {
    if (await serveFile(res, ctx.webRoot, 'business.html')) return
  } else if (segments.length === 2 && segments[1] === 'showcase') {
    // 项目级业务展示页：列表／星图／球阵三格式，页面自己读 inventory 装配。
    if (await serveFile(res, ctx.webRoot, 'showcase.html')) return
  } else if (segments.length === 2 && segments[1] === 'building') {
    // 建筑总览页：Three.js 消费 /api/building 的模型与建造表现（几何全在服务端算好）。
    if (await serveFile(res, ctx.webRoot, 'building.html')) return
  } else if (segments.length >= 3 && segments[1] === 'read') {
    if (await serveFile(res, ctx.webRoot, 'read.html')) return
  } else if (segments.length === 3 && segments[1] === 'room' && ID_PATTERN.test(segments[2])) {
    // 独立业务房间页（P1b-2）：/specdev-workbench/room/<合法业务ID> 由本前缀统一认证；
    // 页面自己调 /api/room 取配置，本路由只发页面文件。非法 ID 不命中，落 404。
    if (await serveFile(res, ctx.webRoot, 'room.html')) return
  } else if (segments.length === 2 && segments[1] === 'furniture') {
    // 家具图鉴页（E9b）：随包共用家具库的看图挑选页，只读静态资源（catalog 与缩略图走
    // 下方 assets 分支），不按业务过滤、不请求 inventory 或 /api/room；仍经本前缀统一
    // 认证与方法守卫。额外子路径不命中，落 404。
    if (await serveFile(res, ctx.webRoot, 'furniture.html')) return
  }

  // 静态资产：页面自身资源与 vendor 渲染器副本
  if (segments[1] === 'assets' && segments.length > 2) {
    if (await serveFile(res, path.join(ctx.webRoot, 'assets'), segments.slice(2).join('/'))) return
  }
  if (segments[1] === 'vendor' && segments.length > 2) {
    if (await serveFile(res, ctx.vendorRoot, segments.slice(2).join('/'))) return
  }

  // API（同源；GET/HEAD 只读，四个 POST 例外见上方 apiPost）
  if (segments[1] === 'api') {
    await handleApi(req, url, res, ctx)
    return
  }

  sendError(res, new CoreError('not-found', `路径不存在：${url.pathname}`, 404))
}

async function handleApi(
  req: import('node:http').IncomingMessage,
  url: URL,
  res: import('node:http').ServerResponse,
  ctx: RouteContext,
): Promise<void> {
  const api = url.pathname.split('/').filter((s) => s !== '')[2] // /specdev-workbench/api/<name>
  const q = url.searchParams

  // 工作区清单（第 4 步·入口 B）：侧栏按钮点开后供挑选工作区，不绑定任何业务目录，
  // 先于仓库绑定解析——repoRoot 没配置也要能列出（免配置正是本轮目标）。
  if (api === 'workspaces') {
    const listed = listWorkspaces(ctx.workspaceRegistry())
    if ('error' in listed) return sendError(res, listed.error)
    sendJson(res, 200, listed)
    return
  }

  // 仓库绑定统一在入口解析（第 2 步）：带 workspace 标识 → 该工作区的目录；不带 → 手动配置。
  // 之后各接口用 root 读写；inventory/chart 的响应附 repo 块供页面头部展示与辨认。
  const binding = resolveRepoBinding({
    workspaceParam: q.get('workspace'),
    manualRepoRoot: ctx.manualRepoRoot,
    registry: ctx.workspaceRegistry(),
  })
  if ('error' in binding) {
    if (binding.error.code === 'repo-not-configured') return repoNotConfigured(res)
    return sendError(res, binding.error)
  }
  await assertRepoUsable(binding.root)
  // 工作区绑定的目录还必须是 Git 仓库顶层：子目录会静默继承父仓的
  // 标签与历史文件，明确拒绝并说明；手动模式是用户自己填的路径，保持既有行为不拦。
  if (binding.info.mode === 'workspace') await assertRepoTopLevel(binding.root)
  const root = binding.root

  if(['room-export-catalog','room-export'].includes(api)){
    if(req.method!==(api==='room-export'?'POST':'GET'))return sendError(res,new CoreError('bad-request','导出接口方法不符',405))
    for(const key of q.keys())if(!['workspace','business'].includes(key)||q.getAll(key).length!==1)return sendError(res,new CoreError('bad-request','导出接口含未知或重复参数',400))
    const business=requireId(res,q.get('business'),'business');if(!business)return
    if(api==='room-export-catalog'){try{sendJson(res,200,await ctx.exports.catalog(root,business))}catch{sendJson(res,422,{code:'export-catalog',error:'资料选择目录读取失败，请检查当前业务登记'})}return}
    const text=await readRequestText(req,res,96*1024);if(text===null)return
    let body:unknown;try{body=JSON.parse(text)}catch{return sendError(res,new CoreError('bad-request','导出请求须为JSON对象',400))}
    await ctx.exports.generate(req,res,root,business,body,()=>{
      try{if(ctx.connection.requestRejection(req)!==undefined)return false;const current=resolveRepoBinding({workspaceParam:q.get('workspace'),manualRepoRoot:ctx.manualRepoRoot,registry:ctx.workspaceRegistry()});return !('error'in current)&&current.root===root}catch{return false}
    });return
  }

  if (['reader-render', 'reader-evidence', 'reader-release'].includes(api)) {
    const requiredMethod = api === 'reader-evidence' ? 'GET' : 'POST'
    if (req.method !== requiredMethod) return sendError(res, new CoreError('bad-request', '新版接口方法不符', 405))
    const allowed = new Set(['workspace', 'business', 'chart', 'v', ...(api === 'reader-evidence' ? ['context', 'ref'] : [])])
    for (const key of q.keys()) if (!allowed.has(key) || q.getAll(key).length !== 1) return sendError(res, new CoreError('bad-request', '新版请求含未知或重复参数', 400))
    const business = requireId(res, q.get('business'), 'business'), chart = requireId(res, q.get('chart'), 'chart')
    if (!business || !chart) return
    // 宿主仅公开认证判定，无principal API；绑定已通过宿主验证的整份Cookie指纹，不记录原值。
    if (!req.headers.cookie) return sendError(res, new CoreError('auth-identity-unavailable', '认证会话身份不可用', 503))
    const owner = { auth: createHash('sha256').update(req.headers.cookie).digest('hex'), workspace: q.get('workspace') ?? 'manual', repoRoot: root, business, chart, v: q.get('v') || 'current' }
    if (api === 'reader-evidence') {
      sendJson(res, 200, await ctx.reader.read(owner, q.get('context') ?? '', q.get('ref') ?? ''))
      return
    }
    const text = await readRequestText(req, res, 1024)
    if (text === null) return
    if (Buffer.byteLength(text) > 1024) return sendError(res, new CoreError('bad-request', '新版请求正文过大', 413))
    let body: any
    try { body = JSON.parse(text) } catch { return sendError(res, new CoreError('bad-request', '新版请求正文须为JSON对象', 400)) }
    const keys = api === 'reader-render' ? ['requestId'] : ['requestId', 'contextId']
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !keys.includes(k)) || typeof body.requestId !== 'string' || (body.contextId !== undefined && typeof body.contextId !== 'string')) return sendError(res, new CoreError('bad-request', '新版请求仅允许会话身份字段', 400))
    if (api === 'reader-release') { sendJson(res, 200, await ctx.reader.release(owner, body.requestId, body.contextId)); return }
    const data = await ctx.reader.render(owner, body.requestId, () => !res.destroyed)
    if (res.destroyed) { await ctx.reader.release(owner, body.requestId, data.contextId); return }
    let delivered = false
    res.once('finish', () => { delivered = true })
    res.once('close', () => { if (!delivered) void ctx.reader.release(owner, body.requestId, data.contextId).catch(() => {}) })
    sendJson(res, 200, { ...data, repo: binding.info })
    return
  }

  try {
    await dispatchApi(api, req, q, res, { root, repo: binding.info })
  } catch (error) {
    if (error instanceof CoreError) {
      // 出错响应也带工作区信息：空状态/错误页要能显示"工作区：名称（路径）"，
      // 打开两个空项目时靠它区分标签页。参数拼写类 400 在 dispatchApi 内已自行回复，不走这里。
      sendJson(res, error.httpStatus, { code: error.code, error: error.message, repo: binding.info })
      return
    }
    throw error
  }
}

interface ApiContext {
  root: string
  repo: RepoBinding['info']
}

async function dispatchApi(
  api: string,
  req: import('node:http').IncomingMessage,
  q: URLSearchParams,
  res: import('node:http').ServerResponse,
  ctx: ApiContext,
): Promise<void> {
  const root = ctx.root

  if (api === 'inventory') {
    sendJson(res, 200, { ...(await readInventory(root)), repo: ctx.repo })
    return
  }

  if (api === 'building') {
    // 建筑蓝图绑定核对与模型生成：清单是内容依据、蓝图是空间安排。
    // 核对结果（含问题清单）是有效响应回 200；清单/蓝图读不了才走 CoreError。
    // view=frame|preview 时附建造表现（parts/colliders/surfaces）：frame 按当前建造阶段
    // 给设计框架，preview 给完整外观预览——两者的区别在 presentBuilding，页面不重复实现。
    const binding = await readBuildingBinding(root)
    const view = q.get('view')
    let present: ReturnType<typeof presentBuilding> | undefined
    if (binding.ok && binding.model && (view === 'frame' || view === 'preview')) {
      present = presentBuilding(binding.model, { preview: view === 'preview' })
    }
    sendJson(res, 200, { ...binding, repo: ctx.repo, ...(present !== undefined ? { present } : {}) })
    return
  }

  if (api === 'room') {
    // 独立业务房间的配置读取（P1b-1）：配置固定在该业务约定目录下的 room.json，
    // business 必填；workspace 缺省、认证与方法守卫沿用本入口既有行为。
    // 200 只表示配置已读取且归属/顶层结构有效——家具布置是否可渲染由页面把 layout
    // 交给 rooms/placement.js 校验（先校验再渲染）；本接口不返回 ok:true、不伪造装配结果。
    const business = requireId(res, q.get('business'), 'business')
    if (!business) return
    sendJson(res, 200, { ...(await readRoomLayout(root, business)), repo: ctx.repo })
    return
  }

  if (api === 'chart') {
    const business = requireId(res, q.get('business'), 'business')
    if (!business) return
    const chart = requireId(res, q.get('chart'), 'chart')
    if (!chart) return
    const v = q.get('v') || 'current'
    const override = rendererOverride(q.getAll('renderer'))
    const page = await readChartPage(root, business, chart, v)
    const authoredRenderer = page.renderer
    if (page.diagramType === 'lifecycle' && override === 'legacy') throw new CoreError('unsupported-type', '生命周期图只支持3.0.1阅读；请移除legacy兼容参数', 422)
    if (override) page.renderer = override
    sendJson(res, 200, { ...page, authoredRenderer, repo: ctx.repo })
    return
  }

  if (api === 'evidence') {
    // POST：正文是第一次响应（/api/chart）里那份 evidence.json 的原文。只按提交来的正文
    // 解析与切片，不读磁盘上的当前文件——两次请求之间文件被保存也不会图与证据错配；
    // 缺失（第一次拿到 null）与读不开（evidenceError）由页面就地说明，本接口不存在回退路径。
    if (req.method === 'POST') {
      const text = await readRequestText(req, res)
      if (text === null) return // 正文超限/超时，已回过 413/408
      sendJson(res, 200, await loadEvidence(root, text))
      return
    }
    // GET：脚本与既有用法原样保留（自己重读所选版本的文件）
    const business = requireId(res, q.get('business'), 'business')
    if (!business) return
    const chart = requireId(res, q.get('chart'), 'chart')
    if (!chart) return
    const v = q.get('v') || 'current'
    const page = await readChartPage(root, business, chart, v)
    // evidence.json 本身读不开（如超过大小上限）：如实走文件级错误通道，不误报"没有证据文件"
    if (page.version.evidenceError) {
      sendJson(res, 200, { missing: false, parseError: page.version.evidenceError, refs: [] })
      return
    }
    const evidence = await loadEvidence(root, page.version.files.evidence)
    sendJson(res, 200, evidence)
    return
  }

  if (api === 'snapshots') {
    if (req.method === 'POST') {
      // 保存：正文 {business, chart, name, stage, note?, head, fingerprint}。head 与 fingerprint
      // 是弹层打开时检查结果里带回来的——钉住用户确认过的那次提交与那份内容，防"看到的是新图、
      // 存下的是旧图"；正文形状由核心层校验（一律 400），这里只把解析后的正文原样转交。
      const text = await readRequestText(req, res)
      if (text === null) return // 正文超限/超时，已回过 413/408
      let body: unknown
      try {
        body = JSON.parse(text)
      } catch {
        sendError(res, new CoreError('bad-request', '保存请求正文必须是 JSON', 400))
        return
      }
      const fields = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>
      const business = requireId(res, typeof fields.business === 'string' ? fields.business : null, 'business')
      if (!business) return
      const chart = requireId(res, typeof fields.chart === 'string' ? fields.chart : null, 'chart')
      if (!chart) return
      const result = await saveChartSnapshot(root, business, chart, body, {
        expectedHead: typeof fields.head === 'string' ? fields.head : '',
        fingerprint: typeof fields.fingerprint === 'string' ? fields.fingerprint : '',
      })
      sendJson(res, 200, result)
      return
    }
    // GET：保存前检查（head/ok/problems/fingerprint）。页面把服务端摘要与自己正展示内容的
    // 摘要一对就知道自己是不是旧的；POST 时服务端还会再核一次（双保险）。
    const business = requireId(res, q.get('business'), 'business')
    if (!business) return
    const chart = requireId(res, q.get('chart'), 'chart')
    if (!chart) return
    sendJson(res, 200, await checkChartCommitted(root, business, chart))
    return
  }

  if (api === 'doc') {
    const business = requireId(res, q.get('business'), 'business')
    if (!business) return
    const docPath = q.get('path')
    if (!docPath) {
      sendError(res, new CoreError('bad-request', '缺少 path 参数', 400))
      return
    }
    // 只允许读该业务 business.json 里声明过的文档路径（防任意文件读取）。
    const inventory = await readInventory(root)
    const entry = inventory.businesses.find((b) => b.id === business)
    if (!entry || !entry.docs.includes(docPath)) {
      sendError(res, new CoreError('not-found', `文档未在业务 ${business} 的 docs 里声明：${docPath}`, 404))
      return
    }
    const text = await readWorktreeFileOptional(root, docPath)
    if (text === null) {
      sendError(res, new CoreError('not-found', `文档不存在（工作区）：${docPath}`, 404))
      return
    }
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end(text)
    return
  }

  sendError(res, new CoreError('not-found', `接口不存在：${api ?? '(缺失)'}`, 404))
}

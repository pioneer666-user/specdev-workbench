// 本宿主的一小份阅读上下文；无通用队列，繁忙即返回，所有来源来自受控仓。
import { randomBytes } from 'node:crypto'
import { realpath, mkdtemp, rm, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { readChartPage } from './chart.ts'
import { runGit, assertRepoTopLevel } from './git.ts'
import { CoreError } from './errors.ts'
import type { renderArchify, ArchifyRenderResult } from './archify-render.ts'
import type { ChartPageData } from './types.ts'

export interface ReaderOwner { auth: string; workspace: string; repoRoot: string; business: string; chart: string; v: string }
type Stored = { owner: string; requestId: string; expires: number; bytes: number; result: Extract<ArchifyRenderResult, { ok: true }>; page: ChartPageData }
const original = { originalObjects: true } as const
const idOK = (id: string) => typeof id === 'string' && /^[a-zA-Z0-9_-]{16,128}$/.test(id)
export function createArchifyReader(options: { renderer: typeof renderArchify; now?: () => number; ttlMs?: number; maxContexts?: number; maxBytes?: number; readPage?: typeof readChartPage }) {
  const contexts = new Map<string, Stored>(), cancelled = new Map<string, number>()
  const now = options.now ?? Date.now, ttl = options.ttlMs ?? 10 * 60_000
  let active = false, reads = 0, disposed = false, blocked = false, tempRoot: string | null = null
  const reap = () => {
    for (const [id, entry] of contexts) if (entry.expires <= now()) contexts.delete(id)
    for (const [key, expiry] of cancelled) if (expiry <= now()) cancelled.delete(key)
  }
  const timer = setInterval(reap, 30_000); timer.unref()
  const keyOf = async (owner: ReaderOwner) => JSON.stringify([owner.auth, owner.workspace, await realpath(owner.repoRoot), owner.business, owner.chart, owner.v])
  const get = async (owner: ReaderOwner, id: string) => {
    reap(); const entry = contexts.get(id)
    if (disposed || !entry) throw new CoreError('reader-expired', '新版阅读已失效，请重新打开', 410)
    if (entry.owner !== await keyOf(owner)) throw new CoreError('reader-forbidden', '该阅读上下文不属于当前会话或工作区版本', 403)
    return entry
  }
  const cleanTemp = async () => { if (!active && tempRoot && !(await readdir(tempRoot)).length) { const owned = tempRoot; tempRoot = null; await rm(owned, { recursive: true, force: true }) } }
  return {
    async render(owner: ReaderOwner, requestId: string, alive: () => boolean = () => true) {
      if (!idOK(requestId)) throw new CoreError('bad-request', '新版请求身份无效', 400)
      if (disposed) throw new CoreError('reader-expired', '阅读服务已卸载', 410)
      if (blocked) throw new CoreError('reader-blocked', '此前渲染异常，服务已停在保护点；请交维护者核实', 503)
      if (active) throw new CoreError('reader-busy', '新版图正在渲染，请稍后再打开', 429)
      reap()
      if (contexts.size >= (options.maxContexts ?? 4)) throw new CoreError('reader-full', '新版阅读上下文已达上限，请关闭其他新版阅读', 429)
      active = true
      let key = ''
      try {
        key = await keyOf(owner)
        if (cancelled.has(key + requestId)) throw new CoreError('reader-expired', '本次打开已取消', 410)
        await assertRepoTopLevel(owner.repoRoot, original)
        const read = options.readPage ?? readChartPage
        const before = await runGit(owner.repoRoot, ['rev-parse', 'HEAD'], original)
        const page = await read(owner.repoRoot, owner.business, owner.chart, owner.v, original)
        const confirmation = await read(owner.repoRoot, owner.business, owner.chart, owner.v, original)
        if (before !== await runGit(owner.repoRoot, ['rev-parse', 'HEAD'], original) || JSON.stringify(page) !== JSON.stringify(confirmation)) throw new CoreError('content-updated', '图或说明在读取期间发生变化，请刷新后重开', 409)
        if (page.rendererError) throw new CoreError('evidence-unreadable', page.rendererError, 422)
        const type = page.version.diagramType ?? 'workflow'
        const text = type === 'lifecycle' ? page.version.files.lifecycle : page.version.files.workflow
        if (page.version.sourceError || (type === 'workflow' && page.version.workflowError) || !text) throw new CoreError('chart-unavailable', page.version.sourceError ?? page.version.workflowError ?? '本版本没有图', 422)
        let candidate: any
        try { candidate = JSON.parse(text) } catch { throw new CoreError('bad-chart', '所选图源不是合法JSON', 422) }
        if (!['workflow', 'lifecycle'].includes(type) || candidate?.diagram_type !== type) throw new CoreError('unsupported-type', '所选图源与登记类型不一致', 422)
        if (!tempRoot) {
          const base = await realpath(tmpdir()), repo = await realpath(owner.repoRoot), rel = path.relative(repo, base)
          if (!path.isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + path.sep)) throw new CoreError('bad-temp-root', '系统临时区位于业务仓内，拒绝渲染', 503)
          tempRoot = await mkdtemp(path.join(base, 'specdev-reader-'))
        }
        const result = await options.renderer({ repoRoot: owner.repoRoot, graphId: `${owner.business}/${owner.chart}`, candidateText: text, version: '3.0.1' }, { tempRoot })
        if (!result.ok) {
          if (result.code === 'render-stop-unconfirmed' || result.code === 'render-native-abnormal') blocked = true
          throw new CoreError(result.code, `${result.error}${result.diagnostics ? '\n' + result.diagnostics : ''}`, 422)
        }
        if (disposed || !alive() || cancelled.has(key + requestId)) throw new CoreError('reader-expired', '本次打开已取消', 410)
        const bytes = Buffer.byteLength(result.html) + Buffer.byteLength(JSON.stringify(page)) + Buffer.byteLength(JSON.stringify(result.references))
        if ([...contexts.values()].reduce((sum, x) => sum + x.bytes, 0) + bytes > (options.maxBytes ?? 48 * 1024 * 1024)) throw new CoreError('reader-full', '新版阅读缓存体积已达上限', 429)
        const contextId = randomBytes(24).toString('hex'), expires = now() + ttl
        contexts.set(contextId, { owner: key, requestId, expires, bytes, result, page })
        return { ...page, contextId, expires, html: result.html, references: result.references }
      } finally {
        active = false; cancelled.delete(key + requestId)
        // 服务临时根也在每次完成后释放；T17非确认终止时不得递归删除其保留证据。
        await cleanTemp()
      }
    },
    async read(owner: ReaderOwner, contextId: string, refId: string) {
      const entry = await get(owner, contextId)
      if (!entry.result.references.some(ref => ref.id === refId)) throw new CoreError('not-found', '本图未登记该引用', 404)
      if (reads >= 2) throw new CoreError('reader-busy', '源码读取繁忙，请稍后再试', 429)
      reads++
      try { const result = await entry.result.readEvidence(refId); await get(owner, contextId); return result }
      finally { reads-- }
    },
    async release(owner: ReaderOwner, requestId: string, contextId?: string) {
      if (!idOK(requestId)) throw new CoreError('bad-request', '释放身份无效', 400)
      const ownerKey = await keyOf(owner)
      if (contextId) {
        const entry = await get(owner, contextId)
        if (entry.requestId !== requestId) throw new CoreError('reader-forbidden', '请求身份不匹配', 403)
        contexts.delete(contextId)
      } else {
        for (const [id, entry] of contexts) if (entry.owner === ownerKey && entry.requestId === requestId) contexts.delete(id)
      }
      reap()
      if (cancelled.size >= 32) cancelled.delete(cancelled.keys().next().value!)
      cancelled.set(ownerKey + requestId, now() + 60_000)
      return { released: true }
    },
    async dispose() { disposed = true; contexts.clear(); cancelled.clear(); clearInterval(timer); await cleanTemp() },
  }
}

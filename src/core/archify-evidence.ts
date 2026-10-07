// 官方sources只投影一次；闭包持有仓根和不可变引用，读取不再消费candidate或HEAD。
import { createHash } from 'node:crypto'
import { realpath } from 'node:fs/promises'
import { assertRepoTopLevel, runGit } from './git.ts'
import { resolveEvidenceRefs } from './evidence.ts'
import type { EvidenceRefResult } from './types.ts'
import { CoreError } from './errors.ts'

export type ArchifyDiagramType = 'workflow' | 'sequence' | 'lifecycle'
export interface RepositoryLocation { identity: string; url: string; provider: string | null }
export interface RepositoryContract {
  parseRepositoryRemote(value: unknown, options?: { authored?: boolean }): RepositoryLocation | null
  repositorySourceHref(provider: string | null, url: string, revision: string, source: { path: string; line?: number; endLine?: number }): string
}
export interface ArchifyReference {
  readonly id: string
  readonly graphId: string
  readonly diagramType: ArchifyDiagramType
  readonly entityId: string
  readonly sourceIndex: number
  readonly repositoryIdentity: string
  readonly repositoryUrl: string
  readonly commit: string
  readonly path: string
  readonly fromLine: number | null
  readonly toLine: number | null
  readonly label: string
  readonly href: string | null
}
export type ArchifyReadResult = EvidenceRefResult & { graphId: string; entityId?: string }
export interface ArchifyEvidenceContext {
  readonly references: readonly ArchifyReference[]
  readEvidence(refId: string): Promise<ArchifyReadResult>
}
const original = { originalObjects: true } as const

// 仅从已由固定官方编译器接受的内存candidate建立上下文；不导出任意路径读取接口。
export async function captureArchifyEvidence(
  repoRoot: string, graphId: string, candidate: Record<string, any>, contract: RepositoryContract,
): Promise<ArchifyEvidenceContext> {
  const fixedRoot = await realpath(repoRoot)
  await assertRepoTopLevel(fixedRoot, original)
  const type = candidate.diagram_type as ArchifyDiagramType
  const repository = candidate.meta?.repository
  const location = repository ? contract.parseRepositoryRemote(repository.url, { authored: true }) : null
  if (repository && !location) throw Error('官方引用仓库身份无效')
  const verifyRoot = async () => {
    if (await realpath(repoRoot) !== fixedRoot) throw Error('引用仓库位置已变化')
    await assertRepoTopLevel(fixedRoot, original)
    if (location) {
      const origin = (await runGit(fixedRoot, ['remote', 'get-url', 'origin'], original)).trim()
      if (contract.parseRepositoryRemote(origin)?.identity !== location.identity) throw Error('引用仓库身份与受控仓根不符')
    }
  }
  await verifyRoot()
  const refs: ArchifyReference[] = []
  for (const entity of candidate[type === 'workflow' ? 'nodes' : type === 'lifecycle' ? 'states' : 'participants'] ?? []) {
    for (const [sourceIndex, source] of (entity.sources ?? []).entries()) {
      if (!location || !/^[0-9a-f]{40}$/i.test(repository.revision)) throw Error('缺少固定提交与仓库身份')
      const sourcePath = source.path
      if (typeof sourcePath !== 'string' || /^[A-Za-z]:/.test(sourcePath) || /[\\\u0000-\u001f\u007f]/.test(sourcePath)
        || sourcePath.split('/').some((p: string) => !p || p === '.' || p === '..' || p === '.git')) throw Error('引用路径越界')
      const fromLine = source.line ?? null
      const toLine = source.end_line ?? fromLine
      if (fromLine !== null && (!Number.isSafeInteger(fromLine) || !Number.isSafeInteger(toLine) || fromLine < 1 || toLine < fromLine)) throw Error('引用行界无效')
      const commit = repository.revision.toLowerCase()
      const label = source.label ?? `引用 ${sourceIndex + 1}`
      const identity = [type, entity.id, sourceIndex, location.identity, commit, sourcePath, fromLine, toLine, label]
      refs.push(Object.freeze({
        id: 'ref-' + createHash('sha256').update(JSON.stringify(identity)).digest('hex'),
        graphId, diagramType: type, entityId: entity.id, sourceIndex,
        repositoryIdentity: location.identity, repositoryUrl: location.url,
        commit, path: sourcePath, fromLine, toLine, label,
        href: (repository.link_mode ?? 'web') === 'web'
          ? contract.repositorySourceHref(location.provider, location.url, commit, { path: sourcePath, line: source.line, endLine: source.end_line }) : null,
      }))
    }
  }
  const byId = new Map(refs.map(ref => [ref.id, ref]))
  return Object.freeze({
    references: Object.freeze(refs),
    async readEvidence(refId: string): Promise<ArchifyReadResult> {
      const ref = byId.get(refId)
      const failure = (error: string): ArchifyReadResult => ({ id: refId, label: ref?.label ?? '未知引用', graphId, entityId: ref?.entityId, ok: false, error })
      if (!ref) return failure('引用未登记在当前渲染上下文')
      if (ref.fromLine === null) return failure('该官方引用只标记文件，未指定源码行范围；不自动读取整份文件')
      try {
        await verifyRoot()
        const [result] = await resolveEvidenceRefs(fixedRoot, [{
          id: ref.id, label: ref.label, repo: '.', commit: ref.commit, path: ref.path, fromLine: ref.fromLine, toLine: ref.toLine,
        }], original)
        return { ...result, graphId, entityId: ref.entityId }
      } catch (error) {
        // 仓库/环境在渲染后变化只使本条读取失败，已返回HTML保持可用。
        const message = error instanceof CoreError && error.code === 'repo-not-top-level'
          ? '引用仓库已不再是Git顶层，停止本条读取'
          : error instanceof Error ? error.message : String(error)
        return failure(message.split(fixedRoot).join('[受控仓库]'))
      }
    },
  })
}

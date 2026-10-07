// 源码证据：严格校验 + 按固定提交切片。
// 任何一条引用不满足约束 → 该引用明确报错（写明哪条、差在哪）；
// 绝不自动收紧行范围，绝不展示近似内容。文件后来变了不算引用错误——证据永远按固定提交读。
import { gitShowFileOptional, resolveCommit } from './git.ts'
import type { GitReadOptions } from './git.ts'
import { CoreError } from './errors.ts'
import type { EvidenceRefResult, EvidenceResult } from './types.ts'

/** 按 \n 切行；结尾的空行不算一行。 */
export function splitLines(text: string): string[] {
  const lines = text.split('\n')
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines
}

interface RefFieldError { refIndex: number; error: string }

/** 逐条校验并切片；refs 里每条独立成败，互不影响。 */
export async function resolveEvidenceRefs(
  repoRoot: string,
  refs: readonly unknown[],
  options: GitReadOptions = {},
): Promise<EvidenceRefResult[]> {
  const results: EvidenceRefResult[] = []
  for (let i = 0; i < refs.length; i++) {
    results.push(await resolveOneRef(repoRoot, refs[i], i, options))
  }
  return results
}

async function resolveOneRef(repoRoot: string, raw: unknown, index: number, options: GitReadOptions): Promise<EvidenceRefResult> {
  const where = `refs[${index}]`
  const base = { id: `refs[${index}]`, label: `引用 ${index + 1}` }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ...base, ok: false, error: `${where} 不是对象` }
  }
  const ref = raw as Record<string, unknown>
  if (typeof ref.id === 'string' && ref.id) base.id = ref.id
  if (typeof ref.label === 'string' && ref.label) base.label = ref.label
  const bad = (error: string): EvidenceRefResult => ({ ...base, ok: false, error: `${where}（${base.id}）：${error}` })

  if (ref.repo !== undefined && ref.repo !== '.') return bad('第一批只支持同仓引用（repo 必须是 "."）')
  if (typeof ref.commit !== 'string' || !/^[0-9a-f]{40}$/.test(ref.commit)) {
    return bad('commit 必须是 40 位十六进制提交号')
  }
  if (typeof ref.path !== 'string' || !ref.path || pathIsUnsafe(ref.path)) {
    return bad('path 必须是仓库内的相对路径')
  }
  const fromLine = ref.fromLine
  const toLine = ref.toLine
  if (typeof fromLine !== 'number' || typeof toLine !== 'number' || !Number.isInteger(fromLine) || !Number.isInteger(toLine)) {
    return bad('fromLine / toLine 必须是整数')
  }

  try {
    await resolveCommit(repoRoot, ref.commit, options)
  } catch (error) {
    // 仅"确认不存在/不是提交"计入该引用的报错；超时、git 不可用等继续向上传递（评审 #3）。
    if (!(error instanceof CoreError) || error.code !== 'not-found') throw error
    return bad(`提交 ${ref.commit.slice(0, 8)} 无法在本仓库解析`)
  }
  let text: string | null
  try {
    text = await gitShowFileOptional(repoRoot, ref.commit, ref.path, options)
  } catch (error) {
    // 大小超限等读取错误也按该引用报错，不让整页崩掉。
    return bad((error as Error).message)
  }
  if (text === null) return bad(`文件 ${ref.path} 在提交 ${ref.commit.slice(0, 8)} 上不存在`)
  const lines = splitLines(text)
  if (fromLine < 1 || fromLine > toLine || toLine > lines.length) {
    return bad(`行范围越界：该提交上文件共 ${lines.length} 行，引用 ${fromLine}–${toLine} 行`)
  }
  return {
    ...base,
    ok: true,
    repo: '.',
    commit: ref.commit,
    path: ref.path,
    fromLine,
    toLine,
    lineCount: lines.length,
    text: lines.slice(fromLine - 1, toLine).join('\n'),
  }
}

function pathIsUnsafe(p: string): boolean {
  if (p.includes('\\') || /^[a-zA-Z]:/.test(p) || p.startsWith('/')) return true
  const parts = p.split('/')
  return parts.some((part) => part === '' || part === '.' || part === '..')
}

/**
 * 解析 evidence.json 文本并逐条切片。
 * missing：文件本身缺失（→"尚未配置证据文件"）；parseError：JSON/结构不合法；
 * refs: []：合法但为空（→"尚未补充证据"）。三者互斥地表达 §3.5 的降级语义。
 */
export async function loadEvidence(
  repoRoot: string,
  evidenceText: string | null,
): Promise<EvidenceResult> {
  if (evidenceText === null) return { missing: true, refs: [] }
  let parsed: unknown
  try {
    parsed = JSON.parse(evidenceText)
  } catch (error) {
    return { missing: false, parseError: `evidence.json 不是合法 JSON：${(error as Error).message}`, refs: [] }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { missing: false, parseError: 'evidence.json 顶层必须是对象', refs: [] }
  }
  const refs = (parsed as Record<string, unknown>).refs
  if (refs === undefined) {
    return { missing: false, parseError: 'evidence.json 缺少 refs 字段', refs: [] }
  }
  if (!Array.isArray(refs)) {
    return { missing: false, parseError: 'refs 必须是数组', refs: [] }
  }
  return { missing: false, refs: await resolveEvidenceRefs(repoRoot, refs) }
}

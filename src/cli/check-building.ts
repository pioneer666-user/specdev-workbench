// 建筑诊断命令行（建房 Skill 用）：给一个仓库根，回一份建筑核对结果。
// 走的核心链路与页面 /api/building 完全相同（readBuildingBinding：清单核对＋资料可读性＋几何生成），
// 不复制一份诊断；只读，不写任何文件、不改仓库状态。
// 输出与退出码稳定：读得出来就是核对结果（ok 反映有无 error），读不出来就是结构化错误；
// 两种情况都不以异常栈结束——建房 Skill 靠这条命令自己迭代。
// 用法：node <包根>/dist/check-building.js <项目仓库根> [--json]
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { CoreError, FIX_TARGETS, FIX_TARGET_LABELS, LOCATE_HINTS, assertRepoTopLevel, assertRepoUsable, readBuildingBinding } from '../core/index.ts'
import type { FixTarget } from '../core/index.ts'
import type { BuildingBinding, BuildingBindingProblem } from '../core/types.ts'

/** 退出码：0 通过（可含 warning）；1 读得到但有 error；2 读不了（环境或输入错误）。 */
export const EXIT_OK = 0
export const EXIT_PROBLEMS = 1
export const EXIT_UNREADABLE = 2

/** 命令退还的仓库信息：与页面 /api/building 的 repo 字段同形；命令行没有工作区注册表，按手动模式标注。 */
export interface CliRepo {
  mode: 'manual'
  title: string
  path: string
  workspaceId: string
}

/** 一次诊断的结果：checked＝读出来了（binding.ok 反映有无 error）；failed＝读不了。 */
export type CheckOutcome =
  | { kind: 'checked'; binding: BuildingBinding; repo: CliRepo }
  | { kind: 'failed'; code: string; error: string; repo: CliRepo | null }

export interface CliIo {
  out: (text: string) => void
  err: (text: string) => void
}

const USAGE = '用法：node dist/check-building.js <项目仓库根> [--json]'

/** 失败码对应的下一步提示（只覆盖常见几种，其余原样报错，不猜）。 */
const FAILURE_HINTS: Record<string, string> = {
  'no-convention-root': '这里还没有业务清单（docs/specdev/project.json）：先做业务清单，再建房。',
  'no-building-blueprint': '蓝图还不存在——docs/specdev/building.json 正是建房任务要写的文件。',
  'bad-blueprint': '蓝图不是合法 JSON 或格式头不对：按 SKILL 的契约表重写格式头后再跑一次。',
  'bad-inventory': '项目清单（project.json）坏了：先修清单，再建房。',
  'repo-not-top-level': '请在 Git 仓库顶层运行这个命令（工作区里传工作区根目录）。',
  'not-a-git-repo': '这个目录不是 Git 仓库：建筑诊断要读清单与快照标签，需要 Git 仓库。',
  'repo-unavailable': '目录不存在或读不了：核对传入的仓库根路径。',
  'git-unavailable': '找不到 git 可执行文件：确认 git 已安装并在 PATH 中。',
}

/**
 * 跑一次建筑诊断。不抛异常：读不了返回 failed（带稳定 code），读得出来返回 checked。
 * 前置校验与页面同款：目录可用 → Git 仓库顶层（防 `git -C` 向上找到父仓）。
 */
export async function runBuildingCheck(input: string): Promise<CheckOutcome> {
  const repo: CliRepo = { mode: 'manual', title: '命令行', path: path.resolve(input), workspaceId: '' }
  try {
    await assertRepoUsable(repo.path)
    await assertRepoTopLevel(repo.path)
    return { kind: 'checked', binding: await readBuildingBinding(repo.path), repo }
  } catch (error) {
    if (error instanceof CoreError) return { kind: 'failed', code: error.code, error: error.message, repo }
    return {
      kind: 'failed',
      code: 'internal',
      error: error instanceof Error ? error.message : String(error),
      repo,
    }
  }
}

/** error 在前、warning 在后；同级保持原顺序（与页面诊断列表同一口径）。 */
function sorted(problems: readonly BuildingBindingProblem[]): BuildingBindingProblem[] {
  return [...problems].sort((a, b) => (a.severity === 'error' ? 0 : 1) - (b.severity === 'error' ? 0 : 1))
}

function problemLines(problems: readonly BuildingBindingProblem[]): string[] {
  const lines: string[] = []
  for (const problem of sorted(problems)) {
    const target: FixTarget | undefined = FIX_TARGETS[problem.code]
    lines.push(`[${problem.severity}] ${problem.code} ${problem.subject.path || '(根)'}`)
    lines.push(`        ${problem.message}`)
    if (problem.subject.ids.length) lines.push(`        涉及：${problem.subject.ids.join('、')}`)
    const evidence = Object.entries(problem.evidence ?? {})
    if (evidence.length) lines.push(`        证据：${JSON.stringify(Object.fromEntries(evidence))}`)
    // 修复方向按码给：不是所有 error 都靠改蓝图解决（MATERIAL_UNREADABLE 是清单或资料的问题）。
    lines.push(`        修复方向：${target ? FIX_TARGET_LABELS[target] : '未知问题码：先查诊断目录，别直接改 JSON'}`)
    // 定位口径：这几条的 subject.path 只到 /spaces，真正的指针在 subject.ids 或 evidence.businessId 里。
    const locate = LOCATE_HINTS[problem.code]
    if (locate) lines.push(`        定位：${locate}`)
  }
  return lines
}

/** 人类可读摘要（中文）。--json 模式不输出它。 */
export function formatReport(outcome: CheckOutcome): string {
  if (outcome.kind === 'failed') {
    const lines = [
      `建筑诊断：读不了（${outcome.code}）`,
      outcome.error,
      `仓库：${outcome.repo?.path ?? '(未解析)'}`,
    ]
    const hint = FAILURE_HINTS[outcome.code]
    if (hint) lines.push(`提示：${hint}`)
    return lines.join('\n')
  }
  const { binding, repo } = outcome
  const errors = binding.problems.filter((p) => p.severity === 'error')
  const warnings = binding.problems.filter((p) => p.severity === 'warning')
  const entryCount = binding.catalog.businesses.reduce((sum, b) => sum + b.entries.length, 0)
  const lines = [`建筑诊断：${repo.path}`]
  // 项目名只在模型生成成功时才有（有 error 时 model 为 null）——不能把已读到清单的项目说成"待确认"。
  if (binding.model) lines.push(`项目：${binding.model.project.name}`)
  lines.push(
    `蓝图：${binding.blueprintPath}`,
    `清单业务 ${binding.catalog.businesses.length} 个；房间绑定 ${binding.rooms.length} 间；资料入口 ${entryCount} 条`,
  )
  if (binding.rooms.length) {
    const entriesByBusiness = new Map(binding.catalog.businesses.map((b) => [b.businessId, b.entries.length]))
    lines.push(`房间（${binding.rooms.length}）`)
    for (const room of binding.rooms) {
      const directory = room.directory ? '目录开' : '目录关'
      const count = entriesByBusiness.get(room.businessId) ?? 0
      lines.push(`  ${room.spaceId} ← ${room.businessId} ${room.businessName}（${room.floorId}，${directory}，资料 ${count} 条）`)
    }
  }
  lines.push(`错误 ${errors.length} 条，警告 ${warnings.length} 条`)
  if (binding.problems.length) lines.push(...problemLines(binding.problems))
  if (!errors.length) {
    if (warnings.length) lines.push('提示：warning 不阻塞生成；保留它们时要在交付说明里写明理由。')
    lines.push('结论：通过（模型可生成）。能否走通、门牌点不点得开，仍由作者在页面验收。')
    return lines.join('\n')
  }
  // 结论按修复对象分流：一律说"回蓝图改"会把清单/资料的问题指错方向。
  const count = (target: FixTarget): number => errors.filter((p) => FIX_TARGETS[p.code] === target).length
  lines.push('结论：未通过（有 error，模型不会生成）。按每条的"修复方向"改完再跑一次。')
  if (count('blueprint')) lines.push(`  改蓝图 ${count('blueprint')} 条：按 subject.path 回 ${binding.blueprintPath} 改。`)
  if (count('inventory')) lines.push(`  改清单或资料 ${count('inventory')} 条：改蓝图改不好——报告作者，或先修清单/资料。`)
  if (count('evidence')) lines.push(`  按证据判 ${count('evidence')} 条：对照 subject.ids 与项目清单核对；默认先核查蓝图，清单的取舍交作者决定。`)
  return lines.join('\n')
}

/** JSON 输出：与页面 /api/building 同结构（核对结果含 repo；失败为 { code, error, repo }）。 */
export function formatJson(outcome: CheckOutcome): string {
  if (outcome.kind === 'failed') {
    return JSON.stringify({ code: outcome.code, error: outcome.error, repo: outcome.repo }, null, 2)
  }
  return JSON.stringify({ ...outcome.binding, repo: outcome.repo }, null, 2)
}

/** 退出码：只有 warning 或全过 → 0；有 error → 1；读不了 → 2。 */
export function exitCodeOf(outcome: CheckOutcome): number {
  if (outcome.kind === 'failed') return EXIT_UNREADABLE
  return outcome.binding.ok ? EXIT_OK : EXIT_PROBLEMS
}

/**
 * 命令主体：解析参数 → 跑诊断 → 按模式输出 → 返回退出码（不调用 process.exit，便于测试直接调）。
 * 参数只认一个仓库根与可选的 --json；其余一律按用法错误退 2，不猜。
 * --json 时 stdout 始终只有一个 JSON 对象（参数错误也给结构化错误），人类用法说明走 stderr。
 */
export async function main(argv: readonly string[], io: CliIo): Promise<number> {
  const jsonCount = argv.filter((arg) => arg === '--json').length
  const json = jsonCount > 0
  const paths = argv.filter((arg) => arg !== '--json')
  const unknown = paths.filter((arg) => arg.startsWith('-'))
  if (unknown.length || paths.length !== 1 || jsonCount > 1) {
    const message = `${unknown.length ? `未知参数：${unknown.join('、')}。` : ''}${jsonCount > 1 ? '--json 只能给一次。' : ''}${paths.length !== 1 ? '需要一个项目仓库根参数。' : ''}`
    io.err(`${message}\n${USAGE}\n`)
    if (json) io.out(`${JSON.stringify({ code: 'bad-request', error: message, repo: null }, null, 2)}\n`)
    return EXIT_UNREADABLE
  }
  const outcome = await runBuildingCheck(paths[0])
  io.out(json ? `${formatJson(outcome)}\n` : `${formatReport(outcome)}\n`)
  return exitCodeOf(outcome)
}

// 直接执行时才跑（被测试 import 时不跑）：命令行入口在这里设退出码。
if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.exitCode = await main(process.argv.slice(2), {
    out: (text) => process.stdout.write(text),
    err: (text) => process.stderr.write(text),
  })
}

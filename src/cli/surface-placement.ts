// 薄台面入口；盘点退出0不是几何通过，推荐仍须最终完整check-room。
import { pathToFileURL } from 'node:url'
import { createRoomPlacementChecker, placementFailure } from '../core/room-placement.ts'
import { readCandidateJson } from '../core/room-candidate.ts'
import { surfaceInventoryOutcome, surfaceSuggestionOutcome, type SurfaceInventoryOutcome, type SurfaceSuggestionOutcome } from '../core/room-surface.ts'
type Outcome = SurfaceInventoryOutcome | SurfaceSuggestionOutcome
const USAGE = '用法：node <包根>/dist/surface-placement.js list <完整候选.json> [--json] 或 suggest <完整候选.json> <instanceId> [--parent <id>] [--surface <id>] [--json]'
export const exitCodeOf = (r: Outcome) => r.kind === 'failed' ? 2 : r.ok ? 0 : 1
export async function main(argv: readonly string[], io: { out(text: string): void }): Promise<number> {
  const mode = argv[0], json = argv.includes('--json'), initial = mode === 'suggest' ? surfaceSuggestionOutcome() : surfaceInventoryOutcome()
  let result: Outcome = initial
  try {
    if (!['list', 'suggest'].includes(mode)) throw Error(USAGE)
    const positional: string[] = [], options: Record<string, string> = {}, flags = new Set<string>()
    for (let i = 1; i < argv.length; i++) {
      const arg = argv[i]
      if (arg.startsWith('-')) {
        if (flags.has(arg) || !['--json', ...(mode === 'suggest' ? ['--parent', '--surface'] : [])].includes(arg)) throw Error(USAGE)
        flags.add(arg)
        if (arg !== '--json') {
          const value = argv[++i]
          if (!value || value.startsWith('-')) throw Error(USAGE)
          options[arg === '--parent' ? 'parentInstanceId' : 'surfaceId'] = value
        }
      } else { if (!arg) throw Error(USAGE); positional.push(arg) }
    }
    if (positional.length !== (mode === 'list' ? 1 : 2) || (options.surfaceId && !options.parentInstanceId)) throw Error(USAGE)
    let layout: unknown
    try { layout = await readCandidateJson(positional[0]) }
    catch (error) { result = { ...initial, diagnostics: [{ stage: 'input', code: 'PLACEMENT_INPUT_READ', message: error instanceof Error ? error.message : String(error), sourcePath: positional[0] }] }; throw result }
    try {
      const checker = await createRoomPlacementChecker()
      result = mode === 'list' ? checker.inspectSurfaces(layout) : checker.suggestSurface(layout, { instanceId: positional[1], ...options })
    } catch (error) { result = { ...initial, diagnostics: placementFailure(error).diagnostics } }
  } catch (error) {
    if (error !== result) result = { ...initial, diagnostics: [{ stage: 'input', code: 'bad-request', message: error instanceof Error ? error.message : String(error) }] }
  }
  const report = result.scope === 'surface-inventory'
    ? [`${result.ok ? '盘点完成' : '盘点未完成'}；${result.surfaces.length}个承载面。`, result.nature, '未判家具几何、碰撞、可达性、业务、绑定与资料。', ...result.surfaces.map(s => JSON.stringify(s))]
    : [result.ok ? `已确认${result.suggestions.length}项单件surface建议` : '有限搜索未取得确认建议；不代表台面已满或全局放不下。', `结束：${result.search.termination}；截断：${result.search.truncated}；正式检查：${result.search.checked}`, '未检业务、绑定与资料；选用并最小更新同一room.json后必须完整check-room。', ...result.suggestions.map(s => JSON.stringify(s.placement))]
  io.out((json ? JSON.stringify(result, null, 2) : [...report, ...result.diagnostics.map(d => `[${d.stage}/${d.code}] ${d.message}`)].join('\n')) + '\n')
  return exitCodeOf(result)
}
if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) process.exitCode = await main(process.argv.slice(2), { out: text => process.stdout.write(text) })

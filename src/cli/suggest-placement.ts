// 只读单件floor推荐；不替代最终check-room。
import { pathToFileURL } from 'node:url'
import { createRoomPlacementChecker, placementFailure } from '../core/room-placement.ts'
import { readCandidateJson } from '../core/room-candidate.ts'
import { suggestionOutcome, type SuggestionOutcome } from '../core/room-suggestion.ts'
const USAGE = '用法：node <实际包根>/dist/suggest-placement.js <候选room.json文件> <instanceId> [--json]'
export async function runSuggestion(filename: string, instanceId: string): Promise<SuggestionOutcome> {
  let layout: unknown
  try { layout = await readCandidateJson(filename) }
  catch (error) { return { ...suggestionOutcome(), diagnostics: [{ stage: 'input', code: 'PLACEMENT_INPUT_READ', message: error instanceof Error ? error.message : String(error), sourcePath: filename }] } }
  try { return (await createRoomPlacementChecker()).suggest(layout, { instanceId }) }
  catch (error) { return { ...suggestionOutcome(), diagnostics: placementFailure(error).diagnostics } }
}
export function exitCodeOf(result: SuggestionOutcome) { return result.kind === 'failed' ? 2 : result.ok ? 0 : 1 }
export async function main(argv: readonly string[], io: { out(text: string): void }): Promise<number> {
  const jsonCount = argv.filter(v => v === '--json').length, inputs = argv.filter(v => v !== '--json')
  const result = jsonCount > 1 || inputs.length !== 2 || inputs.some(v => !v || v.startsWith('-'))
    ? { ...suggestionOutcome(), diagnostics: [{ stage: 'input', code: 'bad-request', message: USAGE }] }
    : await runSuggestion(inputs[0], inputs[1])
  const report = [result.ok ? `已确认${result.suggestions.length}项单件位置建议` : result.kind === 'failed' ? '无法执行推荐' : '有限候选未找到确认建议；不代表绝对放不下',
    `已检查${result.search.checked}项；结束：${result.search.termination}；截断：${result.search.truncated ? '是' : '否'}`,
    '范围：只推荐目标floor；未检查业务归属、绑定有效性、资料可读性，选择写回后仍须完整check-room。',
    ...result.suggestions.map(s => JSON.stringify(s.placement)), ...result.diagnostics.map(d => `[${d.stage}/${d.code}] ${d.message}`)].join('\n')
  io.out((jsonCount ? JSON.stringify(result, null, 2) : report) + '\n')
  return exitCodeOf(result)
}
if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) process.exitCode = await main(process.argv.slice(2), { out: text => process.stdout.write(text) })

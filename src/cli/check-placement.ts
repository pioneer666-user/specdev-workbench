// 薄入口：有界读取调用方候选，只报告摆放范围，不替代 check-room。
import { pathToFileURL } from 'node:url'
import { createRoomPlacementChecker, placementOutcome, placementFailure, type RoomPlacementOutcome } from '../core/room-placement.ts'
import { readCandidateJson } from '../core/room-candidate.ts'
export { MAX_CANDIDATE_BYTES } from '../core/room-candidate.ts'
const USAGE = '用法：node <实际插件包根>/dist/check-placement.js <候选room.json文件> [--json]'
export async function runPlacementCheck(filename: string): Promise<RoomPlacementOutcome> {
  let layout: unknown
  try {
    layout = await readCandidateJson(filename)
  } catch (error) {
    return { ...placementOutcome(), diagnostics: [{ stage: 'input', code: 'PLACEMENT_INPUT_READ', message: error instanceof Error ? error.message : String(error), sourcePath: filename }] }
  }
  try { return (await createRoomPlacementChecker()).check(layout) }
  catch (error) { return placementFailure(error) }
}
export function exitCodeOf(result: RoomPlacementOutcome): number { return result.kind === 'failed' ? 2 : result.ok ? 0 : 1 }
export async function main(argv: readonly string[], io: { out(text: string): void }): Promise<number> {
  const jsonCount = argv.filter(arg => arg === '--json').length
  const inputs = argv.filter(arg => arg !== '--json')
  const result = jsonCount > 1 || inputs.length !== 1 || !inputs[0] || inputs[0].startsWith('-')
    ? { ...placementOutcome(), diagnostics: [{ stage: 'input' as const, code: 'bad-request', message: USAGE }] }
    : await runPlacementCheck(inputs[0])
  const report = [result.ok ? '摆放检查通过' : result.kind === 'failed' ? '无法执行摆放检查' : '摆放未通过或可达性未确认', '范围：仅摆放；未检查业务归属、绑定有效性、资料可读性。', ...result.diagnostics.map(d => `[${d.stage}/${d.code}] ${d.message}`)].join('\n')
  io.out((jsonCount ? JSON.stringify(result, null, 2) : report) + '\n')
  return exitCodeOf(result)
}
if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) process.exitCode = await main(process.argv.slice(2), { out: text => process.stdout.write(text) })

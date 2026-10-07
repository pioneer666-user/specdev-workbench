// 只从所选版本的 evidence.json 判定；schema_version/sources/编译结果不参与选择。
import { CoreError } from './errors.ts'
export type ChartRenderer = 'legacy' | '3.0.1'
export function chartRenderer(text: string | null, readError?: string): ChartRenderer {
  if (readError) throw new CoreError('evidence-unreadable', readError, 422)
  if (text === null) return 'legacy'
  let value: any
  try { value = JSON.parse(text) } catch { return 'legacy' } // 旧证据的语法诊断仍由旧接口负责。
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.hasOwn(value, 'renderer')) return 'legacy'
  if (value.renderer !== '3.0.1') throw new CoreError('invalid-renderer', 'evidence.json 的 renderer 仅接受字符串 3.0.1；旧图请省略该字段', 422)
  if (value.schema !== 'specdev/evidence/1' || !Array.isArray(value.refs)) throw new CoreError('invalid-renderer-contract', '新版标记要求 schema=specdev/evidence/1 且 refs 为数组', 422)
  if (value.refs.length) throw new CoreError('evidence-conflict', '新版 renderer 与非空旧 refs 冲突；不得忽略或自动清空引用', 422)
  return '3.0.1'
}
export function rendererOverride(values: string[]): ChartRenderer | null {
  if (!values.length) return null
  if (values.length !== 1 || !['legacy', '3.0.1'].includes(values[0])) throw new CoreError('bad-request', 'renderer 仅接受一次 legacy 或 3.0.1', 400)
  return values[0] as ChartRenderer
}

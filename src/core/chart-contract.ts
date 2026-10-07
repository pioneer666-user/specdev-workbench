// 类型、文件和所选版本身份的一处权威入口；旧 workflow 的摘要/文件集合原样保留。
import { CoreError } from './errors.ts'
import { CHART_FILE_NAMES, LIFECYCLE_FILE_NAMES, LIFECYCLE_FINGERPRINT_SCHEME, TYPED_FILE_KEY } from './chart-files.ts'
import { chartRenderer } from './chart-renderer.ts'
import type { ChartFiles, SnapshotMeta } from './types.ts'
import { lifecycleProblems } from './lifecycle.ts'
export const LIFECYCLE_READING_UNAVAILABLE = '生命周期图阅读接入尚未完成；本轮仅支持底座校验与历史保存。'
export type DiagramType = 'workflow' | 'lifecycle'
export type ChartContract = { diagramType: DiagramType; sourceFile: 'workflow.json' | 'lifecycle.json'; sourceKey: 'workflow' | 'lifecycle'; names: readonly (keyof typeof TYPED_FILE_KEY)[] }
export const WORKFLOW_CONTRACT: ChartContract = { diagramType: 'workflow', sourceFile: 'workflow.json', sourceKey: 'workflow', names: CHART_FILE_NAMES }
export const LIFECYCLE_CONTRACT: ChartContract = { diagramType: 'lifecycle', sourceFile: 'lifecycle.json', sourceKey: 'lifecycle', names: LIFECYCLE_FILE_NAMES }
export function parseChartContract(text: string | null, chartId?: string): ChartContract {
  let value: any
  try { value = JSON.parse(text ?? '') } catch { throw new CoreError('invalid-chart-type', 'chart.json 缺失或不是合法JSON，不能猜图种', 422) }
  if (!value || Array.isArray(value) || typeof value.id !== 'string' || !value.id || (chartId && value.id !== chartId) || typeof value.name !== 'string' || !value.name.trim()) throw new CoreError('invalid-chart-type', 'chart.json 的 id/name 或目录归属无效', 422)
  if (Object.hasOwn(value, 'sourceFile')) throw new CoreError('invalid-chart-type', 'chart.json 不接受自定义 sourceFile；图源由类型固定选择', 422)
  if (value.schema === 'specdev/chart/1' && (value.diagramType === undefined || value.diagramType === 'workflow')) return WORKFLOW_CONTRACT
  if (value.schema === 'specdev/chart/2' && value.diagramType === 'lifecycle') return LIFECYCLE_CONTRACT
  throw new CoreError('invalid-chart-type', '仅支持无类型的 specdev/chart/1 workflow 或 specdev/chart/2 diagramType=lifecycle', 422)
}
export function snapshotContract(meta: SnapshotMeta): ChartContract {
  if (meta.schema === 'specdev/snapshot/1') return WORKFLOW_CONTRACT
  if (meta.schema === 'specdev/snapshot/2' && meta.diagramType === 'lifecycle' && meta.sourceFile === 'lifecycle.json' && meta.fingerprintScheme === LIFECYCLE_FINGERPRINT_SCHEME) return LIFECYCLE_CONTRACT
  throw new CoreError('invalid-chart-type', '快照类型、源文件或fingerprintScheme不受支持', 422)
}
export type ChartSet = { contract: ChartContract; files: ChartFiles; errors: Partial<Record<keyof ChartFiles, string>>; sourceError?: string }
export async function readChartSet(read: (name: string) => Promise<string | null>, chartId: string, snapshot?: SnapshotMeta, legacyDescriptorOptional = false): Promise<ChartSet> {
  const expected = snapshot ? snapshotContract(snapshot) : undefined
  const files: ChartFiles = { workflow: null, details: null, evidence: null }
  const errors: ChartSet['errors'] = {}
  const safe = async (name: keyof typeof TYPED_FILE_KEY) => {
    const key = TYPED_FILE_KEY[name]
    try { return await read(name) } catch (error) { errors[key] = error instanceof Error ? error.message : String(error); return null }
  }
  // 旧快照完全不依赖当前或历史 descriptor 的格式，保持旧三文件语义。
  let contract = expected ?? WORKFLOW_CONTRACT, sourceError: string | undefined
  if (!expected || expected.diagramType === 'lifecycle') {
    const descriptor = await safe('chart.json')
    // 旧直接保存API本来只要求三文件；仅“完全无描述”的旧调用维持workflow缺省。
    // 旧直接阅读/保存维持这个缺省；登记发现和CLI仍严格校验描述。
    // 坏描述与读不开不回退，lifecycle源及既有typed历史仍拒绝。
    if (!(legacyDescriptorOptional && !expected && descriptor === null && !errors.descriptor)) {
      try { contract = parseChartContract(descriptor, chartId) } catch (error) { sourceError = errors.descriptor ?? (error instanceof Error ? error.message : String(error)) }
    }
    if (expected && (!descriptor || sourceError || contract.diagramType !== expected.diagramType)) throw new CoreError('invalid-chart-history', sourceError ?? '快照描述文件与快照类型不一致', 422)
    if (contract.diagramType === 'lifecycle') files.descriptor = descriptor
  }
  for (const name of contract.names) {
    if (name === 'chart.json') continue
    files[TYPED_FILE_KEY[name]] = await safe(name)
  }
  if (!expected || expected.diagramType === 'lifecycle') {
    const opposite = contract.diagramType === 'lifecycle' ? 'workflow.json' : 'lifecycle.json'
    const extra = await safe(opposite)
    if (extra !== null) sourceError = '同一图目录存在 workflow.json 与 lifecycle.json 等互斥图源，不能猜类型'
    if (errors[TYPED_FILE_KEY[opposite]]) sourceError = errors[TYPED_FILE_KEY[opposite]]
    const text = files[contract.sourceKey]
    if (text !== null && text !== undefined) {
      try {
        const candidate = JSON.parse(text)
        if (candidate?.diagram_type !== contract.diagramType && (contract.diagramType === 'lifecycle' || candidate?.diagram_type !== undefined)) sourceError = `${contract.sourceFile} 的 diagram_type 与登记类型冲突`
        else if (contract.diagramType === 'lifecycle') sourceError = lifecycleProblems(candidate)[0]?.message ?? sourceError
      }
      catch { if (contract.diagramType === 'lifecycle') sourceError = 'lifecycle.json 不是合法JSON' }
    }
    if (contract.diagramType === 'lifecycle') {
      try { if (chartRenderer(files.evidence, errors.evidence) !== '3.0.1') sourceError = '生命周期图必须声明3.0.1 renderer且旧refs为空' }
      catch (error) { sourceError = error instanceof Error ? error.message : String(error) }
    }
  }
  if (expected?.diagramType === 'lifecycle' && sourceError) throw new CoreError('invalid-chart-history', sourceError, 422)
  if (expected?.diagramType === 'lifecycle' && contract.names.some(name => files[TYPED_FILE_KEY[name]] == null || errors[TYPED_FILE_KEY[name]])) throw new CoreError('invalid-chart-history', '生命周期历史缺少或读不开自己的四文件，不借当前版本补齐', 422)
  return { contract, files, errors, sourceError }
}

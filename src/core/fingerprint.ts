// 内容摘要（保存版本·去重与"页面是否过期"共用）：读取侧与写入侧必须用同一份规则，
// 所以单独成模块，谁也别各写一遍。
// 规则：三个数据文件按固定顺序（workflow.json / details.md / evidence.json）换行归一后
// JSON 数列化，再取 SHA-256（十六进制）。缺文件记 null，不折成空串——"没有这个文件"
// 与"这个文件是空的"在阅读侧是两种说法（缺失 / 格式坏），摘要也必须分得开（审查 P2）。
import { createHash } from 'node:crypto'
import { CHART_FILE_NAMES, FILE_KEY } from './chart-files.ts'
import type { ChartFiles } from './types.ts'
import { LIFECYCLE_FINGERPRINT_SCHEME, TYPED_FILE_KEY } from './chart-files.ts'
import type { ChartContract } from './chart-contract.ts'

/** \r\n → \n：提交里 LF、工作区 CRLF 只差换行不算修改（Windows autocrlf=true 常态）。 */
export function normalizeEol(text: string): string {
  return text.replace(/\r\n/g, '\n')
}

/** typed生命周期按固定版本、类型、文件名/文本四对绑定；旧图不进入此算法。 */
export function fingerprintFor(contract: ChartContract, files: ChartFiles): string {
  if (contract.diagramType === 'workflow') return fingerprintOf(files)
  const sequence = [LIFECYCLE_FINGERPRINT_SCHEME, 'lifecycle', contract.names.map(name => {
    const text = files[TYPED_FILE_KEY[name]] ?? null
    return [name, text === null ? null : normalizeEol(text)]
  })]
  return createHash('sha256').update(JSON.stringify(sequence), 'utf8').digest('hex')
}

/** 三个文件的内容摘要（hex）；缺文件是 null，空文件是空串，两者摘要不同。 */
export function fingerprintOf(files: ChartFiles): string {
  const json = JSON.stringify(
    CHART_FILE_NAMES.map((name) => {
      const text = files[FILE_KEY[name]]
      return text === null ? null : normalizeEol(text)
    }),
  )
  return createHash('sha256').update(json, 'utf8').digest('hex')
}

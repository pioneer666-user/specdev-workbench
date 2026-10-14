// 两个薄入口共用T30有界JSON读取，不改变原输入错误契约。
import path from 'node:path'
import { open } from 'node:fs/promises'
export const MAX_CANDIDATE_BYTES = 2 * 1024 * 1024
export async function readCandidateJson(filename: string): Promise<unknown> {
  const handle = await open(path.resolve(filename), 'r')
  try {
    const stat = await handle.stat()
    if (!stat.isFile()) throw new Error('候选必须是普通 JSON 文件')
    if (stat.size > MAX_CANDIDATE_BYTES) throw new Error('候选文件超过 2 MiB 上限')
    const buffer = Buffer.alloc(MAX_CANDIDATE_BYTES + 1)
    let size = 0
    while (size < buffer.length) {
      const read = await handle.read(buffer, size, buffer.length - size, null)
      if (!read.bytesRead) break
      size += read.bytesRead
    }
    if (size > MAX_CANDIDATE_BYTES) throw new Error('候选文件超过 2 MiB 上限')
    const layout: unknown = JSON.parse(buffer.subarray(0, size).toString('utf8'))
    if (!layout || typeof layout !== 'object' || Array.isArray(layout)) throw new Error('候选 JSON 顶层必须是对象')
    return layout
  } finally { await handle.close() }
}

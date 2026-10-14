// 仅新查询使用的有界普通JSON快照；不调用getter/toJSON，不接受共享特殊对象。
import { types } from 'node:util'
export const ROOM_JSON_LIMITS = Object.freeze({ inputNodes: 30000, inputStringUnits: 1048576, depth: 24 })
export type JsonObject = Record<string, any>
export const jsonObject = (v: unknown): v is JsonObject => Boolean(v) && typeof v === 'object' && !Array.isArray(v)
export const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
export function roomJsonSnapshot(input: unknown, tick = () => {}, limits = ROOM_JSON_LIMITS): JsonObject {
  const stack: [unknown, number, boolean][] = [[input, 0, false]], ancestors = new Set<object>()
  let nodes = 0, strings = 0, slots = 0
  while (stack.length) {
    tick()
    const [value, depth, exit] = stack.pop()!
    if (exit) { ancestors.delete(value as object); continue }
    if (++nodes > limits.inputNodes || depth > limits.depth) throw Error('JSON节点数或深度超出输入界')
    if (typeof value === 'string') strings += value.length
    if (strings > limits.inputStringUnits) throw Error('JSON字符串总量超出输入界')
    if (value === null || typeof value === 'string' || typeof value === 'boolean' || finite(value)) continue
    if (!value || typeof value !== 'object' || types.isProxy(value)) throw Error('只接受普通JSON数据，拒绝代理或特殊值')
    const array = Array.isArray(value), proto = Object.getPrototypeOf(value)
    if (array ? proto !== Array.prototype : proto !== Object.prototype && proto !== null) throw Error('只接受普通JSON对象或数组')
    if (ancestors.has(value)) throw Error('JSON不能有循环引用')
    if (array) {
      slots += value.length
      if (slots > limits.inputNodes) throw Error('数组总槽位超出输入界')
      for (let i = 0; i < value.length; i++) {
        tick()
        const d = Object.getOwnPropertyDescriptor(value, String(i))
        if (!d || !('value' in d) || !d.enumerable) throw Error('数组必须稠密、可枚举且不含访问器')
      }
    }
    // 枚举普通对象时逐项限界；先拒绝过量可枚举键，再检查隐藏/符号属性，最后才复制。
    ancestors.add(value); stack.push([value, depth, true])
    let keys = 0
    for (const key in value) {
      tick()
      if (!Object.hasOwn(value, key)) continue
      if (++keys > limits.inputNodes || nodes + stack.length > limits.inputNodes) throw Error('JSON属性数量超出输入界')
      strings += key.length
      if (strings > limits.inputStringUnits) throw Error('JSON字符串总量超出输入界')
      const d = Object.getOwnPropertyDescriptor(value, key)!
      if (!('value' in d)) throw Error('JSON不能含访问器')
      if (array && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length)) throw Error('数组不能有额外属性')
      stack.push([d.value, depth + 1, false])
    }
    if (Object.getOwnPropertySymbols(value).length || Object.getOwnPropertyNames(value).length !== keys + Number(array)) throw Error('JSON不能含符号或隐藏属性')
  }
  if (!jsonObject(input)) throw Error('需要完整room.json对象')
  tick()
  return structuredClone(input)
}

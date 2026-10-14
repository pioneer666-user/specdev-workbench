// 新增仅追加一件/已有按instanceId移动；只输出内存候选和证据，不写业务文件。
import path from 'node:path';
import { open } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
const args = process.argv.slice(2);
if (![2, 7].includes(args.length)) throw Error('用法：node recommend-one.mjs <自有room.json> <instanceId> [<assetId> <zoneId> <期望X> <期望Z> <期望yawDeg>]；两参数移动已有，七参数追加新实例');
const [filename, instanceId, assetId, zoneId, sx, sz, syaw] = args;
const handle = await open(path.resolve(filename), 'r');
let original;
try {
  const info = await handle.stat(), max = 2 * 1024 * 1024;
  if (!info.isFile() || info.size > max) throw Error('候选必须是至多2MiB的普通JSON文件');
  const buffer = Buffer.alloc(max + 1); let size = 0;
  while (size < buffer.length) { const r = await handle.read(buffer, size, buffer.length - size, null); if (!r.bytesRead) break; size += r.bytesRead; }
  if (size > max) throw Error('候选读取期间超过2MiB');
  original = JSON.parse(buffer.subarray(0, size).toString('utf8'));
} finally { await handle.close(); }
const layout = structuredClone(original);
if (!Array.isArray(layout?.instances)) throw Error('需要已有的完整候选instances');
const mode = args.length === 7 ? 'append' : 'move';
if (mode === 'append') {
  const [x, z, yawDeg] = [sx, sz, syaw].map(Number);
  if (![assetId, zoneId, sx, sz, syaw].every(s => s?.trim()) || ![x, z, yawDeg].every(Number.isFinite)) throw Error('新增需要所选资产/区域与有限期望坐标朝向');
  if (layout.instances.some(i => i.instanceId === instanceId)) throw Error('新增ID已存在；移动已有物品使用两参数模式');
  layout.instances.push({ instanceId, assetId, placement: { kind: 'floor', zoneId, x, z, yawDeg } });
}
const targets = layout.instances.filter(i => i.instanceId === instanceId);
if (targets.length !== 1) throw Error('目标instanceId必须唯一');
const initialPlacement = structuredClone(targets[0].placement);
const packageRoot = fileURLToPath(new URL('../../../', import.meta.url));
const { createRoomPlacementChecker } = await import(pathToFileURL(path.join(packageRoot, 'dist/room-placement.js')).href);
const checker = await createRoomPlacementChecker();
const result = checker.suggest(layout, { instanceId }); // 一次有界推荐，先检查期望位置
// 演示选首项；真实任务按作者偏好/已授权AI安排选择，偏好冲突或需挪其他家具交作者裁决。
const selected = result.suggestions[0] ?? null;
const selectedCandidate = selected ? structuredClone(layout) : null;
if (selectedCandidate) selectedCandidate.instances.find(i => i.instanceId === instanceId).placement = structuredClone(selected.placement);
const checked = selectedCandidate ? checker.check(selectedCandidate) : null;
console.log(JSON.stringify({ schemaVersion: 1, mode, query: { instanceId, initialPlacement }, result, selected, selectedCandidate, checked,
  reminder: '工具未写回。选定后最小更新授权的同一room.json并运行完整check-room；不保证审美/全局最近，同问题两轮修复跨入口累计。' }, null, 2));
process.exitCode = selected && checked?.ok ? 0 : 1;

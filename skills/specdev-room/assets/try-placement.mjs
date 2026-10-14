// 自有候选的有限局部试摆；不写文件、不推荐坐标，身份/依附/绑定完整保留。
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
const args = process.argv.slice(2);
if (args.length !== 5) throw new Error('用法：node try-placement.mjs <自有候选.json> <floor实例ID> <自选X> <自选Z> <允许yawDeg>');
const [filename, instanceId, ...numbers] = args;
const [x, z, yawDeg] = numbers.map(Number);
if (numbers.some(v => !v.trim()) || ![x, z, yawDeg].every(Number.isFinite) || ![0, 90, 180, 270].includes(yawDeg)) throw new Error('需要有限坐标和直角朝向，资产自身允许值仍由正式检查判断');
// 本文件位于skills/specdev-room/assets，包根向上三级；file URL处理Windows空格。
const packageRoot = fileURLToPath(new URL('../../../', import.meta.url));
const { createRoomPlacementChecker } = await import(pathToFileURL(path.join(packageRoot, 'dist/room-placement.js')).href);
const layout = JSON.parse(await readFile(path.resolve(filename), 'utf8'));
const candidate = structuredClone(layout);
const item = candidate.instances?.find(i => i.instanceId === instanceId);
if (!item || item.placement?.kind !== 'floor') throw new Error('指定实例必须是候选已有的floor家具；不创建/删除实例');
const started = performance.now();
const checker = await createRoomPlacementChecker(); // 一次初始化，最多两次完整候选检查
const initializedMs = performance.now() - started;
const before = checker.check(layout);
Object.assign(item.placement, { x, z, yawDeg }); // 只修改这件的位置/朝向，不动子项或绑定
const after = checker.check(candidate);
console.log(JSON.stringify({ schemaVersion: 1, initializedMs, trials: [{ change: null, result: before }, { change: { instanceId, x, z, yawDeg }, result: after }], reminder: '选定并写回授权room.json后，必须运行完整check-room；两轮失败停点跨入口累计。' }, null, 2));
process.exitCode = after.ok ? 0 : 1;

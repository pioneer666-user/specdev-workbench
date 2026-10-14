// 只读短例：当前包公开模块；选用仅在内存，最终业务写回与完整check-room由获准调用方执行。
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const args = process.argv.slice(2);
if (![2, 8].includes(args.length)) throw Error('参数：<完整候选.json> <instanceId> [<assetId> <parentInstanceId> <surfaceId> <offsetX> <offsetZ> <yawDeg>]');
const root = fileURLToPath(new URL('../../../', import.meta.url));
const { createRoomPlacementChecker } = await import(pathToFileURL(path.join(root, 'dist/room-placement.js')).href);
const checker = await createRoomPlacementChecker(), input = JSON.parse(await readFile(args[0], 'utf8'));
const inventory = checker.inspectSurfaces(input), candidate = structuredClone(input), id = args[1];
if (args.length === 8) {
  if (candidate.instances.some(i => i.instanceId === id)) throw Error('新增ID已存在');
  const [offsetX, offsetZ, yawDeg] = args.slice(5).map(Number);
  if (![offsetX, offsetZ, yawDeg].every(Number.isFinite)) throw Error('需要有限局部偏移/朝向');
  candidate.instances.push({ instanceId: id, assetId: args[2], placement: { kind: 'surface', parentInstanceId: args[3], surfaceId: args[4], offsetX, offsetZ, yawDeg } });
}
const recommendation = checker.suggestSurface(candidate, { instanceId: id });
const selection = recommendation.suggestions[0]?.placement ?? null;
if (selection) candidate.instances.find(i => i.instanceId === id).placement = structuredClone(selection);
const confirmation = selection ? checker.check(candidate) : null;
console.log(JSON.stringify({ inventory, recommendation, selection, candidate, confirmation, boundary: '仅演示授权范围内选用；不写回；最终完整check-room仍必须。' }, null, 2));
process.exitCode = recommendation.kind === 'failed' ? 2 : confirmation?.ok ? 0 : 1;

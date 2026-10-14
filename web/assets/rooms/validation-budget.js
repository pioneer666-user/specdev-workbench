// 房间校验的整次预算：从输入预检到路径重建/原导航复核共用，不允许调用者放大上限。
export const ROOM_VALIDATION_LIMITS = Object.freeze({
  instances: 64, assets: 128, zones: 16, reservedVolumes: 64, assetSpaces: 32,
  inputNodes: 30000, inputStringUnits: 1048576, depth: 24,
  graphNodes: 4096, graphEdges: 16384, pathPoints: 4096, replaySteps: 8192,
  operations: 250000, milliseconds: 200,
});
export class ValidationLimit extends Error {
  constructor(reason, stage) { super(reason); this.reason = reason; this.stage = stage; }
}
export function validationBudget(options = {}) {
  const limits = { ...ROOM_VALIDATION_LIMITS };
  for (const [key,value] of Object.entries(options.limits ?? {})) {
    if (!Object.hasOwn(limits,key) || !Number.isSafeInteger(value) || value < 0 || value > limits[key]) throw new TypeError('校验限额只能缩小已登记的非负整数上限');
    limits[key] = value;
  }
  const now = options.now ?? (() => performance.now()), started = now();
  let operations = 0, stage = 'input';
  const check = (cost = 1) => {
    operations += cost;
    if (operations > limits.operations) throw new ValidationLimit('operation-limit',stage);
    if (now() - started >= limits.milliseconds) throw new ValidationLimit('time-limit',stage);
  };
  return { limits, check, stage(value) { stage=value; check(); },
    bound(count,key) { if(count>limits[key]) throw new ValidationLimit(key+'-limit',stage); check(); },
    summary: () => ({operations, elapsedMs:now()-started, stage}) };
}
export function checkPlacementInput(template,catalog,layout,budget) {
  for (const [value,key] of [[layout?.instances,'instances'],[catalog?.assets,'assets'],[template?.zones,'zones'],[template?.reservedVolumes,'reservedVolumes']])
    if (Array.isArray(value)) budget.bound(value.length,key);
  for (const asset of Array.isArray(catalog?.assets)?catalog.assets:[]) {
    for (const value of [asset?.clearanceBoxes,asset?.surfaces]) if(Array.isArray(value)) budget.bound(value.length,'assetSpaces');
  }
  // 不递归调用，不先Object.keys整个巨型对象。JSON入口已有文件限额，这里进一步限制同步几何工作量。
  const stack = [[template,0],[catalog,0],[layout,0]], seen = new Set();
  let nodes = 0, stringUnits = 0;
  while(stack.length) {
    const [value,depth] = stack.pop(); budget.bound(++nodes,'inputNodes'); budget.bound(depth,'depth');
    if (typeof value === 'string') { stringUnits+=value.length; budget.bound(stringUnits,'inputStringUnits'); }
    if (!value || typeof value !== 'object' || seen.has(value)) continue;
    seen.add(value);
    for(const key in value) {
      if(!Object.hasOwn(value,key)) continue;
      budget.bound(nodes+stack.length+1,'inputNodes');
      stringUnits+=key.length; budget.bound(stringUnits,'inputStringUnits');
      stack.push([value[key],depth+1]);
    }
  }
}

// 家具资产目录统一读取（E4b-1）：index.json（人工维护的总索引，不复制资产字段）→
// 各资产包 asset.json（单件说明的唯一可编辑来源）→ 一个可被 rooms/placement.js 与
// rooms/bindings.js 直接消费的目录。纯数据层：不加载模型、不读业务资料、不预取预览图、
// 不碰 Three；空间精确约束仍归 placement、动作与文档身份仍归 bindings，这里不复制第二套
// 算法，load 成功也不等于任意布局合法。fetchJson 由调用者注入（可衔接页面既有 JSON 读取器）。
import { hasFurnitureModel } from './registry.js';

const INDEX_URL = '/specdev-workbench/assets/furniture/index.json';
const ROOT_PREFIX = '/specdev-workbench/assets/furniture/';
const ASSET_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const RESERVED_ASSET_KEYS = ['constructor', 'toString', '__proto__'];

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const isNonEmptyString = (value) => typeof value === 'string' && value !== '';
const typeName = (value) => (value === null ? 'null' : Array.isArray(value) ? '数组' : typeof value);
const describe = (value) => {
  try { const text = JSON.stringify(value); return text === undefined ? String(value) : text; } catch { return String(value); }
};
const reasonOf = (error) => (error instanceof Error ? error.message : String(error));
const deepCopyOfJson = (value) => JSON.parse(JSON.stringify(value));
const diag = (code, message, fieldPath) => ({ code, message, fieldPath });
const failure = (code, message, fieldPath) => ({ ok: false, diagnostics: [diag(code, message, fieldPath)], catalog: null });

/** 完整校验索引结构；合格返回 { leafTypes, entries }，否则返回 { problem }（调用方此时不得发任何元数据请求）。 */
function validateIndex(index) {
  if (!isObject(index)) return { problem: diag('LIBRARY_INDEX', `索引必须是 JSON 对象（实际是 ${typeName(index)}）`, 'index') };
  if (index.schemaVersion !== 1) return { problem: diag('LIBRARY_INDEX', `索引 schemaVersion 必须为 1（实际 ${describe(index.schemaVersion)}）`, 'index.schemaVersion') };
  if (!Array.isArray(index.categories)) return { problem: diag('LIBRARY_INDEX', `索引 categories 必须是数组（实际是 ${typeName(index.categories)}）`, 'index.categories') };
  if (!Array.isArray(index.assets)) return { problem: diag('LIBRARY_INDEX', `索引 assets 必须是数组（实际是 ${typeName(index.assets)}）`, 'index.assets') };
  const leafTypes = new Map(); // 叶类型 → 所属大类 id（分类保存在数据里，不作为路径一部分）
  const categoryIds = new Set();
  for (const [position, category] of index.categories.entries()) {
    const at = `index.categories[${position}]`;
    if (!isObject(category)) return { problem: diag('LIBRARY_INDEX', `分类条目必须是对象（${at} 实际是 ${typeName(category)}）`, at) };
    if (!isNonEmptyString(category.id)) return { problem: diag('LIBRARY_INDEX', `分类 id 必须是非空字符串（实际 ${describe(category.id)}）`, `${at}.id`) };
    if (categoryIds.has(category.id)) return { problem: diag('LIBRARY_INDEX', `分类 id 重复登记：${category.id}`, `${at}.id`) };
    categoryIds.add(category.id);
    if (!isNonEmptyString(category.name)) return { problem: diag('LIBRARY_INDEX', `分类 ${category.id} 的 name 必须是非空字符串`, `${at}.name`) };
    if (!Array.isArray(category.types) || category.types.length === 0 || !category.types.every(isNonEmptyString)) {
      return { problem: diag('LIBRARY_INDEX', `分类 ${category.id} 的 types 必须是非空字符串组成的非空数组（实际 ${describe(category.types)}）`, `${at}.types`) };
    }
    for (const type of category.types) {
      if (leafTypes.has(type)) return { problem: diag('LIBRARY_INDEX', `叶类型 ${type} 重复登记（同时出现在 ${leafTypes.get(type)} 与 ${category.id}）`, `${at}.types`) };
      leafTypes.set(type, category.id);
    }
  }
  const entries = [];
  const seenIds = new Set();
  for (const [position, entry] of index.assets.entries()) {
    const at = `index.assets[${position}]`;
    if (!isObject(entry)) return { problem: diag('LIBRARY_INDEX', `资产索引条目必须是对象（${at} 实际是 ${typeName(entry)}）`, at) };
    const { assetId, metadataRef } = entry;
    if (!isNonEmptyString(assetId) || !ASSET_ID_PATTERN.test(assetId) || RESERVED_ASSET_KEYS.includes(assetId)) {
      return { problem: diag('LIBRARY_INDEX', `assetId 必须匹配 ${ASSET_ID_PATTERN} 且不得是保留键（实际 ${describe(assetId)}）`, `${at}.assetId`) };
    }
    if (seenIds.has(assetId)) return { problem: diag('LIBRARY_INDEX', `assetId 重复登记：${assetId}`, `${at}.assetId`) };
    seenIds.add(assetId);
    if (typeof metadataRef !== 'string' || metadataRef !== `assets/${assetId}/asset.json`) {
      return { problem: diag('LIBRARY_INDEX', `${assetId} 的 metadataRef 必须严格等于 assets/${assetId}/asset.json（实际 ${describe(metadataRef)}），不接受绝对路径、外部地址、编码绕行、反斜线、查询串或 ../`, `${at}.metadataRef`) };
    }
    entries.push({ assetId, metadataRef });
  }
  return { leafTypes, entries };
}

/** 校验单份资产说明的管理信息，返回首个 { field, message } 或 null。空间字段只查形态存在，精确约束由 placement 负责。 */
function validateAsset(asset, expectedId, leafTypes) {
  if (!isObject(asset)) return { field: '', message: `资产说明必须是 JSON 对象（实际是 ${typeName(asset)}）` };
  const problems = [
    [asset.schemaVersion !== 1, 'schemaVersion', `schemaVersion 必须为 1（实际 ${describe(asset.schemaVersion)}）`],
    [!Number.isSafeInteger(asset.assetVersion) || asset.assetVersion <= 0, 'assetVersion', `assetVersion 必须是正的安全整数（实际 ${describe(asset.assetVersion)}）`],
    [asset.status !== 'internal', 'status', `status 目前只接受 internal，内部登记不代表发布（实际 ${describe(asset.status)}）`],
    [asset.assetId !== expectedId, 'assetId', `assetId 必须与索引一致（索引 ${expectedId}，实际 ${describe(asset.assetId)}）`],
    [!isNonEmptyString(asset.category) || !leafTypes.has(asset.category), 'category', `category 必须是索引中已登记的叶类型（实际 ${describe(asset.category)}）`],
    [!isNonEmptyString(asset.modelRef), 'modelRef', 'modelRef 必须是非空字符串'],
    [isNonEmptyString(asset.modelRef) && !hasFurnitureModel(asset.modelRef), 'modelRef', `modelRef 未在模型注册表登记，属未知模型：${describe(asset.modelRef)}`],
    [!isNonEmptyString(asset.name), 'name', 'name 必须是非空字符串'],
    [!isNonEmptyString(asset.description), 'description', 'description 必须是非空字符串'],
    [!Array.isArray(asset.styleIds) || asset.styleIds.length === 0 || !asset.styleIds.every(isNonEmptyString), 'styleIds', `styleIds 必须是非空字符串组成的非空数组（实际 ${describe(asset.styleIds)}）`],
    [!isObject(asset.recommendations) || !isNonEmptyString(asset.recommendations.note), 'recommendations.note', 'recommendations.note 必须是非空字符串'],
    [!isObject(asset.source) || !isNonEmptyString(asset.source.origin) || !isNonEmptyString(asset.source.license) || !isNonEmptyString(asset.source.note), 'source', 'source 的 origin／license／note 都必须是非空字符串'],
    [asset.placeholder !== false, 'placeholder', `正式家具目录只收非占位资产，placeholder 必须为 false（实际 ${describe(asset.placeholder)}）`],
    [asset.previewRef !== null && asset.previewRef !== `assets/${expectedId}/preview.webp`, 'previewRef', `previewRef 只能是 null 或严格等于 assets/${expectedId}/preview.webp（实际 ${describe(asset.previewRef)}）`],
    [!isObject(asset.bounds), 'bounds', 'bounds 必须是对象（精确空间约束由 placement 校验）'],
    [!isObject(asset.placement), 'placement', 'placement 必须是对象（精确空间约束由 placement 校验）'],
    [!Array.isArray(asset.clearanceBoxes), 'clearanceBoxes', 'clearanceBoxes 必须是数组'],
    [!Array.isArray(asset.surfaces), 'surfaces', 'surfaces 必须是数组'],
    [!Array.isArray(asset.capabilities), 'capabilities', 'capabilities 必须是数组'],
    [!(asset.approachPoint === null || isObject(asset.approachPoint)), 'approachPoint', 'approachPoint 必须是对象或 null'],
  ];
  for (const [broken, field, message] of problems) if (broken) return { field, message };
  return null;
}

/**
 * 读取统一家具目录：先读并完整校验 index.json（失败不发任何元数据请求），合格后按索引
 * 顺序读取各资产 asset.json；任一资产读取或校验失败则整次失败，不静默跳过坏资产。
 * @param {{ fetchJson: (url: string) => Promise<unknown> }} options 调用者注入的异步 JSON 读取器。
 * @returns {Promise<{ ok: boolean,
 *             diagnostics: Array<{ code: string, message: string, fieldPath: string }>,
 *             catalog: { schemaVersion: 1, assets: object[] } | null }>}
 *   成功时 assets 为按索引顺序的资产深拷贝（调用者改动不污染下次读取，输入对象也不被改写）；
 *   失败时 catalog=null，code 取 LIBRARY_INPUT／LIBRARY_READ／LIBRARY_INDEX／LIBRARY_ASSET。
 */
export async function loadFurnitureCatalog(options) {
  if (!isObject(options) || typeof options.fetchJson !== 'function') {
    return failure('LIBRARY_INPUT', `参数必须是包含函数 fetchJson 的对象（参数实际是 ${typeName(options)}，fetchJson 实际是 ${isObject(options) ? typeName(options.fetchJson) : '缺失'}，不发请求）`, 'fetchJson');
  }
  const { fetchJson } = options;

  let index;
  try {
    index = await fetchJson(INDEX_URL);
  } catch (error) {
    return failure('LIBRARY_READ', `读取家具索引失败：${INDEX_URL}（原因：${reasonOf(error)}）`, 'index');
  }

  const validated = validateIndex(index);
  if (validated.problem) return { ok: false, diagnostics: [validated.problem], catalog: null };

  const assets = [];
  for (const { assetId, metadataRef } of validated.entries) {
    const url = ROOT_PREFIX + metadataRef;
    let asset;
    try {
      asset = await fetchJson(url);
    } catch (error) {
      return failure('LIBRARY_READ', `读取资产说明失败：${url}（原因：${reasonOf(error)}）`, `assets[${assetId}]`);
    }
    const problem = validateAsset(asset, assetId, validated.leafTypes);
    if (problem) {
      return failure('LIBRARY_ASSET', `资产 ${assetId} 的${problem.field ? ` ${problem.field} ` : ''}有问题：${problem.message}`, `assets[${assetId}]${problem.field ? '.' + problem.field : ''}`);
    }
    assets.push(deepCopyOfJson(asset)); // 有效 JSON 深拷贝：不改写 fetchJson 的输入，返回目录与输入脱钩
  }
  return { ok: true, diagnostics: [], catalog: { schemaVersion: 1, assets } };
}

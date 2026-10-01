// 家具模型注册（E4b-1）：modelRef → 固定字面量动态 import 的白名单工厂。
// 安全边界：modelRef 与元数据里的任何字符串都不会被拼成导入地址——每款模型的导入
// 地址是本文件写死的字面量；未知、null、非字符串引用在导入前拒绝（constructor／
// toString／__proto__ 等保留键也不是已登记模型），也不执行 JSON 中的代码。
// 顶层不加载 Three.js、不构造模型；调用 create 才导入对应模型并每次创建独立实例。
// 模块加载或工厂抛错按真实原因经 Promise 拒绝传递，不回退占位模型、不返回半个句柄。
// 注册层不缓存模型实例；场景侧用完应调用句柄上的 dispose（接线归 E4b-2 的页面接入）。

const MODEL_LOADERS = new Map([
  ['fairy-bookshelf-01', async () => {
    const model = await import('./assets/fairy-bookshelf-01/model.js');
    return model.createFairyBookshelf();
  }],
  ['fairy-desk-01', async () => {
    const model = await import('./assets/fairy-desk-01/model.js');
    return model.createFairyDesk();
  }],
  ['fairy-table-lamp-01', async () => {
    const model = await import('./assets/fairy-table-lamp-01/model.js');
    return model.createFairyTableLamp();
  }],
  ['fairy-notice-board-01', async () => {
    const model = await import('./assets/fairy-notice-board-01/model.js');
    return model.createFairyNoticeBoard();
  }],
  ['ceramic-display-stand-01', async () => {
    const model = await import('./assets/ceramic-display-stand-01/model.js');
    return model.createCeramicDisplayStand();
  }],
  ['ceramic-vase-01', async () => {
    const model = await import('./assets/ceramic-vase-01/model.js');
    return model.createCeramicVase();
  }],
  ['fairy-potted-plant-01', async () => {
    const model = await import('./assets/fairy-potted-plant-01/model.js');
    return model.createFairyPottedPlant();
  }],
  ['fairy-book-stack-01', async () => {
    const model = await import('./assets/fairy-book-stack-01/model.js');
    return model.createFairyBookStack();
  }],
  ['fairy-bed-01', async () => {
    const model = await import('./assets/fairy-bed-01/model.js');
    return model.createFairyBed();
  }],
  ['fairy-reading-chair-01', async () => {
    const model = await import('./assets/fairy-reading-chair-01/model.js');
    return model.createFairyReadingChair();
  }],
  ['ceramic-low-cabinet-01', async () => {
    const model = await import('./assets/ceramic-low-cabinet-01/model.js');
    return model.createCeramicLowCabinet();
  }],
  ['ceramic-floor-lamp-01', async () => {
    const model = await import('./assets/ceramic-floor-lamp-01/model.js');
    return model.createCeramicFloorLamp();
  }],
]);

/** modelRef 是否已登记为可创建的家具模型；保留键与未知值一律 false，且不触发任何导入。 */
export function hasFurnitureModel(modelRef) {
  return typeof modelRef === 'string' && MODEL_LOADERS.has(modelRef);
}

/** 按登记创建一件独立模型，返回 { group, dispose }；未登记的引用直接拒绝，不执行任何导入。 */
export function createFurnitureModel(modelRef) {
  if (!hasFurnitureModel(modelRef)) {
    const shown = (() => { try { const text = JSON.stringify(modelRef); return text === undefined ? String(modelRef) : text; } catch { return String(modelRef); } })();
    return Promise.reject(new Error(`未登记的家具模型 modelRef：${shown}——请先在 web/assets/furniture/registry.js 与 index.json 登记`));
  }
  return MODEL_LOADERS.get(modelRef)();
}

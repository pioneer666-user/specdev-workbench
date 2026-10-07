// 独立房间 · 家具摆放校验与装配的纯逻辑（产品模块；P1a 自 E2b 实验迁入，来源提交 d80bea1，
// 迁移对照与检查入口见同目录 README.md 与 tests/room-placement.test.mjs）。
// 不依赖 DOM／WebGL／Three.js／服务器／文件系统，Node 与页面共用同一份。
// 数据约定：米制、+Y 向上、正面 +Z、底面中心原点；房间模板管区域与禁放区，家具目录管
// 尺寸、操作留空与承载面，布置只写实例、位置与依附。surface 实例只携带
// kind/parentInstanceId/surfaceId/offsetX/offsetZ/yawDeg；世界位置＝父变换 × 承载面原点
// （矩形中心 + 高度）× 子局部偏移，世界 yaw＝父 yaw＋子 yaw 对 360 取模，子项不允许自填 Y。
// 校验与绘制必须共用本模块产出的同一份解析结果；本模块不改写任何输入对象。

export const TOLERANCE = 1e-5; // 米；只消除浮点误差，边界接触允许、正厚度相交才拒绝
const SUPPORTED_VERSION = 1;
const GLOBAL_YAW_WHITELIST = [0, 90, 180, 270]; // 首版只接受直角朝向
const SUPPORTED_ZONE_KINDS = ['floor']; // 墙面区域是以后单独的一步
const SUPPORTED_PLACEMENT_KINDS = ['floor', 'surface']; // E2b 起支持桌面承载；wall 仍不支持
const RESERVED_PURPOSES = ['entry', 'corridor', 'fixture']; // 入口／通路／固定构件
const WALK_PURPOSES = ['entry', 'corridor']; // 通路并集＝入口带＋通行带
// placement 按 kind 使用字段白名单：floor 五项、surface 六项。其他自有字段（y、position、
// scale、floor 的 surface 字段、surface 的 floor 字段等）一律 STRUCT_INVALID，不静默忽略——
// 配置写了高度而程序按另一个高度显示，比直接拒绝更危险。
const FLOOR_FIELDS = ['kind', 'zoneId', 'x', 'z', 'yawDeg'];
const SURFACE_FIELDS = ['kind', 'parentInstanceId', 'surfaceId', 'offsetX', 'offsetZ', 'yawDeg'];

const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const isBox = (value) => Boolean(value) && ['minX', 'maxX', 'minY', 'maxY', 'minZ', 'maxZ'].every((key) => finite(value[key]));
// 正尺寸：三轴都要求 min < max（零厚度、负厚度都是结构错误）
const boxPositive = (value) => isBox(value) && value.minX < value.maxX && value.minY < value.maxY && value.minZ < value.maxZ;
// 承载面矩形：只有 X/Z 四向（高度由单独的 y 字段表达）
const rectPositive = (value) => Boolean(value) && ['minX', 'maxX', 'minZ', 'maxZ'].every((key) => finite(value[key])) && value.minX < value.maxX && value.minZ < value.maxZ;
const diag = (code, message, { instanceIds = [], targetId = null, fieldPath = '' } = {}) => ({ code, message, instanceIds, targetId, fieldPath });

/** 直角旋转（度）：θ=90 时本地 +Z（正面）转向 +X。取整三角值，消除浮点误差。 */
export function rotateXZ(x, z, yawDeg) {
  const rad = (yawDeg * Math.PI) / 180;
  const c = Math.round(Math.cos(rad));
  const s = Math.round(Math.sin(rad));
  return { x: x * c + z * s, z: -x * s + z * c };
}

/**
 * 本地直立盒绕 Y 直角旋转后平移到房间坐标。position 携带真实世界 Y（地面家具 y=0，
 * 桌面子项 y=承载面高度）；旧调用只传 {x,z} 时按地面处理。
 */
export function worldBox(local, position, yawDeg) {
  const py = position.y ?? 0;
  const corners = [
    rotateXZ(local.minX, local.minZ, yawDeg), rotateXZ(local.minX, local.maxZ, yawDeg),
    rotateXZ(local.maxX, local.minZ, yawDeg), rotateXZ(local.maxX, local.maxZ, yawDeg),
  ];
  return {
    minX: position.x + Math.min(...corners.map((p) => p.x)), maxX: position.x + Math.max(...corners.map((p) => p.x)),
    minY: py + local.minY, maxY: py + local.maxY,
    minZ: position.z + Math.min(...corners.map((p) => p.z)), maxZ: position.z + Math.max(...corners.map((p) => p.z)),
  };
}

/** inner 完整落在 outer 内（允许 tol 贴边）。 */
const boxInside = (outer, inner, tol = TOLERANCE) =>
  inner.minX >= outer.minX - tol && inner.maxX <= outer.maxX + tol &&
  inner.minY >= outer.minY - tol && inner.maxY <= outer.maxY + tol &&
  inner.minZ >= outer.minZ - tol && inner.maxZ <= outer.maxZ + tol;

/** 三轴都存在超过 tol 的正厚度交集才算相交；仅接触返回 false。 */
const boxIntersects = (a, b, tol = TOLERANCE) =>
  Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX) > tol &&
  Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY) > tol &&
  Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ) > tol;

// ───────────────────────── 结构与引用校验 ─────────────────────────

function checkVersion(value, source, path, out) {
  if (value?.schemaVersion !== SUPPORTED_VERSION) {
    out.push(diag('VERSION_UNSUPPORTED', `${source} 的 schemaVersion 必须是 ${SUPPORTED_VERSION}，当前为 ${JSON.stringify(value?.schemaVersion)}。`, { fieldPath: `${path}.schemaVersion` }));
    return false;
  }
  return true;
}

function checkTemplate(template, out) {
  const problems = [];
  for (const key of ['templateId', 'styleId', 'name']) {
    if (typeof template?.[key] !== 'string' || !template[key].trim()) problems.push([`template.${key}`, `${key} 必须是非空字符串`]);
  }
  if (!boxPositive(template?.interiorBounds)) problems.push(['template.interiorBounds', '室内净空必须是六向有限数值且三轴正尺寸（min < max）的盒子']);
  if (!Array.isArray(template?.zones) || template.zones.length === 0) problems.push(['template.zones', '至少要有一个摆放区域']);
  const zones = Array.isArray(template?.zones) ? template.zones : [];
  const zoneIds = new Set();
  for (const [index, zone] of zones.entries()) {
    if (typeof zone?.zoneId !== 'string' || !zone.zoneId.trim()) { problems.push([`template.zones[${index}]`, 'zoneId 必须是非空字符串']); continue; }
    if (zoneIds.has(zone.zoneId)) out.push(diag('ID_DUPLICATE', `摆放区域 ID「${zone.zoneId}」重复。`, { fieldPath: `template.zones[${index}].zoneId` }));
    zoneIds.add(zone.zoneId);
    if (zone.kind === 'wall') {
      out.push(diag('PLACEMENT_UNSUPPORTED', `区域「${zone.zoneId}」的 kind 是 wall：当前版本不支持墙面摆放。`, { fieldPath: `template.zones[${index}].kind`, targetId: zone.zoneId }));
    } else if (!SUPPORTED_ZONE_KINDS.includes(zone.kind)) {
      problems.push([`template.zones[${index}].kind`, `区域「${zone.zoneId}」的 kind 必须是 ${SUPPORTED_ZONE_KINDS.join('／')}，当前为 ${JSON.stringify(zone.kind)}`]);
    }
    if (!boxPositive(zone?.bounds)) problems.push([`template.zones[${index}].bounds`, '区域范围必须是三轴正尺寸的盒子']);
  }
  const entry = template?.entry;
  if (!finite(entry?.door?.centerX) || !finite(entry?.door?.width) || !finite(entry?.door?.height) || entry.door.width <= 0 || entry.door.height <= 0) {
    problems.push(['template.entry.door', '门洞需要有限的 centerX、正的 width 与 height']);
  }
  if (!finite(entry?.spawn?.x) || !finite(entry?.spawn?.z)) problems.push(['template.entry.spawn', '出生点需要有限的 x、z']);
  if (!Array.isArray(template?.reservedVolumes)) problems.push(['template.reservedVolumes', 'reservedVolumes 必须是数组']);
  const volumes = Array.isArray(template?.reservedVolumes) ? template.reservedVolumes : [];
  const volumeIds = new Set();
  for (const [index, volume] of volumes.entries()) {
    if (typeof volume?.id !== 'string' || !volume.id.trim()) { problems.push([`template.reservedVolumes[${index}]`, '禁放区需要非空 id']); continue; }
    if (volumeIds.has(volume.id)) out.push(diag('ID_DUPLICATE', `禁放区 ID「${volume.id}」重复。`, { fieldPath: `template.reservedVolumes[${index}].id` }));
    volumeIds.add(volume.id);
    if (!RESERVED_PURPOSES.includes(volume?.purpose)) problems.push([`template.reservedVolumes[${index}].purpose`, `禁放区「${volume.id}」的 purpose 必须是 ${RESERVED_PURPOSES.join('／')}`]);
    if (!boxPositive(volume?.bounds)) problems.push([`template.reservedVolumes[${index}].bounds`, `禁放区「${volume.id}」的范围必须是三轴正尺寸的盒子`]);
  }
  if (!finite(template?.walkProfile?.radius) || template.walkProfile.radius <= 0 || !finite(template.walkProfile?.eyeClearance) || template.walkProfile.eyeClearance <= 0) {
    problems.push(['template.walkProfile', 'walkProfile 需要正的 radius 与 eyeClearance']);
  }
  for (const [fieldPath, message] of problems) out.push(diag('STRUCT_INVALID', message, { fieldPath }));
  return problems.length === 0;
}

function checkCatalog(catalog, out) {
  const problems = [];
  if (!Array.isArray(catalog?.assets) || catalog.assets.length === 0) problems.push(['catalog.assets', '至少要登记一款家具']);
  const assets = Array.isArray(catalog?.assets) ? catalog.assets : [];
  const assetIds = new Set();
  for (const [index, asset] of assets.entries()) {
    const at = `catalog.assets[${index}]`;
    if (typeof asset?.assetId !== 'string' || !asset.assetId.trim()) { problems.push([at, 'assetId 必须是非空字符串']); continue; }
    if (assetIds.has(asset.assetId)) out.push(diag('ID_DUPLICATE', `资产 ID「${asset.assetId}」重复。`, { fieldPath: `${at}.assetId` }));
    assetIds.add(asset.assetId);
    for (const key of ['name', 'category', 'description']) {
      if (typeof asset?.[key] !== 'string' || !asset[key].trim()) problems.push([`${at}.${key}`, `资产「${asset.assetId}」的 ${key} 必须是非空字符串`]);
    }
    if (!Array.isArray(asset?.styleIds) || asset.styleIds.length === 0 || asset.styleIds.some((id) => typeof id !== 'string')) {
      problems.push([`${at}.styleIds`, `资产「${asset.assetId}」需要非空的风格标签`]);
    }
    if (typeof asset?.modelRef !== 'string' || !asset.modelRef.trim()) problems.push([`${at}.modelRef`, `资产「${asset.assetId}」需要已登记的 modelRef`]);
    if (!boxPositive(asset?.bounds)) problems.push([`${at}.bounds`, `资产「${asset.assetId}」的包围盒需要三轴都为正尺寸（min < max）`]);
    // 原点约定：占位与导入模型都以底面中心为原点，Y 由地面／承载面算出；偏离则数据与绘制对不上
    if (boxPositive(asset?.bounds) && (Math.abs(asset.bounds.minY) > TOLERANCE || Math.abs(asset.bounds.minX + asset.bounds.maxX) > TOLERANCE || Math.abs(asset.bounds.minZ + asset.bounds.maxZ) > TOLERANCE)) {
      problems.push([`${at}.bounds`, `资产「${asset.assetId}」的包围盒必须以底面中心为原点（minY 为 0，X／Z 居中）`]);
    }
    const kinds = asset?.placement?.allowedKinds;
    if (!Array.isArray(kinds) || kinds.length === 0 || kinds.some((kind) => !['floor', 'surface'].includes(kind))) {
      problems.push([`${at}.placement.allowedKinds`, `资产「${asset.assetId}」的 allowedKinds 只能登记真正支持的值（floor／surface）`]);
    }
    const yaws = asset?.placement?.allowedYawDeg;
    if (!Array.isArray(yaws) || yaws.length === 0 || yaws.some((yaw) => !GLOBAL_YAW_WHITELIST.includes(yaw))) {
      problems.push([`${at}.placement.allowedYawDeg`, `资产「${asset.assetId}」的 allowedYawDeg 只能取 ${GLOBAL_YAW_WHITELIST.join('／')} 的子集`]);
    }
    if (!Array.isArray(asset?.clearanceBoxes)) problems.push([`${at}.clearanceBoxes`, `资产「${asset.assetId}」的 clearanceBoxes 必须是数组（无要求则空数组）`]);
    for (const [ci, clearance] of (Array.isArray(asset?.clearanceBoxes) ? asset.clearanceBoxes : []).entries()) {
      if (typeof clearance?.name !== 'string' || !clearance.name.trim()) problems.push([`${at}.clearanceBoxes[${ci}].name`, '操作留空需要中文名称']);
      if (!boxPositive(clearance?.bounds)) problems.push([`${at}.clearanceBoxes[${ci}].bounds`, `资产「${asset.assetId}」的操作留空「${clearance?.name}」需要三轴正尺寸`]);
    }
    // 地面资产必须自带操作站位；纯 surface 资产（如占位台灯）没有独立地面站位，沿用父家具的站位
    if (Array.isArray(kinds) && kinds.includes('floor') && (!finite(asset?.approachPoint?.x) || !finite(asset?.approachPoint?.z))) {
      problems.push([`${at}.approachPoint`, `资产「${asset.assetId}」提供 floor 放置，需要本地站位 (x,z)`]);
    }
    if (!Array.isArray(asset?.surfaces)) {
      problems.push([`${at}.surfaces`, `资产「${asset.assetId}」的 surfaces 必须是数组（无承载面则空数组）`]);
    } else {
      const surfaceIds = new Set();
      for (const [si, surface] of asset.surfaces.entries()) {
        if (typeof surface?.surfaceId !== 'string' || !surface.surfaceId.trim()) { problems.push([`${at}.surfaces[${si}]`, '承载面需要非空 surfaceId']); continue; }
        if (surfaceIds.has(surface.surfaceId)) out.push(diag('SURFACE_DUPLICATE', `资产「${asset.assetId}」的承载面 ID「${surface.surfaceId}」重复。`, { fieldPath: `${at}.surfaces[${si}].surfaceId`, targetId: surface.surfaceId }));
        surfaceIds.add(surface.surfaceId);
        if (typeof surface?.name !== 'string' || !surface.name.trim()) problems.push([`${at}.surfaces[${si}].name`, `承载面「${surface.surfaceId}」需要中文名称`]);
        if (!rectPositive(surface?.rect)) problems.push([`${at}.surfaces[${si}].rect`, `承载面「${surface.surfaceId}」的矩形需要四向有限数值且正尺寸（min < max）`]);
        if (!finite(surface?.y)) problems.push([`${at}.surfaces[${si}].y`, `承载面「${surface.surfaceId}」需要有限的高度 y`]);
        if (!Array.isArray(surface?.allowedCategories) || surface.allowedCategories.length === 0 || surface.allowedCategories.some((item) => typeof item !== 'string' || !item.trim())) {
          problems.push([`${at}.surfaces[${si}].allowedCategories`, `承载面「${surface.surfaceId}」需要非空的类别白名单`]);
        }
        // 首版只支持水平顶面承载：矩形完整落在父资产包围盒的 X/Z 投影内，y 必须等于包围盒顶面
        if (rectPositive(surface?.rect) && boxPositive(asset?.bounds)) {
          const { bounds, rect } = { bounds: asset.bounds, rect: surface.rect };
          if (rect.minX < bounds.minX - TOLERANCE || rect.maxX > bounds.maxX + TOLERANCE || rect.minZ < bounds.minZ - TOLERANCE || rect.maxZ > bounds.maxZ + TOLERANCE) {
            problems.push([`${at}.surfaces[${si}].rect`, `承载面「${surface.surfaceId}」的矩形必须完整落在父资产「${asset.assetId}」包围盒的 X/Z 投影内`]);
          }
        }
        if (finite(surface?.y) && boxPositive(asset?.bounds) && Math.abs(surface.y - asset.bounds.maxY) > TOLERANCE) {
          problems.push([`${at}.surfaces[${si}].y`, `承载面「${surface.surfaceId}」的高度 y 必须等于父资产「${asset.assetId}」包围盒顶面 maxY（当前版本只支持水平顶面承载）`]);
        }
      }
    }
    if (!Array.isArray(asset?.capabilities)) problems.push([`${at}.capabilities`, `资产「${asset.assetId}」的 capabilities 必须是数组，且不得写可执行代码`]);
  }
  for (const [fieldPath, message] of problems) out.push(diag('STRUCT_INVALID', message, { fieldPath }));
  return problems.length === 0;
}

function checkLayout(layout, out) {
  const problems = [];
  if (typeof layout?.roomId !== 'string' || !layout.roomId.trim()) problems.push(['layout.roomId', 'roomId 必须是非空字符串']);
  if (typeof layout?.templateRef !== 'string' || !layout.templateRef.trim()) problems.push(['layout.templateRef', 'templateRef 必须是非空字符串']);
  if (!Array.isArray(layout?.instances)) problems.push(['layout.instances', 'instances 必须是数组']);
  const instances = Array.isArray(layout?.instances) ? layout.instances : [];
  const seen = new Set();
  for (const [index, instance] of instances.entries()) {
    const at = `layout.instances[${index}]`;
    if (typeof instance?.instanceId !== 'string' || !instance.instanceId.trim()) { problems.push([at, 'instanceId 必须是非空字符串']); continue; }
    if (seen.has(instance.instanceId)) out.push(diag('ID_DUPLICATE', `实例 ID「${instance.instanceId}」在房间内重复。`, { fieldPath: `${at}.instanceId`, instanceIds: [instance.instanceId] }));
    seen.add(instance.instanceId);
    if (typeof instance?.assetId !== 'string' || !instance.assetId.trim()) problems.push([`${at}.assetId`, `实例「${instance.instanceId}」缺少 assetId`]);
    const placement = instance?.placement;
    if (placement?.kind === 'wall') {
      out.push(diag('PLACEMENT_UNSUPPORTED', `实例「${instance.instanceId}」的摆放类型是 wall：当前版本不支持墙面摆放。`, { fieldPath: `${at}.placement.kind`, instanceIds: [instance.instanceId] }));
    } else if (placement?.kind === 'floor') {
      if (typeof placement.zoneId !== 'string' || !placement.zoneId.trim()) problems.push([`${at}.placement.zoneId`, `实例「${instance.instanceId}」缺少 zoneId`]);
      for (const axis of ['x', 'z']) {
        if (!finite(placement?.[axis])) problems.push([`${at}.placement.${axis}`, `实例「${instance.instanceId}」的 ${axis} 坐标必须是有限数值，当前为 ${JSON.stringify(placement?.[axis])}`]);
      }
      for (const field of Object.keys(placement)) {
        if (!FLOOR_FIELDS.includes(field)) problems.push([`${at}.placement.${field}`, `floor 摆放不接受字段 ${field}（placement 只允许 ${FLOOR_FIELDS.join('／')}）`]);
      }
    } else if (placement?.kind === 'surface') {
      // surface 只携带依附字段；世界位置由父项算出，不接受第二份可编辑坐标或自由高度
      for (const field of ['parentInstanceId', 'surfaceId']) {
        if (typeof placement?.[field] !== 'string' || !placement[field].trim()) problems.push([`${at}.placement.${field}`, `surface 实例「${instance.instanceId}」缺少字符串字段 ${field}`]);
      }
      for (const axis of ['offsetX', 'offsetZ']) {
        if (!finite(placement?.[axis])) problems.push([`${at}.placement.${axis}`, `实例「${instance.instanceId}」的 ${axis} 必须是有限数值，当前为 ${JSON.stringify(placement?.[axis])}`]);
      }
      for (const field of Object.keys(placement)) {
        if (!SURFACE_FIELDS.includes(field)) problems.push([`${at}.placement.${field}`, `surface 摆放不接受字段 ${field}（placement 只允许 ${SURFACE_FIELDS.join('／')}，位置与高度由父项与承载面决定）`]);
      }
    } else {
      problems.push([`${at}.placement.kind`, `实例「${instance.instanceId}」的摆放类型必须是 floor 或 surface，当前为 ${JSON.stringify(placement?.kind)}`]);
    }
    if (!GLOBAL_YAW_WHITELIST.includes(placement?.yawDeg)) {
      out.push(diag('YAW_INVALID', `实例「${instance.instanceId}」的朝向必须是 ${GLOBAL_YAW_WHITELIST.join('／')} 度，当前为 ${JSON.stringify(placement?.yawDeg)}。`, { fieldPath: `${at}.placement.yawDeg`, instanceIds: [instance.instanceId] }));
    }
  }
  for (const [fieldPath, message] of problems) out.push(diag('STRUCT_INVALID', message, { fieldPath }));
  return problems.length === 0;
}

// ───────────────────────── 解析与空间校验 ─────────────────────────

/**
 * 三遍解析：先按 ID 建映射（与输入顺序无关），再检查依附引用（自依附／父缺失／环／
 * 层级／承载面／类别），最后按「先全部 floor、再全部 surface」算世界变换。引用失败的
 * 子项不落地、不参与后续空间检查（不因错误父项让孩子落到地面）。
 */
function resolveInstances(template, assets, layout, out) {
  const zones = new Map(template.zones.map((zone) => [zone.zoneId, zone]));
  const nodes = new Map(); // instanceId -> { instance, asset, placement, surface? }
  for (const instance of layout.instances) {
    const placement = instance.placement ?? {};
    const asset = assets.get(instance.assetId);
    if (!asset) {
      out.push(diag('REF_UNKNOWN', `实例「${instance.instanceId}」引用了未知资产「${instance.assetId}」。`, { fieldPath: 'catalog.assets', instanceIds: [instance.instanceId], targetId: instance.assetId }));
      continue;
    }
    if (nodes.has(instance.instanceId)) continue; // 重复 ID 已由 checkLayout 报过，不重复解析
    if (placement.kind === 'floor' && !zones.has(placement.zoneId)) {
      out.push(diag('REF_UNKNOWN', `实例「${instance.instanceId}」引用了未知摆放区域「${placement.zoneId}」。`, { fieldPath: 'template.zones', instanceIds: [instance.instanceId], targetId: placement.zoneId }));
      continue;
    }
    // E4-0（2026-09-28 作者裁决）：家具 styleIds 只是自身风格标签，不再与模板 styleId 比对——
    // 跨风格混搭允许，空间与依附规则照常校验。
    // 实例放置类型必须同时被当前版本与资产允许；两项独立检查，不因类型是 floor 就放行
    if (!asset.placement.allowedKinds.includes(placement.kind)) {
      out.push(diag('PLACEMENT_UNSUPPORTED', `资产「${asset.assetId}」不提供 ${placement.kind} 放置类型，实例「${instance.instanceId}」被拒绝。`, { fieldPath: 'catalog.assets', instanceIds: [instance.instanceId], targetId: asset.assetId }));
    }
    if (!asset.placement.allowedYawDeg.includes(placement.yawDeg)) {
      out.push(diag('YAW_INVALID', `资产「${asset.assetId}」不提供 ${placement.yawDeg}° 朝向。`, { fieldPath: 'catalog.assets', instanceIds: [instance.instanceId], targetId: asset.assetId }));
    }
    // 结构坏掉的实例（坐标非有限、朝向越白名单、依附字段缺失）已在 checkLayout 报过，这里跳过几何解析。
    // 纯 surface 资产（如占位台灯）没有 approachPoint：按 floor 强行解析会在站位上崩溃，这里一并跳过
    //（allowedKinds 不含 floor 的组合已由上方 PLACEMENT_UNSUPPORTED 记录）。
    const usable = placement.kind === 'floor'
      ? finite(placement.x) && finite(placement.z) && GLOBAL_YAW_WHITELIST.includes(placement.yawDeg) && finite(asset?.approachPoint?.x) && finite(asset?.approachPoint?.z)
      : typeof placement.parentInstanceId === 'string' && typeof placement.surfaceId === 'string' && finite(placement.offsetX) && finite(placement.offsetZ) && GLOBAL_YAW_WHITELIST.includes(placement.yawDeg);
    if (!usable) continue;
    nodes.set(instance.instanceId, { instance, asset, placement });
  }
  // 第二遍：依附引用检查。当前版本只允许「地面家具 → 桌面物品」一层。
  const rejected = new Set();
  for (const [id, node] of nodes) {
    if (node.placement.kind !== 'surface') continue;
    const parentId = node.placement.parentInstanceId;
    if (parentId === id) {
      out.push(diag('SELF_ATTACH', `实例「${id}」的 parentInstanceId 指向自己，不能依附自身。`, { instanceIds: [id], fieldPath: 'layout.instances' }));
      rejected.add(id);
      continue;
    }
    const parent = nodes.get(parentId);
    if (!parent) {
      out.push(diag('PARENT_UNKNOWN', `surface 实例「${id}」引用的父实例「${parentId}」不存在或不可解析；子物品不落地，整份拒绝。`, { instanceIds: [id], targetId: parentId, fieldPath: 'layout.instances' }));
      rejected.add(id);
      continue;
    }
    let cyclic = false;
    let cursor = parent;
    for (let guard = 0; cursor && cursor.placement.kind === 'surface' && guard <= nodes.size; guard += 1) {
      if (cursor.placement.parentInstanceId === id) { cyclic = true; break; }
      cursor = nodes.get(cursor.placement.parentInstanceId);
    }
    if (cyclic) {
      out.push(diag('ATTACH_CYCLE', `实例「${id}」与「${parentId}」构成依附环，世界位置无法确定。`, { instanceIds: [id, parentId], fieldPath: 'layout.instances' }));
      rejected.add(id);
      continue;
    }
    if (parent.placement.kind !== 'floor') {
      out.push(diag('ATTACH_DEPTH', `实例「${id}」想依附 surface 实例「${parentId}」：当前版本只支持地面家具 → 桌面物品一层依附。`, { instanceIds: [id, parentId], fieldPath: 'layout.instances' }));
      rejected.add(id);
      continue;
    }
    const surface = (Array.isArray(parent.asset.surfaces) ? parent.asset.surfaces : []).find((item) => item?.surfaceId === node.placement.surfaceId);
    if (!surface) {
      out.push(diag('SURFACE_UNKNOWN', `实例「${id}」引用的承载面「${node.placement.surfaceId}」不属于父实例「${parentId}」的资产「${parent.asset.assetId}」。`, { instanceIds: [id, parentId], targetId: node.placement.surfaceId, fieldPath: 'catalog.assets' }));
      rejected.add(id);
      continue;
    }
    if (!Array.isArray(surface.allowedCategories) || !surface.allowedCategories.includes(node.asset.category)) {
      out.push(diag('CATEGORY_NOT_ALLOWED', `承载面「${surface.surfaceId}」只接受类别 ${JSON.stringify(surface.allowedCategories ?? [])}，实例「${id}」的类别是「${node.asset.category}」。`, { instanceIds: [id, parentId], targetId: surface.surfaceId, fieldPath: 'catalog.assets' }));
      rejected.add(id);
      continue;
    }
    node.surface = surface;
  }
  // 第三遍：世界变换。先算全部地面实例，再算 surface 子项，结果与输入数组顺序无关。
  const resolved = [];
  const byId = new Map();
  for (const node of nodes.values()) {
    if (node.placement.kind !== 'floor') continue;
    const { x, z, yawDeg } = node.placement;
    const entry = {
      instance: node.instance, asset: node.asset, placement: node.placement, surface: null,
      worldYaw: yawDeg,
      position: { x, y: 0, z },
      solid: worldBox(node.asset.bounds, { x, y: 0, z }, yawDeg),
      clearances: (node.asset.clearanceBoxes ?? []).map((item) => ({ name: item.name, bounds: worldBox(item.bounds, { x, y: 0, z }, yawDeg) })),
      approach: (() => {
        const rotated = rotateXZ(node.asset.approachPoint.x, node.asset.approachPoint.z, yawDeg);
        return { x: x + rotated.x, z: z + rotated.z };
      })(),
      standingSource: null,
    };
    resolved.push(entry);
    byId.set(node.instance.instanceId, entry);
  }
  for (const node of nodes.values()) {
    const id = node.instance.instanceId;
    if (node.placement.kind !== 'surface' || rejected.has(id)) continue;
    const parent = byId.get(node.placement.parentInstanceId);
    const rect = node.surface.rect;
    // 承载面原点＝矩形中心 + 高度 y；offset 从该中心起算（中心非零时同样成立），子项不允许自填 Y
    const originX = (rect.minX + rect.maxX) / 2 + node.placement.offsetX;
    const originZ = (rect.minZ + rect.maxZ) / 2 + node.placement.offsetZ;
    const rotated = rotateXZ(originX, originZ, parent.worldYaw);
    const position = { x: parent.position.x + rotated.x, y: parent.position.y + node.surface.y, z: parent.position.z + rotated.z };
    const worldYaw = (((parent.worldYaw + node.placement.yawDeg) % 360) + 360) % 360;
    const entry = {
      instance: node.instance, asset: node.asset, placement: node.placement, surface: node.surface,
      worldYaw, position,
      solid: worldBox(node.asset.bounds, position, worldYaw),
      clearances: (node.asset.clearanceBoxes ?? []).map((item) => ({ name: item.name, bounds: worldBox(item.bounds, position, worldYaw) })),
      approach: null, // 桌面物品没有独立地面站位，站位来源记录为父家具
      standingSource: parent.instance.instanceId,
    };
    resolved.push(entry);
    byId.set(id, entry);
  }
  return { resolved, byId };
}

/** 桌面局部检查：子物品按自身局部朝向旋转后的完整外形投影必须落在承载矩形内（不允许悬空探头）。 */
function surfaceChecks(resolved, byId, out) {
  for (const entry of resolved) {
    if (entry.placement.kind !== 'surface' || !entry.surface) continue;
    const rect = entry.surface.rect;
    const parent = byId.get(entry.placement.parentInstanceId);
    const bounds = entry.asset.bounds;
    const yaw = entry.placement.yawDeg; // 足迹由子局部朝向决定，与父朝向无关
    const corners = [
      rotateXZ(bounds.minX, bounds.minZ, yaw), rotateXZ(bounds.minX, bounds.maxZ, yaw),
      rotateXZ(bounds.maxX, bounds.minZ, yaw), rotateXZ(bounds.maxX, bounds.maxZ, yaw),
    ];
    const centerX = (rect.minX + rect.maxX) / 2 + entry.placement.offsetX;
    const centerZ = (rect.minZ + rect.maxZ) / 2 + entry.placement.offsetZ;
    const occupied = {
      minX: centerX + Math.min(...corners.map((p) => p.x)), maxX: centerX + Math.max(...corners.map((p) => p.x)),
      minZ: centerZ + Math.min(...corners.map((p) => p.z)), maxZ: centerZ + Math.max(...corners.map((p) => p.z)),
    };
    const inside = occupied.minX >= rect.minX - TOLERANCE && occupied.maxX <= rect.maxX + TOLERANCE
      && occupied.minZ >= rect.minZ - TOLERANCE && occupied.maxZ <= rect.maxZ + TOLERANCE;
    if (!inside) {
      out.push(diag('SURFACE_OVERHANG', `实例「${entry.instance.instanceId}」旋转 ${yaw}° 后的完整外形伸出了承载面「${entry.placement.surfaceId}」（父实例「${parent.instance.instanceId}」）；中心仍在表面内也不允许探头。`, { instanceIds: [entry.instance.instanceId, parent.instance.instanceId], targetId: entry.placement.surfaceId, fieldPath: 'layout.instances' }));
    }
  }
}

function spatialChecks(template, resolved, out) {
  const volumes = template.reservedVolumes ?? [];
  const walkSet = volumes.filter((volume) => WALK_PURPOSES.includes(volume.purpose) && volume.bounds.maxY - volume.bounds.minY >= template.walkProfile.eyeClearance);
  const corridors = walkSet.filter((volume) => volume.purpose === 'corridor');
  for (const entry of resolved) {
    // 地面实例须落在所登记的摆放区内；桌面子项不重新求地面区域，由承载面与室内净空约束
    if (entry.placement.kind === 'floor') {
      const zone = template.zones.find((item) => item.zoneId === entry.placement.zoneId);
      if (!boxInside(zone.bounds, entry.solid)) out.push(diag('OUT_OF_BOUNDS', `实例「${entry.instance.instanceId}」的完整包围盒越出了摆放区「${zone.zoneId}」（只查中心点不合格）。`, { instanceIds: [entry.instance.instanceId], targetId: zone.zoneId, fieldPath: 'layout.instances' }));
    }
    if (!boxInside(template.interiorBounds, entry.solid)) out.push(diag('OUT_OF_BOUNDS', `实例「${entry.instance.instanceId}」的完整包围盒越出了室内净空。`, { instanceIds: [entry.instance.instanceId], targetId: 'interior', fieldPath: 'template.interiorBounds' }));
    for (const volume of volumes) {
      if (boxIntersects(entry.solid, volume.bounds)) {
        const kindName = volume.purpose === 'entry' ? '入口' : volume.purpose === 'corridor' ? '通路' : '固定构件';
        out.push(diag('RESERVED_BLOCKED', `实例「${entry.instance.instanceId}」占用了${kindName}禁放区「${volume.id}」。`, { instanceIds: [entry.instance.instanceId], targetId: volume.id, fieldPath: 'template.reservedVolumes' }));
      }
    }
    for (const { name, bounds } of entry.clearances) {
      if (!boxInside(template.interiorBounds, bounds)) out.push(diag('CLEARANCE_BLOCKED', `实例「${entry.instance.instanceId}」的操作留空「${name}」越出了室内净空。`, { instanceIds: [entry.instance.instanceId], targetId: 'interior', fieldPath: 'catalog.assets' }));
      for (const volume of volumes.filter((item) => item.purpose === 'fixture')) {
        if (boxIntersects(bounds, volume.bounds)) out.push(diag('CLEARANCE_BLOCKED', `固定构件「${volume.id}」占用了实例「${entry.instance.instanceId}」的操作留空「${name}」。`, { instanceIds: [entry.instance.instanceId], targetId: volume.id, fieldPath: 'template.reservedVolumes' }));
      }
      for (const other of resolved) {
        if (other === entry) continue;
        if (boxIntersects(bounds, other.solid)) out.push(diag('CLEARANCE_BLOCKED', `实例「${other.instance.instanceId}」的实体占用了实例「${entry.instance.instanceId}」的操作留空「${name}」。`, { instanceIds: [entry.instance.instanceId], targetId: other.instance.instanceId, fieldPath: 'layout.instances' }));
      }
    }
    // 站位按保守人形盒判断：中心 ± 半径（X/Z），Y [0, 净高]；须完整落在自身操作区与同一条固定通路内。
    // 桌面子项没有独立地面站位（approach 为 null），沿用父家具的站位，不在此检查。
    if (entry.approach) {
      const radius = template.walkProfile.radius;
      const human = { minX: entry.approach.x - radius, maxX: entry.approach.x + radius, minY: 0, maxY: template.walkProfile.eyeClearance, minZ: entry.approach.z - radius, maxZ: entry.approach.z + radius };
      if (!entry.clearances.some(({ bounds }) => boxInside(bounds, human))) {
        out.push(diag('STAND_UNREACHABLE', `实例「${entry.instance.instanceId}」站位周围的人形范围（半径 ${radius} 米、净高 ${template.walkProfile.eyeClearance} 米）未完整落在自身操作留空内。`, { instanceIds: [entry.instance.instanceId], fieldPath: 'catalog.assets' }));
      }
      const covered = corridors.some((volume) => boxInside(volume.bounds, human));
      if (!covered) out.push(diag('STAND_UNREACHABLE', `实例「${entry.instance.instanceId}」站位周围的人形范围未完整落入固定通路之一（含头顶净高）。`, { instanceIds: [entry.instance.instanceId], targetId: 'corridor', fieldPath: 'template.reservedVolumes' }));
    }
  }
  // 全部实体统一碰撞（含桌面子项）：父子只做接触不做豁免；仅接触允许、正厚度相交拒绝
  for (let i = 0; i < resolved.length; i += 1) {
    for (let j = i + 1; j < resolved.length; j += 1) {
      if (boxIntersects(resolved[i].solid, resolved[j].solid)) {
        out.push(diag('FURNITURE_OVERLAP', `实例「${resolved[i].instance.instanceId}」与「${resolved[j].instance.instanceId}」的实体盒相交（仅接触允许）。`, { instanceIds: [resolved[i].instance.instanceId, resolved[j].instance.instanceId], fieldPath: 'layout.instances' }));
      }
    }
  }
  return walkSet;
}

/**
 * 出生点到全部地面站位的连续路径证据（固定模板，不是通用寻路）：
 *   路点 = 出生点 → 入口带与主通路衔接点 → 主通路上的转竖点 → 各站位（按 X 降序）。
 *   每一段用两端点人形盒的联合包围盒做保守包含：整段扫过范围必须完整落在**单一**通行盒内，
 *   相邻段共享同一个合法站立位置。端点合法而中途越出会被拒绝。
 *   只有需要地面站位的实例（floor）纳入路径；桌面子项沿用父家具站位，不重复计入。
 */
function routeCheck(template, resolved, walkSet, out) {
  const radius = template.walkProfile.radius;
  const stands = resolved.filter((entry) => entry.approach).map((entry) => ({ instanceId: entry.instance.instanceId, x: entry.approach.x, z: entry.approach.z })).sort((a, b) => b.x - a.x);
  const spawn = template.entry.spawn;
  const human = (x, z) => ({ minX: x - radius, maxX: x + radius, minY: 0, maxY: template.walkProfile.eyeClearance, minZ: z - radius, maxZ: z + radius });
  const entryVolume = walkSet.find((volume) => volume.purpose === 'entry' && boxInside(volume.bounds, human(spawn.x, spawn.z)));
  let join = { x: spawn.x, z: spawn.z };
  if (entryVolume) {
    for (const volume of walkSet) {
      if (volume === entryVolume) continue;
      const zLow = Math.max(entryVolume.bounds.minZ, volume.bounds.minZ);
      const zHigh = Math.min(entryVolume.bounds.maxZ, volume.bounds.maxZ);
      if (zHigh - zLow <= TOLERANCE) continue;
      const candidate = { x: spawn.x, z: (zLow + zHigh) / 2 };
      if (boxInside(volume.bounds, human(candidate.x, candidate.z)) && boxInside(entryVolume.bounds, human(candidate.x, candidate.z))) { join = candidate; break; }
    }
  }
  const zRoute = stands.length ? [...stands].sort((a, b) => a.z - b.z)[Math.floor(stands.length / 2)].z : spawn.z;
  const waypoints = [{ x: spawn.x, z: spawn.z }, join, { x: spawn.x, z: zRoute }, ...stands];
  const inOneVolume = (box) => walkSet.some((volume) => boxInside(volume.bounds, box));
  for (let i = 0; i < waypoints.length - 1; i += 1) {
    const a = human(waypoints[i].x, waypoints[i].z);
    const b = human(waypoints[i + 1].x, waypoints[i + 1].z);
    const swept = { minX: Math.min(a.minX, b.minX), maxX: Math.max(a.maxX, b.maxX), minY: 0, maxY: template.walkProfile.eyeClearance, minZ: Math.min(a.minZ, b.minZ), maxZ: Math.max(a.maxZ, b.maxZ) };
    for (const volume of template.reservedVolumes.filter((item) => item.purpose === 'fixture')) {
      if (boxIntersects(swept, volume.bounds)) out.push(diag('STAND_UNREACHABLE', `出生点到站位的路径第 ${i + 1} 段扫过的人形范围碰到固定构件「${volume.id}」。`, { instanceIds: waypoints[i + 1].instanceId ? [waypoints[i + 1].instanceId] : [], targetId: volume.id, fieldPath: 'template.reservedVolumes' }));
    }
    if (!inOneVolume(swept)) {
      out.push(diag('STAND_UNREACHABLE', `出生点到站位的路径第 ${i + 1} 段扫过的人形范围未完整落在单一通行盒内（保守包含判定），区间 X[${swept.minX.toFixed(2)}, ${swept.maxX.toFixed(2)}] Z[${swept.minZ.toFixed(2)}, ${swept.maxZ.toFixed(2)}]。`, { instanceIds: waypoints[i + 1].instanceId ? [waypoints[i + 1].instanceId] : [], targetId: 'corridor', fieldPath: 'template.reservedVolumes' }));
      return waypoints;
    }
  }
  return waypoints;
}

// ───────────────────────── 对外入口 ─────────────────────────

/**
 * 整体校验一份布置：结构 → 引用 → 解析（含依附）→ 桌面投影 → 空间检查 → 通路检查。
 * 通过返回 { ok: true, assembly }（绘制与点击映射必须复用 assembly 的同一份数据）；
 * 失败返回 { ok: false, diagnostics }（含全部真实错误，不因第一个错误吞掉其余）。
 */
export function validatePlacement(template, catalog, layout) {
  const diagnostics = [];
  const versionsOk = [
    checkVersion(template, '房间模板', 'template', diagnostics),
    checkVersion(catalog, '家具目录', 'catalog', diagnostics),
    checkVersion(layout, '房间布置', 'layout', diagnostics),
  ].every(Boolean);
  if (!versionsOk) return { ok: false, diagnostics };
  const structureOk = [checkTemplate(template, diagnostics), checkCatalog(catalog, diagnostics), checkLayout(layout, diagnostics)].every(Boolean);
  if (!structureOk) return { ok: false, diagnostics };
  if (layout.templateRef !== template.templateId) {
    diagnostics.push(diag('REF_UNKNOWN', `布置引用的模板「${layout.templateRef}」与提供的模板「${template.templateId}」不一致。`, { fieldPath: 'layout.templateRef', targetId: layout.templateRef }));
    return { ok: false, diagnostics };
  }
  const assets = new Map(catalog.assets.map((asset) => [asset.assetId, asset]));
  const { resolved, byId } = resolveInstances(template, assets, layout, diagnostics);
  surfaceChecks(resolved, byId, diagnostics);
  const walkSet = spatialChecks(template, resolved, diagnostics);
  const route = routeCheck(template, resolved, walkSet, diagnostics);
  if (diagnostics.length) return { ok: false, diagnostics };
  return {
    ok: true,
    diagnostics: [],
    assembly: {
      templateId: template.templateId,
      styleId: template.styleId,
      roomId: layout.roomId,
      spawn: { x: template.entry.spawn.x, z: template.entry.spawn.z },
      route,
      instances: resolved.map((entry) => ({
        instanceId: entry.instance.instanceId,
        assetId: entry.asset.assetId,
        name: entry.asset.name,
        placeholder: entry.asset.placeholder === true,
        placementKind: entry.placement.kind,
        parentId: entry.placement.kind === 'surface' ? entry.placement.parentInstanceId : null,
        surfaceId: entry.placement.kind === 'surface' ? entry.placement.surfaceId : null,
        yawDeg: entry.worldYaw,
        position: { x: entry.position.x, y: entry.position.y, z: entry.position.z },
        solid: entry.solid,
        clearances: entry.clearances,
        approach: entry.approach,
        standingSource: entry.standingSource,
        mesh: {
          kind: 'placeholder-box',
          modelRef: entry.asset.modelRef,
          width: entry.asset.bounds.maxX - entry.asset.bounds.minX,
          height: entry.asset.bounds.maxY - entry.asset.bounds.minY,
          depth: entry.asset.bounds.maxZ - entry.asset.bounds.minZ,
        },
      })),
    },
  };
}

/** 诊断视图用：尽量解析每个实例的世界盒（结构坏掉的实例跳过），只画红框说明被拒位置，不当有效家具。 */
export function previewBoxes(template, catalog, layout) {
  const assets = new Map((Array.isArray(catalog?.assets) ? catalog.assets : []).map((asset) => [asset?.assetId, asset]));
  const instances = Array.isArray(layout?.instances) ? layout.instances : [];
  const out = [];
  const floors = [];
  for (const instance of instances) {
    const asset = assets.get(instance?.assetId);
    const placement = instance?.placement;
    if (!asset || !isBox(asset.bounds) || placement?.kind !== 'floor') continue;
    if (!finite(placement?.x) || !finite(placement?.z) || !GLOBAL_YAW_WHITELIST.includes(placement?.yawDeg)) continue;
    floors.push({ instance, asset, placement });
    out.push({
      instanceId: instance.instanceId,
      solid: worldBox(asset.bounds, placement, placement.yawDeg),
      // 诊断预览不得因主校验已拒绝的坏数据（null／缺 bounds 的元素、误拼别名字段）再抛异常；
      // 只读规范字段 clearanceBoxes，元素先验证再取 bounds，坏元素安全跳过
      clearances: (Array.isArray(asset.clearanceBoxes) ? asset.clearanceBoxes : [])
        .filter((entry) => entry && typeof entry.name === 'string' && isBox(entry.bounds))
        .map((entry) => ({ name: entry.name, bounds: worldBox(entry.bounds, placement, placement.yawDeg) })),
    });
  }
  // 桌面子项只有父项可解析时才画红框（父项缺失／结构坏掉时跳过，不让孩子落到地面）
  for (const instance of instances) {
    const asset = assets.get(instance?.assetId);
    const placement = instance?.placement;
    if (!asset || !isBox(asset.bounds) || placement?.kind !== 'surface') continue;
    if (!finite(placement?.offsetX) || !finite(placement?.offsetZ) || !GLOBAL_YAW_WHITELIST.includes(placement?.yawDeg)) continue;
    if (typeof placement.parentInstanceId !== 'string' || typeof placement.surfaceId !== 'string') continue;
    const parent = floors.find((item) => item.instance.instanceId === placement.parentInstanceId);
    const surface = (Array.isArray(parent?.asset?.surfaces) ? parent.asset.surfaces : []).find((item) => item?.surfaceId === placement.surfaceId);
    if (!surface || !rectPositive(surface.rect) || !finite(surface.y)) continue;
    const originX = (surface.rect.minX + surface.rect.maxX) / 2 + placement.offsetX;
    const originZ = (surface.rect.minZ + surface.rect.maxZ) / 2 + placement.offsetZ;
    const rotated = rotateXZ(originX, originZ, parent.placement.yawDeg);
    const position = { x: parent.placement.x + rotated.x, y: surface.y, z: parent.placement.z + rotated.z };
    const worldYaw = (((parent.placement.yawDeg + placement.yawDeg) % 360) + 360) % 360;
    out.push({ instanceId: instance.instanceId, solid: worldBox(asset.bounds, position, worldYaw), clearances: [] });
  }
  return out;
}

/** 场景状态机（纯函数）：整份合法才替换；失败保留上一份合法场景，首次失败则是空底座。 */
export function nextSceneState(state, candidate) {
  if (candidate.ok) return { assembly: candidate.assembly, diagnostics: [] };
  return { assembly: state?.assembly ?? null, diagnostics: candidate.diagnostics ?? [] };
}

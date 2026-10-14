# 承载面查询与单件装饰推荐（0.2.3候选）

按真实resourceBase找到当前包。`dist/room-placement.js`的同一`createRoomPlacementChecker()`兼容保留`check`及floor `suggest`，追加同步`inspectSurfaces(layout)`、`suggestSurface(layout, { instanceId, parentInstanceId?, surfaceId? })`。没有资源路径、限额或时钟覆盖，也不写回。

```text
node "<实际包根>/dist/surface-placement.js" list "<完整候选room.json>" --json
node "<实际包根>/dist/surface-placement.js" suggest "<完整候选room.json>" "new-ornament" --json
node "<实际包根>/dist/surface-placement.js" suggest "<完整候选room.json>" "new-ornament" --parent "指定父实例" --surface "指定面ID" --json
```

普通JSON文件2MiB，绝对含空格路径或独立cwd相对路径均可；纯JSON stdout、只读输入及包。用法/读取解析/资源失败退出2；目标/结构/限额拒绝退出1。list退出0仅盘点完成：scope=surface-inventory，status=inventoried，nature说明配置与能力盘点，unchecked标明geometry/collision/reachability及业务、绑定、资料未检。返回每个floor实例的parentInstanceId、assetId/name、surfaceId/surfaceName、局部rect/width/depth/y、allowedCategories与直接依附items（身份/类别/完整局部placement）；相同资产不同实例分列。无物品仅称当前未放物品；不计算剩余件数，也不承诺任何类别匹配的具体物品都能放。

先从当前包盘点和真实元数据核对类别：当前矮柜顶与展示台接受相应lamp/vase/plant/ornament，书桌接受lamp；这些是本包事实，后续始终以实际查询结果为准。allowedCategories匹配asset.category，不能用taxonomy或名字代替。盘点对未知资源/父面、重复身份、嵌套依附、特殊输入/超限明确失败，不能漏项后称全房完整；几何非法或错类别的初始配置仍可能完成能力盘点，不代表合法。

新装饰先追加所选assetId、唯一instanceId与完整surface placement到同一个room.json的instances。已有装饰按原instanceId。初始父项与面必须真实且结构无歧义，offsetX/offsetZ有限，yaw为资产支持的直角朝向；初始重叠/越界或错类别不必通过。未知父引用不能当普通偏好忽略；floor目标不能转换成surface。无过滤可在所有类别匹配的合法floor父面寻找；parent过滤严格只查该父项，surface过滤必须同时给parent。限定面不接受类别就返回no-matching-surfaces，不自动切换；无过滤时初始错类别诊断保留，可在其他合法面建议。

每条suggestion只含可原样替换目标的完整surface placement、父资产/面身份、sameSurface、localDistance（跨面为null）、yawChanged与整屋confirmed confirmation。只在内存副本替换目标parentInstanceId/surfaceId/offsetX/offsetZ/yawDeg；不改变assetId、其他实例、父家具/其他装饰、数组顺序、房间身份、子项或bindings。局部offset相对承载矩形中心，yaw相对父项；父yaw90时世界变换由正式核心算，不存第二份世界坐标。高度/投影/其他物品碰撞与整屋可达性均由同一正式check确认，不只算台面面积。

scope=surface-suggestion，status为suggested/invalid-input/not-found/unconfirmed/failed，kind=checked/failed；suggest退出0至少一个确认建议（可能截断），1无确认建议，2用法/读取/资源无法执行。search记generated/candidates/checked/resourceChecks/confirmed/hardRejected/unconfirmed/matchedSurfaces/visitedSurfaces、termination/truncated/elapsedMs/limits/coverage，diagnostics保留正式定位，最多8份不同诊断并标明省略。no-matching-surfaces、finite-candidates-exhausted、candidate-limit、check-limit、result-limit、time-limit、inventory-limit、input-rejected、resource-failure分别解释结束；硬拒绝与可达性未确认通过计数区分。不把有限失败称全局放不下/已满，也不无证据归咎目标。

一次共享1500ms协作计时，从输入预检起覆盖扫描/生成/去重/检查/排序；到点不启动下一候选，已在途正式check及受限结果整理可能越过计时点，不是抢占式实时。共64提案、48去重候选、48正式检查（其中1次空实例资源探针，不判调用方家具几何）、最多5建议；所有面合计，不每面重置。30000节点及数组总槽位、24层、1MiB字符串，拒绝代理/访问器/循环/稀疏及特殊对象。盘点最多64实例/256面/256子引用，超过就非通过，不返回部分结果。

扫描按原有效父面优先，再房间实例和元数据顺序；每个匹配面轮流取一项，避免第一个面占尽预算。各面先原偏移（其他面中心）及允许朝向，再中心/四向边缘/四角的有限点；同面点按原偏移局部距离排。已确认结果原面优先、面内局部位移/朝向，跨面仅稳定面顺序，不能比较不同面的offset距离。输出坐标就是实际校验坐标，不再次舍入；只有限覆盖，不保证最优或找全。

[随包短例](../assets/surface-one.mjs)演示盘点→追加一件/选择已有装饰→推荐→在授权范围选用→完整内存候选与公开试摆；不写业务。参数为`<完整候选.json> <instanceId>`；新增再给`<assetId> <parentInstanceId> <surfaceId> <offsetX> <offsetZ> <yawDeg>`。先查元数据选择，不把短例ID和坐标照抄到真实房间。用户已授权AI安排时可以按偏好直接选，跨面更换须在用户布置授权内，否则保留指定父面；不新增坐标批准关卡。选择后最小更新同一获准room.json，再运行完整`dist/check-room.js <仓根> <业务ID> --json`。推荐不验业务归属、binding有效性、资料可读性、不保证美观；缺资料时推荐可成功但完整检查仍会失败，不能删登记或绑定规避。同一问题累计两轮修复停，不通过换入口/种子无限搜索。

# 单件落地家具推荐（0.2.3候选）

按实际resourceBase定位同包，核`dist/room-placement.js`、`dist/suggest-placement.js`、试摆与最终完整检查入口；缺入口报告候选能力缺失，不回退内部web模块或搜索脚本。开始候选前仍必须读房间契约、朝向/依附及真实资产元数据。

公开签名：`const checker = await createRoomPlacementChecker()`；原`check(layout)`保持。新增同步`checker.suggest(layout, { instanceId })`，只接受一个完整普通JSON候选及唯一目标ID，不能传资源、校验器、时钟或限额。目标须已存在且是floor。新建先在同一instances数组追加所选assetId、唯一instanceId及floor placement；已有物品以instanceId定位原项。x/z为期望位置、yawDeg为直角期望朝向，不要求初始位置已经通过。

```text
node "<实际包根>/dist/suggest-placement.js" "<自有完整候选room.json>" "<目标instanceId>" --json
```

普通本地JSON文件至多2MiB，支持独立cwd相对路径/绝对含空格路径，无业务仓/正文/图源要求。JSON stdout只有schemaVersion=1结果；0至少一项confirmed建议（可以截断），1已处理但无建议或目标/布局输入不合要求，2用法、文件读取解析或包资源无法执行。非JSON简短中文，仍只报告不写回。

scope=placement-suggestion，kind=checked/failed，ok/status/instanceId/suggestions/diagnostics/diagnosticsTruncated/search/unchecked。status为suggested、not-found、invalid-input、unconfirmed或failed。每条suggestions含可直接替换目标的placement、平面distance、yawChanged及整屋confirmation（scope=placement/confirmed）；未确认从不列为建议。业务归属、绑定有效性、资料可读性在unchecked明确未检，最终check-room仍必须。

先检查期望位置，附近参考步长取目标实体与操作留空横向最小跨度一半，限定0.35–1m；尝试允许直角朝向、四向一步、优先允许朝向的四向两步/四斜向，再取旋转完整实体/操作空间参考框在区域内的中心/四角。期望朝向不获资产允许时，只把它用于首项正式诊断，后续提案全部使用允许集合。这些框只生成坐标，完整子项、其他家具、入口/fixture/实体/站位/可达性每项都走正式check。输出坐标保持校验时的浮点数，不再次舍入。排序是已检查候选中平面位移小优先、再保留期望朝向，随后yaw/X/Z稳定打破并列；不是全局最近或找全。至多64次提案、48个去重候选和48次正式校验、5个结果；达到结果上限时停止并标明未检查剩余。选择48是为固定28个附近参考与20个分散参考保留有限覆盖，同时低于任务64校验上界。

总协作计时1500ms涵盖输入快照/候选生成/排序/正式校验；到点不启动下一项，已在途的单次200ms有界正式校验及受限整理可能越过计时点，不是抢占式实时。输入复制前有30000节点、24层、1MiB字符串界，拒绝循环/访问器/特殊对象；候选和最多8份不同正式诊断有界，不建全局缓存或后台服务。search给实际generated/candidates/checked/confirmed/hardRejected/unconfirmed、elapsedMs、limits、coverage、termination、truncated。结束原因有有限候选耗尽、candidate-limit、result-limit、time-limit、input-rejected、validation-input-limit或resource-failure。截断仍保留此前确认项；无建议不能解释为数学上不可摆放。诊断保留正式code/message/fieldPath/instanceIds/targetId；只省略超过诊断份数界的后续项并标记，不编阻挡原因、不自动归咎目标或修复其他实例。

只在副本替换目标x/z/yaw，zoneId、其他实例顺序/身份/位置、roomId/businessId/templateRef及全部bindings保持。surface子项的父引用、承载面、offset和相对yaw不变，随父变换的世界碰撞也必须通过。推荐结果/调用方输入/包资源均不被后续请求修改；check/suggest连续使用同一初始化上下文，不重读目录。

[可运行短例](../assets/recommend-one.mjs)仅调用公开接口、不写回；输出查询、有限结果、首项演示选择、完整内存候选和再次check证据。

新增一件（先从同包资产读真实元数据，下面参数只演示，不能指定真实业务未经授权内容）：

```text
node "<实际包根>/skills/specdev-room/assets/recommend-one.mjs" "<自有完整room.json>" "new-desk" "fairy-desk-01" "floor-main" "-1" "0.4" "0"
```

已有带子项父家具移动，沿用其原期望位置/朝向；如需改变偏好，先在自有候选中只改这件的初始floor坐标/朝向，保留所有子项局部字段：

```text
node "<实际包根>/skills/specdev-room/assets/recommend-one.mjs" "<自有完整候选room.json>" "intro-desk"
```

按作者偏好选择；已授权AI安排时AI可选择，不新增坐标批准关卡。偏好冲突、必须挪其他家具/删子项才能实现，带实际诊断交作者裁决。选择后只更新授权的同一room.json：新增仍追加一件、已有仍替换原目标placement；临时材料按调用方工作区约定存放，不在真实业务造每家具文件。然后运行原完整check-room，仍可能因缺资料/坏绑定失败；之后房间视觉/行走由作者验收，推荐不保证美观。两轮同问题具体修复跨推荐/试摆/完整检查累计；一次有界请求的内部候选不是几十轮人工修复，不能反复换种子无限请求绕过停点。记录查询/结果/选用差异。本floor入口不推荐surface子项；台面查询/装饰改用[surface入口](surface-placement.md)，不自动布置全屋，不冒称完整陌生AI试用已验。

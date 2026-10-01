# 独立房间配置契约

依据当前 core/room.ts、rooms/placement.js、rooms/bindings.js 与 E5a，产物固定为仓根下 `docs/specdev/<业务ID>/room.json`。业务 ID 来自目录与清单；顶层不存显示名称或业务正文。[执行流程](../SKILL.md)负责发现当前包、读取目录及调用 CLI。

| 字段 | 约束 |
|---|---|
| schemaVersion | 必填数字 1 |
| roomId | 必填；调整时保留，符合 `^[A-Za-z0-9][A-Za-z0-9._-]*$` |
| businessId | 必填；同一 ID 规则，必须等于目标业务目录与清单身份 |
| templateRef | 必填非空字符串，匹配当前模板 templateId |
| instances | 必填数组，空数组是空房间；每件写 instanceId、assetId、placement |
| bindings | 可选数组，省略或空数组表示无家具绑定；单条恰含 instanceId、action、documents，另可选 charts |

顶层只允许上述六字段，不加 business、name、style、units、docs 等。instanceId 是房内唯一非空实例标识（新 ID 建议沿用字母数字开头及 . _ -），assetId 是目录资产 ID；同款资产可多次实例化。parentInstanceId 和 bindings 引用实例 ID，不能拿 assetId 代替。换外形而仍是同一物品时优先保持 instanceId，不重新编号无关实例。

## 空间与依附

米为单位；Y 向上，X/Z 水平面；资产本地原点是底部中心，正面 +Z，正 90° 将本地 +Z 转向世界 +X。不任意缩放。朝向只用 0/90/180/270，且须在资产 placement.allowedYawDeg 内；摆放类型须在 allowedKinds 内。

| placement.kind | placement 恰允许的字段 | 位置含义 |
|---|---|---|
| floor | kind、zoneId、x、z、yawDeg | 当前模板地面区域中的 X/Z 坐标；不写 y、position、scale |
| surface | kind、parentInstanceId、surfaceId、offsetX、offsetZ、yawDeg | 父家具承载面矩形中心的局部偏移与相对父家具朝向；高度及世界位置由程序计算 |

仅 floor 父项 → surface 子项一层。不能自依附、循环或嵌套，缺父项不能自动落地。桌移动或转动时子项局部偏移及父/承载面引用保持，不能另存世界坐标。换或删除父项需同时核对子项和绑定，但不能擅自删掉未授权内容。

bounds 是完整实体；clearanceBoxes 为操作留空；approachPoint 为站位；surfaces 的 rect/y 是承载范围和高度。旋转后的完整包围盒也须在区域/净空/承载面内，不只中心点在内。reservedVolumes、通路和 walkProfile 来自只读模板，不能改小来过检。surface.allowedCategories 对应资产 category，例如 lamp；不是家具索引分组 lighting。风格 styleIds 和 recommendations 是软建议，写实/童话允许混搭。

## 资料集合（文档与流程图）

唯一动作 `open-document-collection`（现代表“资料集合”），实例的资产 capabilities 必须声明该动作。每个实例至多一条绑定；documents 是字符串数组，charts 是可选的图 ID 字符串数组，同一集合内文档、图各自不可重复；两者都可为空。文档只能来自当前业务 business.docs 登记的原始仓根相对路径，图只能来自当前业务图目录（`docs/specdev/<业务ID>/<图ID>/`）已登记的图 ID——不编码 URL、不造不存在的资料、不拿其他业务登记替代。集合内先按 documents 顺序放文档、再按 charts 顺序放图；同名字符串在文档与图两份清单里各归各的身份，不互相覆盖。

混合集合（文档＋流程图）与纯图集合写法：

```json
{ "instanceId": "shelf-01", "action": "open-document-collection",
  "documents": ["docs/项目介绍.md"], "charts": ["intro-flow"] }
```

```json
{ "instanceId": "notice-01", "action": "open-document-collection",
  "documents": [], "charts": ["submit-review"] }
```

省略 charts 等同空数组；旧三字段（无 charts）配置照常有效。绑定字段白名单不收 href、workspace、businessId、图路径或版本。省略 bindings 不免除 CLI 对全部登记资料（含未绑家具的图）的读取检查。

业务清单位于 `docs/specdev/project.json`（schema=`specdev/project/1`）及业务目录 business.json（schema=`specdev/business/1`）；旧根不兜底、不自动迁移。business.docs 可指向仓内原位置，不要求搬进资料目录。图目录由业务目录内 chart.json/workflow.json 等文件按既有规则扫描得出，business.json 没有 charts 登记数组。

## 示例与校验

[完整演示](../assets/intro-room.json) 的 docs/项目介绍.md 只是演示业务登记资料；真实使用时替换为本业务真实路径，并重新核对目录、身份和坐标。演示文件不得整体覆盖已有房间。

从技能实际 resourceBase.path 或 SKILL.md 所在目录向上两级取包根，核对 package.json 身份及同包资源后运行：

```text
node "<实际插件包根>/dist/check-room.js" "<实际项目仓库根>" "<业务ID>" --json
```

占位符不是真实路径。记录退出码与完整 JSON：0＋checked＋ok=true 才通过，1 为数据问题，2 为读取/输入/包资源等失败。按 [诊断方向](diagnostics.md)最小修正，两轮上限；CLI 只读，不自动改文件，不验证模型渲染或宿主体验。

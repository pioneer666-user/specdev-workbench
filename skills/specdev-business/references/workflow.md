# workflow 图制作与校验指引

本指引管两件事：把业务规格（spec.md）画成一张管理页能读的 workflow 图（workflow.json），再用插件自带的 Archify 校验入口自检。只覆盖 workflow 一种图，其他图种不在本 Skill 范围。

## 1. 制图依赖在哪（archifyRoot）

校验程序和字段规范随插件分发，**不要求机器上另装 Archify**。

- **archifyRoot** ＝ 实际含 `bin/`、`schemas/`、`renderers/` 的目录。本项目固定用插件携带的副本：

  ```text
  <SpecDev 工作台包根>/vendor/archify-renderer/archify
  ```

- **定位方式（按顺序）**：会话已明确给出 archifyRoot 就直接用；否则在 SpecDev 工作台包内找 `vendor/archify-renderer/archify`（源码仓里是 `specdev-workbench/` 目录；DSH 安装后在插件安装目录下）。两处都找不到就停下问作者，**不猜路径、不把任何本机盘符当通用默认值**。
- **验位三件**：所认目录下应存在 `bin/archify.mjs`、`schemas/workflow.schema.json`、`schemas/common.schema.json`。三件不齐说明找错了地方或包不完整，如实报告。
- **不用上游完整副本**：上游 Archify 的完整发行（不随本插件分发）只是 vendor 副本的升级来源，不是校验入口；版本以插件携带的固定副本为准，避免两处不一致。
- **兼容性核对**：`vendor/archify-renderer/VERSION.md` 记录该副本的内容指纹（2026-09-17 拷贝，`sha256:298de55a65fb468e50cf8cdbe95b3fcefc88d25360090ff17bb613a0add65335`，安装态三案校验已过，验证记录由维护者保留）。指纹不一致或来源不明时：报告差异，等作者裁决，**不自行更新插件或外部包**；版本号相同不等于已验证兼容。

## 2. 字段规范：读什么、怎么读

字段以两份 schema 为唯一权威（写图前先读）：

- `<archifyRoot>/schemas/workflow.schema.json` —— workflow 专属结构；
- `<archifyRoot>/schemas/common.schema.json` —— 共享定义（id 格式、节点类型、连线样式、卡片等，前者的 `$defs` 引用都落在这里）。

完整可运行的样图可看公开源码仓的 `sample/data/`（六类约定文件的完整样例；只借字段形状，不搬业务事实）：<https://github.com/pioneer666-user/specdev-workbench>。字段速览（依据 2026-09-17 副本的 schema 静态整理，权威以 schema 原文为准）：

| 位置 | 必填 | 说明 |
|---|---|---|
| 顶层 | `schema_version`、`diagram_type`（"workflow"）、`meta`、`lanes`、`nodes`、`edges` | `phases`、`groups`、`mainPath`、`cards`、`semanticChecks` 可选 |
| `meta` | `title` | 常用可选：`locale`（可写 `"zh-CN"`）、`quality_profile`（**必须写 `"showcase"`**——meta 不允许额外字段、值受枚举约束，**字段名或值拼错都会直接报 schema 错**，命令行 `--quality` 救不回来；漏写不报错，但按本指引仍必须写明）、`animation`、`visual_preset`、`views`；`viewBox` 在 v2 **不写**（布局由编译器测出）；`output` 不用写（原工具落盘用，本流程不需要） |
| `lanes[]` | `id`、`label` | `variant` 可选 `"exception"`（异常／等待／重试泳道） |
| `nodes[]` | `id`、`lane`、`col`、`type`、`label` | `col` 为 0..5 的整数逻辑列，不是像素坐标；`type` 七种：`frontend`／`backend`／`database`／`cloud`／`security`／`messagebus`／`external`；可选 `sublabel`、`tag`、`width` 等 |
| `edges[]` | `from`、`to` | 可选 `id`、`label`、`variant`、`role`（`main`／`branch`／`async`／`return`／`error`）、`route`、`fromSide`／`toSide` 等 |
| `semanticChecks` | （整体可选） | 业务事实已确认时才写：`allowedRoots`、`allowedTerminals`、`requiredEdges`、`requiredPaths` |

两条全局约束：

- **id 规则**：`^[a-zA-Z][a-zA-Z0-9_-]*$`（字母开头，可含数字、下划线、连字符）。泳道、节点、连线、分组全用这套 id。
- **不自创字段**：schema 全程 `additionalProperties: false`，图里写它不认识的字段直接报 schema 错。业务说明放 details.md 和业务文档，不塞进图 JSON。

骨架示意（按 schema 静态整理，未经实跑；真实图的通过以 §4 校验为准）：

```json
{
  "schema_version": 2,
  "diagram_type": "workflow",
  "meta": { "title": "示例骨架", "locale": "zh-CN", "quality_profile": "showcase" },
  "lanes": [{ "id": "main", "label": "主流程" }],
  "mainPath": ["start", "done"],
  "nodes": [
    { "id": "start", "lane": "main", "col": 0, "type": "frontend", "label": "发起" },
    { "id": "done", "lane": "main", "col": 1, "type": "backend", "label": "完成" }
  ],
  "edges": [{ "id": "start-done", "from": "start", "to": "done" }]
}
```

## 3. 画图流程与铁律

### 3.1 从业务文档到图的顺序

1. 先读业务文档，定**主路径**：谁发起 → 经过哪些步骤 → 在哪结束。主路径定不了说明文档还不够，先回去补规格，不硬画。
2. `lanes` 按"归谁管／在哪个运行边界"划分，**主路径走哪几步以业务文档为准**；拒绝、失败、重试、兜底这类异常分支按实际语义单独表达，需要时用 `variant: "exception"` 泳道。审批、等待不自动算异常——如"提交申请→主管审批→执行"里审批是必经的正常步骤，官方示例的 mainPath 也含审批节点。
3. `phases` 讲大阶段（如 接收／处理／出结果）；`groups` 框同一泳道内的并行或分支工作，**每个 group 至少含一个节点**，列范围要合法。
4. `nodes` 用 `lane` ＋ `col`（0..5）定位，不写像素坐标，不写 `viewBox`。
5. `edges` 表达关系：判断、审批、协议、异步、返回这类含义不明显的连线必须写 `label`；有语义的 label 不为过校验而删。优先用 `route` 预设（`drop`／`outside-right`／`return-left`／`bottom-channel`／`up-channel`），**不要**预先写 `via`／`labelAt`／`channelX` 等硬坐标——等诊断要求再加，一次只加一个。
6. 有清晰主路径就设 `mainPath`（≥2 个节点 id）：编译器会校验相邻 id 有对应连线且不倒退。
7. 起步规模：一条清晰主路径、短分支、稀疏标签，主节点 ≤12；首版不追求大而全。

### 3.2 本项目铁律

- **新图用 v2**：`schema_version: 2`。旧图保持原版本；**未经作者授权不迁移、不升版**（原工具的 migrate 是单独的显式命令，不属于本流程）。
- **ID 稳定**：语义未变时保留既有节点和连线 ID——改措辞、改布局可以，ID 不动（详情、证据按 ID 对应）。
- **出处**：每个节点、每条业务分支都必须能指出业务文档出处（章节或编号）。没有出处的猜测先标待裁决，不画成事实。出处落在管理页 details.md 的分节里，写法见 [project-contract.md](project-contract.md)。
- **严禁从渲染后的 HTML 反向提取图内容**：HTML 是产物不是源，图源只有 workflow.json。
- **示例只借形状**：不搬官方示例的业务事实、命名和布局；新图用新的稳定 ID 和业务措辞。
- **不降档**：校验固定 `--quality showcase`，不为通过降成 standard，也不为过校验删语义标签、削弱 `semanticChecks`（那是业务断言，只能随文档证据改）。

## 4. 自检：命令与回执

### 4.1 命令

在 Node 下运行（archifyRoot 见 §1；图用绝对路径）：

```text
node "<archifyRoot>/bin/archify.mjs" validate workflow "<workflow.json绝对路径>" --quality showcase --json
```

- 输入是图源 workflow.json；输出是 stdout 的一份 JSON 回执，stderr 正常为空。
- validate 会临时渲染 HTML 做产物检查并自动清理，不留临时文件；回执里也不含临时路径，可整份归档比对。

### 4.2 通过的判据（五条都要）

1. 退出码 0 且回执 `"ok": true`；
2. `composition.profile` 为 `"showcase"`（九项检查在 standard 档也会全跑、只是判定标准不同，单看检查数量证明不了档位）；
3. `checks` 数组**9 项齐全**且全 `ok`：`single_svg`、`finite_svg`、`orthogonal_arrows`、`label_route_clearance`、`relationship_crossings`、`relationship_corridors`、`container_border_runs`、`route_rhythm`、`legend_clearance`；
4. `composition.status` 为 `"pass"`；
5. `composition.summary.errors` 与 `composition.summary.warnings` 都为 0。

只有 4 项 checks 的是基本校验，**不算** showcase 通过。

### 4.3 失败时怎么修

退出码非 0，回执带 `diagnostics[]`，每条含 `code`（如 `schema/enum`、`layout/constraint`）、`subject`（定位）、`evidence`（证据）、`supportedFixes`（建议修法）、`message`（错误描述）。定位信息的完整程度分两档，修法也分两档：

- **有结构化定位时优先用它**：`subject` 指到字段路径或元素 id、`supportedFixes` 非空——只改 `subject` 指到的地方，先核对 `evidence` 属实，再从 `supportedFixes` 里选；改完重跑校验。
- **结构化信息缺失时按 `message` 办**：有的回执（如布局类）`subject` 只带 diagramType、`evidence` 与 `supportedFixes` 为空，节点和原因写在 `message` 里——按 `message` 点名的节点与原因定位修改；`message` 也说不清就如实报告信息不足，不猜修法。
- 几何问题拿不准时，加 `--layout-json` 跑一次看编译器回执（含测量 viewBox、解出的列、因果诊断），但日常以普通 `--json` 为准。

### 4.4 修复纪律

同一问题**累计两轮修复仍未解决就停**，是否有所改善不影响上限；停下后如实报告未解决的诊断和已试方法，与作者商量。（这是本项目的硬纪律；Archify 原文是"连续两轮无改善才停"，本指引不采用那个更宽的口径。）

## 5. 交付边界

- 交付物只有两样：**workflow.json ＋ 校验回执（JSON）**。不交付 HTML。
- 不运行 `deliver`／`preview`／`visual-check`——那是原 Archify 的发布与预览流程，不属于本 Skill。
- 校验通过的候选即冻结：之后不再改动；确要改，改完必须重跑校验、以新回执为准。
- 保存进管理页的目录结构与命名约定见 [project-contract.md](project-contract.md)，本指引不管存盘。

## 6. 依赖与出处

- 运行依赖：Node（跑校验命令）。校验逻辑是 Archify 原版，随插件 vendor 副本分发；升级＝作者裁决后重跑 `scripts/vendor-renderer.mjs` 并更新 VERSION.md，Skill 使用者不自行升级。
- 本指引整理自 Archify 的 `renderers/workflow/README.md`（布局契约、设计规则）、`SKILL.md`（作图路径、showcase 验收口径、修复纪律）、`schemas/`（字段规范）、`examples/agent-tool-call.workflow.json`（字段形状）；逐项对照与指纹见 references/source-map.md。

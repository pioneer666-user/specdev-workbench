# 来源记录（source-map）

记录本 Skill 各文件借了哪些外部内容、落在哪、改了什么，保证出处可追溯。外部原文件一律不修改。上游发布新版时，先按「版本指纹」与「逐项对照」核对所借条目是否受影响，再决定是否升级——本文件就是对照上游更新的台账。

## T19 现行新增来源（2026-10-06）

新建workflow使用同包vendor/archify-3.0.1，manifest SHA256 `94280f467a56f9b399f34c92d8415d3f49ca17884774b84a853237fa893b17a8`。workflow/common schema为字段权威（meta.output、repository、sourceReferences），T17/T18映射与页内证据保留原件；落workflow-301.md。旧workflow.md的详细手艺原样保留到workflow-legacy.md，下表历史workflow引用对应旧参考。T19增加evidence.renderer兼容字段、默认阅读及包内只读CLI，新引用唯一来源为官方sources，非官方schema修改。旧依赖与许可仍保留。

## 版本指纹

| 来源 | 版本 / 位置 | 许可 |
|---|---|---|
| Spec Kit | 1.0.4（github/spec-kit） | MIT，Copyright GitHub, Inc.（全文见文末） |
| 已接受 Spec Kit 样本 | 一份中文语境的已接受规格样本（2026-09-08 生成） | Spec Kit 产出物，随上表 MIT |
| Archify（插件 vendor 副本，1b-1 起使用） | 内容指纹 `sha256:298de55a65fb468e50cf8cdbe95b3fcefc88d25360090ff17bb613a0add65335`（2026-09-17 拷贝，清单与指纹见 `vendor/archify-renderer/VERSION.md`，随包分发；验证记录由维护者保留） | MIT，Copyright (c) 2026 tt-a1i (Archify)、(c) 2025 Cocoon AI（全文见文末；随副本携带于 `vendor/archify-renderer/archify/LICENSE`，第三方声明见同目录 `THIRD_PARTY_NOTICES.md`） |
| 项目内部方法论 | 项目内部方法论文档（未随包分发） | 主干与红线来源 |

上游在线核对记录（2026-09-18，4a／4b 取材时执行）：逐文件比对 github.com/github/spec-kit 标签 [v1.0.8](https://github.com/github/spec-kit/tree/v1.0.8/templates) 与本地 1.0.4 副本的 plan／tasks／analyze 五份文件（analyze 为 4b 取材时核对），并核对 [releases](https://github.com/github/spec-kit/releases) 1.0.5–1.0.8 的发布说明；结论见「逐项对照」plan／tasks／analyze 三行，凭上述链接可复查。

## 逐项对照

| 来源文件 | 借了什么 | 落到哪 | 改了什么 |
|---|---|---|---|
| `templates/spec-template.md` | FR 编号＋MUST 断言式规则；「给定/当/那么」验收表达；边界情况节；假设节；【NEEDS CLARIFICATION】内联标记；HTML 注释作填写提示 | `assets/spec-template.md` | 按"目标／业务原则／规则／验收"四件套主干重组；全文中文化；删除分支、默认 specs/ 目录、`$ARGUMENTS` 等占位；用户故事从必备改为按需「场景与用法」；成功标准并入验收节 |
| `templates/commands/specify.md` | 从描述提取角色／动作／数据／约束；合理默认值须显式记录为假设 | `references/specification.md` §2 | 删除 hooks、分支脚本、目录与 feature.json 约定；删除"最多 3 个澄清"上限（真实业务缺口不因配额抹掉） |
| `templates/commands/clarify.md` | 歧义分类扫描；集中提问＋推荐选项的表达方式 | `references/specification.md` §2 | 删除 5 问上限与前置脚本；澄清记录收窄为仅业务决策场合、作者原话带时间戳（2026-09-17 裁决） |
| `templates/checklist-template.md`、`templates/commands/checklist.md` | 可测试、可度量、边界覆盖、未决项显式等检查思路 | `references/specification.md` §6 自查清单 | 不落独立清单文件，结果并入交付报告；删除评审责任人框架与命令机制 |
| 样本 `001-excel-form-online/spec.md` | 中文语境下「给定…，当…，那么…」与"必须／不得"的行文方式 | 模板与指引的行文 | 只借鉴表达方式，不搬任何业务事实 |
| `templates/plan-template.md`、`templates/commands/plan.md`（4a 起使用） | 方案三问（技术方案、影响文件、设计原因）；技术上下文清单（语言／依赖／存储／测试／环境）；「决定／理由／放弃的替代」的设计决定留痕；NEEDS CLARIFICATION 内联标记 | `assets/plan-template.md`、`references/implementation.md` §2 | 全文中文化，标记改【待澄清】；删除 constitution 闸门与 Phase 0/1 固定产物（research／data-model／contracts／quickstart 收窄为"确有需要、说明原因、纳入获批范围"），设计解释并入方案正文；新增"三问答清即可、文件按需"的双层要求（简单功能不强制落文件，上游无此分层）；验证计划对接规格 AC 而非 quickstart。2026-09-18 核对上游 1.0.5–1.0.8：两文件仅脚本键名改名（SPECS_DIR→FEATURE_DIR）与扩展 hooks 报错方式变化，均属不采用部分，所借内容不受影响 |
| `templates/tasks-template.md`、`templates/commands/tasks.md`（4a 起使用） | 任务带连续编号与文件路径；每个任务须可独立验收的思路；**约束逐字进任务描述**（借自上游 1.0.5 修复 "require field constraints from data-model.md in generated tasks" 的精神，2026-09-18 核对 1.0.8 后吸收；对应物由 data-model.md 改为业务规格 FR 条文） | `assets/tasks-template.md`、`references/implementation.md` §3 | 全文中文化；删除用户故事阶段泳道、[P] 并行标记、并行执行示例与团队分工策略（改默认串行、依赖注明）；删除 "Tests are OPTIONAL" 默认，反向规定业务逻辑与缺陷修复必须带必要测试；「据」列引用 FR 编号替代 US 故事标签 |
| `templates/commands/analyze.md`（4b 起使用） | 跨文档一致性检查思路：**覆盖缺口**（需求无任务对应，正向与反向）、**冲突**（跨文档矛盾）、**只读纪律**（STRICTLY READ-ONLY，修复建议须用户明确批准后另行执行） | `references/evidence-review.md` §4、§5 | 对照对象由 spec／plan／tasks 三文档改为业务规格／图／详情／源码四方；发现表改为六列中文差异报告（实现事实／测试结果／待裁决分列）；"修复须批准"改为"差异先报告、经作者裁决再改"；删除 constitution 权威与严重度四级分级、50 条发现上限与覆盖率统计指标。2026-09-18 核对上游 1.0.8：仅扩展 hooks 报错方式（静默跳过→明示告知）与一处占位符示例文案变化，均属不采用部分，所借内容不受影响 |
| 项目内部方法论文档（见版本指纹表，未随包分发） | 四件套骨架；写作红线四条（断言式、判卷、篇幅给边界、单一真理来源） | 模板结构＋指引 §4 | 改写为 Skill 内自包含表述，不要求读者持有该文档；2026-09-17 按审查修订两条：无法判定对错不得降为原则（标待裁决、不降强度）、单一真理来源指定义唯一而验收／图／详情可写具体表达（引用编号、不改规则） |
| `renderers/workflow/README.md` | 必填顶层结构；v2 布局契约要点（col 为 0..5 逻辑列、v2 不写 viewBox）；设计规则（泳道／阶段／分组／主路径／语义标签／路由预设优先于硬坐标）；schema 与布局失败清单；`quality_profile` 含义 | `references/workflow.md` §2–§4 | 中文化并收窄到本项目流程；删除 v1 固定布局常数与迁移命令细节（旧图迁移留作者裁决，不进指引）；泳道规则未照搬原文把 human wait 归入 exception 用途的做法——主路径按业务文档确定，审批、等待不自动算异常（2026-09-17 作者评审裁定；官方示例 mainPath 亦含审批节点）；几何数值细节以 schema 与 `--layout-json` 回执为准，不在指引里复述 |
| `SKILL.md`（fast authoring path 等相关段） | 先读 schema＋示例再动笔；示例只借字段形状不搬事实；起步 ≤12 主节点；showcase 通过判据（9 项检查全过＋0 错 0 警，4 项不算）；只修诊断指到的 subject、从 supportedFixes 选；连续两轮无改善即停；通过即冻结 | `references/workflow.md` §2、§3、§4 | 删除其他四种图种、brands 查询、update 检查、deliver／HTML 交付流程；两轮纪律改用工作区口径（累计两轮未解决即停，不采用原文"连续两轮无改善才停"的改善幅度条件）；通过判据补 `composition.profile === "showcase"`（九项检查在 standard 档也会全跑）；诊断缺结构化定位时按 `message` 定位、信息不足即报告 |
| `schemas/workflow.schema.json`、`schemas/common.schema.json` | 字段必填、枚举、id 规则、`additionalProperties: false`（§2 速览表与骨架示意的依据） | `references/workflow.md` §2 | 只摘制图要用的要点，不整份复制；权威指向 vendor 副本内 schema 原文 |
| `examples/agent-tool-call.workflow.json` | 完整 v2 图的字段形状（该图即 1b-0 合法案，安装态回执 9 项全过） | `references/workflow.md` §2 | 骨架按 schema 静态另行整理（标注未经实跑），不搬示例业务事实；示例本体在完整 Archify 副本中、不随插件包分发 |
| 插件 vendor 接入成果（1b-0／1b-0b） | archifyRoot 定位与验位三件、指纹核对与"不自行更新"边界、validate 临时渲染自清理、回执不含临时路径可归档比对 | `references/workflow.md` §1、§4.1 | 来自本插件的接入实践与裁决（非外部文档）；回执结构（9 项检查名、diagnostics 字段及其结构化定位可为空、composition 判据含 `profile`）按实测回执静态核对后写入 |
| `specdev-workbench/README.md`（D2 节、页面与 API 节，1b-2 起使用） | 目录树；图编号全项目唯一；快照＝附注标签、插件唯一写操作；图名与摘要取自当前 chart.json 不随版本回退；docs 只读声明过的路径 | `references/project-contract.md` §1、§2.2、§4 | D2 树补路径基准（仓库根相对）与"id 即目录名"说明（按 types.ts/inventory.ts 核对）；快照标签五项校验属插件读取侧行为，未搬入制作者约定 |
| `specdev-workbench/sample/generate.mjs`＋`sample/data/`（1b-2 起使用） | 六类文件合法样本形状；details 分节写法与【设计】前缀；证据引用条目字段；最小新图（只含 chart＋workflow）的降级形态 | `references/project-contract.md` §2 各最小示例、§2.5 示例、§2.6 | 字段值换成编的通用示例；"最小合法"按插件字段校验逻辑判定（schema＋必填字段），样本自带的 description/intro 等可选项不进最小示例；坏样本仅用于理解报错行为，不作为书写目标。4b 起 `references/evidence-review.md` §2 条目示例与 §5 差异表示例沿用同一虚构样本业务（activity-registration），不引入真实业务证据 |
| `archify-reader` 技能《详情内容规范》（2026-09-05 裁决，1b-2 起使用；该技能不随本包分发） | 读者设定（看过图没看过代码的业务裁决者）；按真实执行顺序；正文零代码标识符、证据分层；失败分支也是事实；首尾承接；依赖就地解释；客观白描 | `references/project-contract.md` §2.5 写作约束 | 九条收拢重组为八条；补"四类分开说"（拟定设计／已有实现／未实现／未核实）与"未定义分支列为问题"（与 workflow.md §3 出处纪律同源）；不移植 reader 产物概念（普通／源码对照双模式、悬停注释、`evidenceExemption`、reader.json 与构建脚本） |
| 插件源码（`src/core/types.ts`、`chart-files.ts`、`evidence.ts`、`inventory.ts`、`save.ts`，`src/dsh/index.ts`（ID_PATTERN 与 doc 路由），`web/assets/details.js`；1b-2 起只读核对） | 必填字段与 id＝目录名校验；业务/图 id 的接口硬限制（`^[A-Za-z0-9][A-Za-z0-9._-]*$`，路由与 API 统一校验）；三个数据文件清单（CHART_FILE_NAMES）；保存去重（内容＋阶段相同返回已有快照 `alreadySaved`，锚定不一定是当前 HEAD）；证据硬规则（repo 只认 "."、40 位提交号、路径安全、行界、按固定提交读取）；编号冲突停用；docs 只读声明路径；分节解析（一级标题总说明、首分节前其余前言被忽略、`## id` 取第一段、围栏不算标题、多节取第一份、图外 id 容忍）与正文显示能力（仅空行分段、简单列表、加粗、行内代码） | `references/project-contract.md` §1、§2 各表、§2.5 分节约定、§2.6、§3、§4 | 均只读核对、未改插件；把源码行为改写成制作者视角的"怎么写才合法"；id 硬限制与命名建议分列（建议是硬限制之内从严，非插件强制）；"插件容忍缺详情"明确为读取降级，交付仍要求分节覆盖全部节点（2026-09-17 评审修正四处） |
| ZCode 官方 skill-creator（格式规范，1c 起使用） | Skill 文件结构（SKILL.md＋references／assets 按需读取分层）；frontmatter 必填项（name 小写中划线且与目录同名、description 写触发与非触发场景）；正文 500 行以内 | `SKILL.md`（入口文件） | 只取格式规范做静态检查；不采用其新建技能默认落位 `.agents/skills/`（本 Skill 随 SpecDev 工作台插件分发，落位是作者裁决）与其试跑提示词流程。主流程十步、三条守恒、阶段边界、交付报告七项来自本技能的任务单元（作者批准）与项目守则，非外部来源。2026-09-17 评审修正三处入口指令——空证据限定新建设计并保护已有证据；快照检查恢复守则红线 2 完整条件（含已授权例外）；第 6 步扩为三份说明文件的补齐维护 |

## 有意不采用的部分

- Spec Kit 的 constitution、默认 `specs/` 目录、自动建分支、扩展 hooks、整套命令安装机制。
- 「最多 3 个（specify）／最多 5 个（clarify）澄清问题」的数量上限。
- Spec Kit implement 命令的自动执行流程；任务模板的并行标记、用户故事阶段泳道与团队分工策略；「Tests are OPTIONAL——用户没明确要求就不写测试」的默认（本 Skill 反向规定：业务逻辑与缺陷修复必须带必要测试）。
- Spec Kit analyze 的 constitution 权威与违规即 CRITICAL、四级严重度分级、50 条发现上限与覆盖率统计指标、修复建议交互流程——本 Skill 只取只读核对与覆盖／冲突检查思路，差异不分严重度、一律交作者裁决。
- Archify 的其他四种图种、HTML 交付流程（`deliver`／`preview`／`visual-check`）、自动迁移（`migrate`）、品牌查询（`brands`）与更新检查（`check-update`）机制——第一版只做 workflow 制图＋校验。

## 外部依赖

- 1a 交付物（`assets/spec-template.md`、`references/specification.md`、本文件）：纯 Markdown，无运行时依赖。
- 1b-1 起 `references/workflow.md` 的校验流程依赖：Node，以及插件携带的 Archify vendor 副本（`vendor/archify-renderer/archify/`，内容指纹见上表，由维护者脚本统一管理，脚本不随包分发）。
- 1b-2 起 `references/project-contract.md`：纯 Markdown，无新增运行时依赖；其规则依据插件源码静态核对（来源见逐项对照末两行），不随插件版本自动更新，插件行为变化时须人工复核该文件。
- 1c 起 `SKILL.md`：入口文件，纯 Markdown，无新增运行时依赖；格式按 skill-creator 规范静态核对（见逐项对照末行），ZCode 侧 Skill 规范变化时须人工复核。
- 4a 起 `assets/plan-template.md`、`assets/tasks-template.md`、`references/implementation.md`：纯 Markdown，无新增运行时依赖。
- 4b 起 `references/evidence-review.md`：纯 Markdown；证据查证用业务仓库自带的 git（rev-parse／show，均只读），无新增运行时依赖。

## 许可声明

以下为 Spec Kit 的 MIT 许可原文（自 Spec Kit 1.0.4 的 LICENSE 逐字复制）：

```text
MIT License

Copyright GitHub, Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

以下为 Archify 的 MIT 许可原文（自 `vendor/archify-renderer/archify/LICENSE` 逐字复制）：

```text
MIT License

Copyright (c) 2026 tt-a1i (Archify)
Copyright (c) 2025 Cocoon AI

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---
name: specdev-business
description: 为SpecDev工作台制作或修改业务规格、workflow步骤图或lifecycle生命周期图、详情和固定提交源码依据；按用户问题选已接通图种，真实校验登记后交验收，保存须用户要求。实现与补证沿业务规范，不用于纯讨论或只读审查。
---

# SpecDev Business（业务设计与维护）

把一段业务需求做成管理页能读的一整套产物：**业务规格文档 → 按问题选图 → 详情与来源 → 管理页登记文件**。本文件是入口，只管顺序、纪律和交付边界；具体手艺在各参考文件里，按需读取，不在此重复。

**分段交付**：设计段面向新建设计与已有设计稿的修订，图与详情描述拟定设计（带明确标记）；新建设计证据清单留空不伪造，已有证据不因进入本流程清空。实现段在作者批准范围后按 [implementation.md](references/implementation.md) 组织（开工三问＋按需落 plan／tasks 文件），完成后按 [evidence-review.md](references/evidence-review.md) 补录证据并核对差异——两段已在真实登录业务实跑验证。已有业务再次修改按 [change.md](references/change.md) 走——修改段亦经登录业务实跑验证。无论哪段，本 Skill 都不宣称未经作者验收的内容已通过。

## 适用范围

- **用本 Skill**：制作或修改管理页可读的业务文档、workflow步骤图/lifecycle生命周期图及详情。第一版做新建设计或已有**设计稿**的修订；已授权的修改直接走「修改段入口」（[change.md](references/change.md)），从设计段主流程遇到已实现的图或已带真实证据的图时，保留原内容并与作者确认走向，不把已有实现重标成拟定设计、不清空已有证据。
- **纯讨论交方案**：作者问"有没有办法／有什么建议"时交付的是方案，不动手；实施须作者明确同意。
- **已批准的小功能**按授权执行，一次只做一个，不顺带扩大范围。
- **不做的**：代点保存版本、直接打快照标签、运行 deliver／preview／visual-check、迁移旧图、workflow/lifecycle以外的业务登记图种（边界见 [workflow.md](references/workflow.md) 与 [project-contract.md](references/project-contract.md) §4）。

## 设计段主流程（按序执行）

本流程做设计（规格、图、详情与管理页登记）；只做实现时走下方「实现段入口」，不重走本流程。

1. **确认业务与仓库**：业务名称、目标仓库、可提交分支、管理页地址与 repoRoot。缺失先问作者，不替作者选。动文件前检查目标仓的分支与工作区状态：首次修改前已有未提交改动，或过程中发现来源不明的改动，先问作者怎么处理；作者已明确允许保留并继续的，按批准范围操作，不重复询问。
2. **整理需求与未决项**：按 [specification.md](references/specification.md) §2 提取角色／动作／数据／约束并做歧义扫描；问题集中提出、附候选答案，等作者裁决，不吞掉问题自己猜。
3. **写业务规格**：用 [spec-template.md](assets/spec-template.md) 起草，写法按 [specification.md](references/specification.md)；拟定设计带明确标记，未定事项标【待裁决】；交付前过其 §6 自查。
4. **从文档制图**：先按[图种选择](references/diagram-choice.md)选workflow或lifecycle，再按 [workflow.md](references/workflow.md)分流到相应制图参考，守共同铁律（新建走随包3.0.1、旧图不迁移、ID稳定、节点和分支有文档出处、禁从HTML反提源）。主路径定不了说明规格还不够，先回去补规格，不硬画。
5. **节点详情与证据**：details.md 按 [project-contract.md](references/project-contract.md) §2.5 写——分节覆盖图上全部节点、守写作约束八条、四类分开说（拟定设计／已有实现／未实现／未核实）；新图源码只写官方 sources，逐段说明按 [source-pairing.md](references/source-pairing.md) 关联精确标签、按需写官方cards，evidence.json 仅 renderer 标记与空 refs；无实现设计不伪造来源。旧图保持原 evidence refs（§2.6），不因本流程清空。
6. **登记管理页文件与业务文档**：按 [project-contract.md](references/project-contract.md) §1、§2.1–2.3 补齐或维护三份说明文件（project.json／business.json／chart.json），已有文件只改要改的字段、其余原样保留；再把业务规格等文档路径登记进 business.json 的 `docs` 数组（仓库根相对路径），文档留在原位，只引用不搬动（§2.2）。
7. **校验与三条守恒自查**：跑 [workflow.md](references/workflow.md)分流后的校验命令，新图用随包 check-chart，旧图用旧validate五判据；失败按对应参考的诊断修复与两轮上限；再过 [project-contract.md](references/project-contract.md) §3 检查清单五项；最后逐条对照下方三条守恒关系。
8. **交结果**：按"交付报告"格式向作者汇报，等验收。
9. **按授权提交**：验收通过并确认分支后，只提交本功能相关内容。
10. **交作者查看**：交页面入口与检查点，效果由作者本人验收；仅用户要求保存时提醒在管理页手动保存相应阶段，Skill不代点/打标签（[project-contract.md](references/project-contract.md) §4）。

## 实现段入口

业务规格获批、作者明确批准实现范围后，按 [implementation.md](references/implementation.md) 进入实现段：

- 开工三问（怎么实现、影响哪里、每步验收什么）答清并经作者同意；简单功能不强制增加文件。
- 沿用主流程第 1 步（仓库／分支／工作区检查）与第 8–9 步（交付、按授权提交）的纪律，快照仍由作者手动、AI 不代点；**不重走第 2–7、10 步**——图未变化时复用已有校验证据，不重新画图、不默认走设计版保存提醒；规格需修订按 specification.md 走，受影响的图先列出影响（同步流程见 [change.md](references/change.md)）。
- 方案与任务引用规格编号，不重新定义规则；关键约束逐字进任务描述。
- 业务逻辑与缺陷修复必须带必要测试；差异如实报告，不代作者裁决。
- 实现完成并提交后，按 [evidence-review.md](references/evidence-review.md) 补录证据、做规格／图／详情／源码核对并交付六列差异报告；核对只读，差异先报告、经作者裁决再改，保存实现版仍由作者亲手点。
- 交付报告用实现段格式：任务完成情况（含失败与未验项）、测试命令与结果、差异与未决项、提交状态；页面类改动附入口与检查点。

## 修改段入口

要再改已有业务或其产物——改规则、改实现、纠错、补出处或缺件（不要求规格、图、详情、证据、快照齐备）——按 [change.md](references/change.md) 进入修改段：

- 核心口径：识别本次影响范围，更新受影响的实现和说明，验证新行为与相关旧行为，保留可追溯的历史。
- 先分清四样：文档现在怎么规定、代码实际怎么做、本次要改成什么、哪些还不清楚；旧文档可能过时，不当成实现事实。
- 不要求每次改齐六类文件：按修改情况（文字纠错／行为不变重构／规则变化／补出处）取用；语义未变的 ID 稳定，未受影响的图不重做，旧证据不因代码变化自动失效——相关实现变了才更新引用。
- 沿用主流程第 1 步（仓库／分支／工作区检查）的纪律；交付用 change.md §6 的四件事格式，不套设计段固定报告；按授权提交；确需登记版本时按实际阶段提醒保存（不默认提醒保存设计版），保存可能返回已有快照，以实际返回为准。
- 规则分层：通用要求在 change.md；Archify 产品约束引用各约定文件；审批次数、修复轮数、页面验收等工作习惯按目标项目规则执行（在哪个项目，就用哪个项目自己的守则）。

## 按需读取

| 要做什么 | 先读 |
|---|---|
| 写或改业务规格 | [assets/spec-template.md](assets/spec-template.md) ＋ [references/specification.md](references/specification.md) |
| 组织实现方案与任务拆解 | [references/implementation.md](references/implementation.md) ＋ [assets/plan-template.md](assets/plan-template.md) ＋ [assets/tasks-template.md](assets/tasks-template.md) |
| 补录源码证据、核对差异并出差异报告 | [references/evidence-review.md](references/evidence-review.md) |
| 修改已有业务（改规则、改实现、纠错、补出处） | [references/change.md](references/change.md) |
| 选择图种 | [references/diagram-choice.md](references/diagram-choice.md) |
| 画图、自检、修校验失败 | workflow按[references/workflow.md](references/workflow.md)，lifecycle按[references/lifecycle.md](references/lifecycle.md)；排版拥挤按[references/layout-simplification.md](references/layout-simplification.md) |
| 落盘文件、详情、证据、登记、保存边界 | [references/project-contract.md](references/project-contract.md) |
| 追溯某约定借自哪个外部来源 | [references/source-map.md](references/source-map.md) |

同一会话已读且未变化的内容直接复用；引用链接是索引，只展开当前步骤用到的文件，不递归读完全部引用。

## 三条守恒关系（交付前逐条自查）

1. **文档定义规则，图帮助阅读**：图上的业务判断与有含义的分支，须能对应文档规则编号或显式的待裁决标记；发现图有文档没说的规则要指出，不擅自补完当作已同意。
2. **代码与设计不一致要摆出来由作者裁决**，不许改文案让三份内容表面一致。
3. **有源码出处 ≠ 业务正确**：实现事实、测试结果、业务差异分别报告。

## 阶段边界

- 拟定设计可带明确标记（如【设计】前缀、标题行注明"设计版"）供讨论；带标记不等于已批准。
- 待裁决事项不得当已批准规则进入实现。
- 设计段、实现段、证据核对与修改指引均已就位；证据补录、差异核对与修改指引均已在真实登录业务实跑验证；新版节点来源已在页内读取；旧图保留原证据路径。

## 交付报告（固定格式，设计段）

实现段不套用本格式，按「实现段入口」的报告项交付。

1. **文件路径**：新增／修改的每个文件。
2. **规则出处**：图上节点与分支 ↔ 业务文档规则编号的对应；对不上的列为待裁决。
3. **校验命令与结果**：所用新旧校验命令原文及对应结果、检查清单五项结果。
4. **未决项**：待裁决问题清单，无则写"无"。
5. **页面入口和检查点**：管理页地址、业务／图位置、作者该重点看什么。
6. **提交状态**：分支与提交号，或注明"未提交，待验收"。
7. **保存边界**：仅用户要求保存时提醒在管理页亲手保存相应阶段，不自动提交项目或打快照标签。

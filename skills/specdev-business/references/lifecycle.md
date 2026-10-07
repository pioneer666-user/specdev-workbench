# 生命周期图制作、维护与阅读

选型先读[diagram-choice.md](diagram-choice.md)。只取同一对象的真实状态/动作与依据；新建设计标【设计】，已有实现按固定提交核事实，拒绝虚构审核/撤回。

1. 按[project-contract.md](project-contract.md)维护项目/业务登记，图目录的chart.json为`{"schema":"specdev/chart/2","id":"<图ID>","name":"<中文名>","diagramType":"lifecycle"}`。固定lifecycle.json/details.md/evidence.json，不能混workflow源或自定义sourceFile。
2. 从实际Skill目录向上两级找同包；仅按需读vendor/archify-3.0.1/archify/schemas/lifecycle.schema.json及common定义，不装依赖/升级上游。schema_version=2、diagram_type=lifecycle、main泳道、states/transitions，默认standard；state和transition各自稳定唯一显式ID，端点是本图state.id，官方类型/col/布局字段不自创。
3. 编写`## state:<id>`与`## transition:<id>`，覆盖每个实体且每节唯一。状态小节用`###`与独立`（源码引用 精确标签）`关联本状态sources.label，复用[source-pairing.md](source-pairing.md)，同名来源不借其他状态。转移节只写其条件/动作/结果，没有官方sources/refId；真实源码声明拒绝，围栏仅示例，不串同ID状态和转移。
4. 已实现来源只在states.sources/meta.repository维护一份，每状态1–3条，路径/精确行范围/现存origin/40位固定提交、单repository/revision和权限边界沿[workflow-301.md](workflow-301.md)“唯一源码来源”。无实现设计省略repository/sources。evidence.json为`{"schema":"specdev/evidence/1","renderer":"3.0.1","refs":[]}`，不伪造origin、提交或旧refs/runtime refId。
5. 动作短label留图，完整条件优先按[lifecycle简化](layout-simplification.md)保全到官方cards。状态表/转移说明保留依据；不要把操作步骤当状态。修改沿[change.md](change.md)，语义未变ID/标签稳定，来源标签改变同步小节声明，受影响部分重新校验。
6. 调`node "<包根>/dist/check-chart.js" "<Git仓根>" <业务ID> <图ID> --json`。0通过、1内容问题、2不能检查；检查实体/说明、配对/来源、实际官方渲染与固定源码读取，报告stateCount/transitionCount/referenceCount/qualityProfile/officialWarnings，不输出正文/HTML。按诊断修具体问题，保全失败与两轮停点，不自动重试原生异常。
7. 从业务页或房间同一read入口查看；原生状态信息卡选来源，页内按固定提交逐段读；“全部阅读资料”有状态/转移列表，转移无源码按钮。历史snapshot/2读取自己的描述/四文件，当前修改不污染旧历史。

只有用户要求才提醒在管理页手动保存，不自动提交真实项目或打标签。四文件须与已提交HEAD一致，快照绑定diagramType/sourceFile/fingerprintScheme；旧workflow三文件/旧快照不迁移，不在原chartId换图种。

最小可执行设计例（有实际实现时先查证再补来源；此例不编造源码）：

```json
{"schema_version":2,"diagram_type":"lifecycle","meta":{"title":"对象生命周期（设计）","output":"state.html","quality_profile":"standard","locale":"zh-CN"},"lanes":[{"id":"main","label":"对象状态"}],"states":[{"id":"draft","type":"start","label":"草稿","lane":"main","col":0},{"id":"active","type":"active","label":"使用中","lane":"main","col":1}],"transitions":[{"id":"publish","from":"draft","to":"active","label":"发布"}],"cards":[{"dot":"cyan","title":"转移条件","items":["草稿→使用中：满足项目已认可的发布条件。"]}]}
```

对应details.md至少`## state:draft`、`## state:active`、`## transition:publish`三节，正文【设计】且按项目规定的条件填写，示例条件不是实现事实。真实交付须技术/语义核对、作者验收与未验边界分别说明，不把受控制作冒称陌生AI自然试用。

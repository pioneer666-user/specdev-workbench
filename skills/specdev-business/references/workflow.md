# workflow 制作入口

先按[图种选择](diagram-choice.md)识别用户问题；用户指定lifecycle或chart.json为chart/2 lifecycle时走[lifecycle.md](lifecycle.md)，不把生命周期源放workflow.json。此页后续三文件/nodes要求仅workflow；两种图共享默认standard与[排版质量边界](layout-simplification.md)。

新建图默认使用随包 Archify 3.0.1，读 [workflow-301.md](workflow-301.md)。
修改已有图先核当前三文件：evidence.json 缺省 renderer 用 [workflow-legacy.md](workflow-legacy.md)，明确 3.0.1 用新版；非法值或新版与非空 refs 冲突先报告，不自动迁移、清证据或降版。schema_version、sources 或能否编译不用于猜版本。

共享要求：先确认业务规格与实现事实，稳定节点ID，节点和分支对应规格；长说明按同ID写 details.md。新图唯一源码引用为官方 nodes[].sources；旧图继续 evidence.refs。保存三个文件的版本由作者手动进行，不代打标签、不交HTML。两轮修复仍失败即停；崩溃或未确认终止立即停，不重试。校验通过只证明技术结果，语义核对和作者验收仍保留。

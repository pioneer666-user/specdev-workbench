# Archify 3.0.1 workflow 制作与校验

## 同包定位与真实契约

从实际 resourceBase.path（或 SKILL.md 所在目录）向上两级定位 SpecDev 工作台包根。仅使用该包 vendor/archify-3.0.1/archify/schemas/workflow.schema.json 和 common.schema.json；读取当前制图需要的定义，不加载研究仓，不安装或升级 Archify。随包 manifest.json 与 VERSION.md 给出固定闭包与许可，校验命令核验字节。

新图使用 schema_version:2、diagram_type:workflow；必需 meta/lanes/nodes/edges，meta.title 和 meta.output 必填。meta.output 写安全相对 HTML 名（如 chart.html），但插件只在仓外独占临时目录渲染内存副本，不在业务仓落 HTML。quality_profile默认写standard，不要求showcase；排版拥挤按[官方简化](layout-simplification.md)，不降低语义/来源门禁。节点 lane/col/type/label 与连线字段以官方 schema 为准，col 为0..5；ID稳定，禁止自创字段，不从HTML反提图。

## 制作顺序

1. 确认业务需求和已有实现事实，业务规格写稳定规则编号，拒绝分支不遗漏。
2. 由规格确定主路径、泳道和稳定节点；正常审批/等待不自动当异常。mainPath 相邻节点有对应连线，业务分支写清条件；不删分支、标签或证据来让布局通过。
3. 写官方 workflow JSON。已有实现先按固定提交查证来源，再写 sources；无实现的拟定设计不写 repository/sources，不编造提交或仓库地址。
4. 写 details.md 的 ## 节点ID 分节，覆盖全部节点、每ID唯一，长解释留在这里，短说明和来源使用官方字段；四类状态按 project-contract.md §2.5 区分。逐段解释以独立“（源码引用 精确标签）”声明节点来源关联，规则与短例见 [source-pairing.md](source-pairing.md)；不维护第二套路径清单或HTML。按需用官方cards写有依据的阅读提示。
5. 维护 project/business/chart 登记、规格文档引用；新图 evidence.json 写 {"schema":"specdev/evidence/1","renderer":"3.0.1","refs":[]}，详情与图一同提交遵循目标项目授权。
6. 调随包只读命令，保留诊断；交业务/房间入口；用户要求保存时提醒亲手保存版本。

起步用清晰主路径与短分支，不搬官方示例业务事实；可参考以下形状（提交、来源必须以真实核对结果替换；无实现时整块 repository 与 sources 都省略）：

```json
{
  "schema_version":2,"diagram_type":"workflow",
  "meta":{"title":"报名资格校验","output":"chart.html","quality_profile":"standard","locale":"zh-CN",
    "repository":{"url":"<该仓已存在origin的规范身份>","revision":"<已存在完整40位提交>","link_mode":"local-only"}},
  "lanes":[{"id":"main","label":"主流程"}],
  "mainPath":["check","done"],
  "nodes":[
    {"id":"check","lane":"main","col":0,"type":"backend","label":"检查报名资格",
      "sources":[{"path":"src/eligibility.js","line":1,"end_line":8,"label":"资格判断"}]},
    {"id":"done","lane":"main","col":1,"type":"database","label":"生成记录"}],
  "edges":[{"id":"check-done","from":"check","to":"done"}]
}
```

## 唯一源码来源与限制

nodes[].sources 的 path/line/end_line/label 按官方 sourceReferences 定义；meta.repository 的 url/revision/link_mode 按 repository 定义。先 git rev-parse 核完整固定提交，再 git show 该提交的文件核精确行范围，引用最小连续事实段，不按工作树估行号。一个节点可有1–3条官方来源；按实际必要事实取用，不固定两条。

同图只有一个官方 repository/revision。现有旧图使用多提交或其他不支持情况时保持旧图；不暗中压成同一提交。revision 必须是已存在提交；未提交实现先请求适用提交授权，不偷提交、不写 HEAD。origin 身份必须匹配现存仓，local-only 是官方支持的页内来源方式，仍需合法的已存在远程身份；没有可用 origin 就报告前提不足，不改 origin 或推远端来凑。私有仓无需公开，也不会联网补对象。新版来源由 T17映射并按固定对象读取；refs=[]只兼容容器，不表示无官方证据。无来源设计须明确标【设计】，不能当已实现。

## 可用校验入口

```text
node "<包根>/dist/check-chart.js" "<仓根>" <业务ID> <图ID> --json
```

只检查已登记新版workflow当前三文件，节点详情覆盖/标记冲突/逐段标签关联、真实官方渲染与每条固定源码读取。0=通过，1=内容不通过，2=参数或运行无法检查；成功 JSON 的 ok:true、kind:checked、renderer:3.0.1，并报告节点/引用数，设计图可为0引用。成功不输出正文/HTML。

命令只读业务文件和Git，无任意候选路径、输出路径、命令选项；临时HTML在仓外且清理，异常保留证据。旧图收到 legacy-chart 应回旧校验入口，不迁移。失败看 diagnostics 的 stage/code/message、nodeId/refId 与官方原诊断，保留原错误；只修确切问题，不降版或删语义，同问题累计两轮仍失败停。render-native-abnormal 或 render-stop-unconfirmed 立即停交维护者，T17终止问题已到原停点，不另名重试。

校验不证明规则正确，不代作者视觉；source真实、测试通过、业务一致分别核对。新版阅读默认由所选版本的 evidence 标记选择；显式 renderer=legacy/3.0.1 可覆盖且随历史切换保留，自动状态按历史自身重新选择，错误不静默降版。

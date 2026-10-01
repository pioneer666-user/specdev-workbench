# 房间诊断与修复方向

先读 stage、code、message，再结合 fieldPath、instanceIds、targetId、sourcePath 及 causeCode。以下来自当前校验器的常见码，未列出的码保留原文报告，不伪造成功。字段规则见 [房间契约](room-contract.md)，工作边界见 [技能入口](../SKILL.md)。

| 来源 | 实际诊断码 | 处理 |
|---|---|---|
| 结构/身份引用 | STRUCT_INVALID、ID_DUPLICATE、REF_UNKNOWN、YAW_INVALID、PLACEMENT_UNSUPPORTED | 按原实例身份核对必填字段、资产/区域、朝向及放置类型；去掉自己新增的非法字段，不重编号整屋或发明资产 |
| 越界/重叠 | OUT_OF_BOUNDS、FURNITURE_OVERLAP | 对指明实例的完整旋转实体改位置/朝向或选可容纳资产；相接允许，不能改 bounds 掩盖 |
| 门口/通路/操作空间/站位 | RESERVED_BLOCKED、CLEARANCE_BLOCKED、STAND_UNREACHABLE | 保留固定模板，移动相关家具使门口、通路、人形净空和操作站位满足要求；不能只查中心点 |
| 父项/承载 | PARENT_UNKNOWN、SELF_ATTACH、ATTACH_CYCLE、ATTACH_DEPTH、SURFACE_UNKNOWN、SURFACE_OVERHANG、CATEGORY_NOT_ALLOWED | 保留合法父实例与局部关系，核对一层依附、承载面 ID/类别、旋转后完整边界；修局部偏移，不另写世界位置或让孤儿落地 |
| 绑定身份/动作 | BINDING_INPUT、BINDING_BUSINESS_MISMATCH、BINDING_DUPLICATE_TARGET、BINDING_UNKNOWN_INSTANCE、BINDING_UNKNOWN_ASSET、BINDING_ACTION_UNSUPPORTED、BINDING_CAPABILITY_MISSING | 核对实例、资产能力与唯一动作 open-document-collection；保留原集合语义，不能绑定到没有能力的灯/桌 |
| 登记文档 | BINDING_DOCUMENT_UNREGISTERED、BINDING_DUPLICATE_DOCUMENT、DOCUMENT_UNREADABLE | 核对本业务原始登记路径及实际正文，读取失败看 sourcePath/causeCode；清单/资料修复超出本技能，报告作者；不造正文、删登记或清空 bindings 规避 |
| 绑定流程图 | BINDING_CHART_UNREGISTERED、BINDING_DUPLICATE_CHART、BINDING_CHART_UNAVAILABLE | 核对图 ID 属于本业务图目录（读 chart.json 确认 id/名称/归属）；不在本业务、集合内重复、图说明坏或编号重名冲突分别对应上述码。不凭编码/裁剪/改名修 ID，不拿其他业务的图替代，不扫别的业务凑图，不往 business.json 加 charts 登记 |
| 图文件读取（charts 阶段） | CHART_UNAVAILABLE、CHART_UNREADABLE、CHART_JSON_INVALID | CHART_UNAVAILABLE 看 targetId 与原因（登记图坏说明/重名）；CHART_UNREADABLE 复查 workflow.json 是否缺失、读不开或超限（causeCode 有则附）；CHART_JSON_INVALID 表示 workflow.json 不是合法 JSON 或顶层不是对象。图的修复与重编译归 specdev-business；本检查不验证图已编译或可渲染 |
| 模板选择 | TEMPLATE_UNKNOWN | 只选当前模板目录中存在的 templateId，不回退未请求的模板 |
| 配置/清单读取 | bad-request、not-found、bad-business、bad-inventory、no-convention-root、no-room-layout、bad-room-layout、room-business-mismatch、file-too-large | 按原码核对 Git 顶层、目标清单与配置；仅有旧根交另定迁移。新建前 no-room-layout 可按创建授权继续；自己写坏的 room.json 最小修正，已有身份冲突不强行改归属 |
| 包资源 | ROOM_RESOURCE_READ、TEMPLATE_INPUT、LIBRARY_READ、LIBRARY_INDEX、LIBRARY_ASSET | 这些 LIBRARY_* 为家具目录读取/索引/单资产诊断；核对实际运行包定位、资源及版本，报告维护问题，不改用户布局掩盖，不自行构建/安装/改元数据 |

部分实例错误的 fieldPath 指向 catalog.assets 或 template.reservedVolumes，并不表示应修改目录。例如 SURFACE_UNKNOWN 可是当前实例 surfaceId 写错；OUT_OF_BOUNDS 可是布局放错。结合实例及 message 判源，目录和模板始终只读；确为契约坏则交维护。

每次实际调用记退出码和完整 JSON。退出 2 不全部等于安装损坏；只有 0、kind=checked、ok=true 是数据通过。运行/JSON 解析失败不算通过。校验会读取全部登记资料（文档与流程图，未绑定的也检查）；图的检查到 workflow.json 读取与 JSON 语法为止，不等于图已编译或渲染通过。每轮只修当前问题，同一问题累计两轮未解决就带证据返回，不绕校验。程序不会替 AI 修文件；美术与行走/点击仍待作者验收。

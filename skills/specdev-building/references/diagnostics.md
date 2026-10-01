# 诊断目录（按码修，一轮只修一类）

命令：`node "<插件包根>/dist/check-building.js" <项目仓库根>`（加 `--json` 给机器读的结构）。
退出码：`0` 通过（可含 warning）、`1` 有 error、`2` 读不了（缺清单、坏 JSON、不是 Git 仓库顶层、路径不存在）。

**修复对象**三档（与插件 `src/core/diagnosis.ts` 的 `FIX_TARGETS` 逐码一致，回归钉住）：

- **改蓝图**——按 `subject.path` 回 `docs/specdev/building.json` 改；
- **改清单或资料**——改蓝图改不好，报告作者或先修清单/资料（`specdev-business`）；
- **按证据判**——对照 `subject.ids` 与项目清单核对，默认先核查蓝图，清单的取舍交作者决定。

**修法**：一轮只修一类，改完用同一条命令重跑；**同一问题两轮修不成**，停下交证据与疑点给作者。诊断里的 `ids` 在 `subject.ids`（不是 `evidence`）；`evidence` 里是佐料（业务名、文件路径、冲突对象）。

## 一、输入与形状

| 诊断码 | 级别 | 修复对象 | 怎么改 |
|---|---|---|---|
| `INPUT_TYPE` | error | 改蓝图 | 字段类型写错（数值写成字符串、`rect` 写成数字等）→ 按契约改回类型 |
| `INPUT_ENUM` | error | 改蓝图 | 取值不在允许集合里（`kind`／`side`／`type`／`phase`／`style`／`prototype`／`wallType`）→ 用契约里的允许值 |
| `INPUT_PATTERN` | error | 改蓝图 | id 格式不合法：蓝图 id 只能小写字母开头、由小写字母/数字/连字符组成；`businessId` 另见契约 |
| `INPUT_EMPTY` | error | 改蓝图 | 必填字符串是空的 |
| `INPUT_UNKNOWN_FIELD` | error | 改蓝图 | 出现未定义字段（拼错一个字母也算）→ 删掉或改成契约里的字段名 |
| `INPUT_REQUIRED` | error | 改蓝图 | 缺必填字段 → 按契约补 |
| `DEFAULT_RANGE` | error | 改蓝图 | `defaults` 越界：厚度 (0, 0.6]、门高 (0, 8] |
| `EMPTY_BUILDING` | error | 改蓝图 | 没有楼层或没有空间 → 至少一层、一个空间 |
| `INPUT_LIMIT` | error | 改蓝图 | 超规模上限：240 空间／24 层／2000 开口／96 跑楼梯／240 屋顶 |
| `ID_DUPLICATE` | error | 改蓝图 | id 在蓝图内重复（楼层、空间、开口、楼梯、屋顶共用一个命名空间）→ 改成唯一 |

## 二、身份与绑定（清单 ↔ 蓝图）

| 诊断码 | 级别 | 修复对象 | 怎么改 |
|---|---|---|---|
| `BLUEPRINT_SHAPE` | error | 改蓝图 | `spaces` 结构不对、缺非空 `id`、id 重复，或 `directory` 不是布尔（`"false"`／`0` 都不算关） |
| `BUSINESS_REQUIRED` | error | 改蓝图 | 房间缺 `businessId` → 补上清单里的业务 id（`subject.path` 就指向该房间的 `businessId`） |
| `BUSINESS_NOT_ROOM` | error | 改蓝图 | 非 `room` 空间带了 `businessId` → 删掉该字段，或把这个空间改成 `room`（业务身份只落在房间上） |
| `BUSINESS_DUPLICATE` | error | 改蓝图 | 同一业务被两间房绑定 → 删掉多余那间，或改绑别的业务（`evidence.firstAt` 指首次绑定处） |
| `BUSINESS_MISSING` | error | 按证据判 | `subject.ids` 是"没有房间的业务 id"：默认在蓝图里加一间房；这个业务该不该留在清单里由作者裁决 |
| `BUSINESS_UNKNOWN` | error | 按证据判 | 蓝图写的业务 id 不在清单 → 对照 `subject.ids`（业务 id 与空间 id）与项目清单，先改蓝图指向清单里的真实 id；清单确实没登记该业务才交作者 |
| `MATERIAL_NO_ENTRY` | error | 改蓝图 | 该业务**已绑房**却没有资料入口 → 用 `evidence.businessId` 找到对应房间，检查它的 `directory` 是否被关掉（`false` 就没有目录） |

## 三、资料可读性

| 诊断码 | 级别 | 修复对象 | 怎么改 |
|---|---|---|---|
| `MATERIAL_UNREADABLE` | error | 改清单或资料 | 登记的文档不存在或读不开（超过 2 MiB、权限）、`workflow.json` 缺失或读不开、业务/图说明文件坏、图编号冲突 → **改蓝图解决不了**：按 `evidence` 里的 `path`／`chartId`／`reason` 核对文件本身，报告作者或交 `specdev-business`。注意装配层只检查 `workflow.json` 能不能读、**不解析内容**，语法坏要到阅读页打开时才现形 |

## 四、楼层、空间与排布

| 诊断码 | 级别 | 修复对象 | 怎么改 |
|---|---|---|---|
| `FLOOR_REF` | error | 改蓝图 | 空间的 `floorId` 指向不存在的楼层 |
| `FLOOR_RANGE` | error | 改蓝图 | 楼层净高不在 2.6—12 米，或标高绝对值超过 500 |
| `SPACE_DIMENSION` | error | 改蓝图 | 空间边长不在 1.6—200 米，或坐标绝对值超过 1000 |
| `SPACE_HEIGHT` | error | 改蓝图 | 空间墙高不在 2.6—12 米 |
| `SPACE_OVERLAP` | error | 改蓝图 | 同层空间内部相交 → 改成贴边（共边可以，重叠不行；差 0.1 米既不是共边也会各建一堵墙） |
| `FLOOR_CLEARANCE` | error | 改蓝图 | 上下层空间净空不足或楼板相交 → 上层地坪 ≥ 下层地坪 ＋ 下层墙高 ＋ 楼板厚 |
| `SHARED_WALL_CONFLICT` | error | 改蓝图 | 共墙两侧房间的墙高与墙材必须一致（`evidence` 给出冲突的房间） |
| `ENTRY_POSITION` | error | 改蓝图 | 入口必须落在已登记空间内、离边缘 ≥ 0.35 米；放置时还要留出人身半径，别贴着墙（贴墙会出现"生成合法但一进去就卡住"） |
| `SPACE_UNREACHABLE` | error | 改蓝图 | 从入口走不到这个空间 → 补门、接楼梯，或让它与相邻非房间空间贴边 |

## 五、开口（门与窗）

| 诊断码 | 级别 | 修复对象 | 怎么改 |
|---|---|---|---|
| `OPENING_ROOM` | error | 改蓝图 | 开口只能挂在 `kind: "room"` 的空间上 |
| `OPENING_SIZE` | error | 改蓝图 | 尺寸或位置越界：门宽 ≥ 0.95、门高 ≥ 2.2；窗宽 ≥ 0.2；墙角各留 0.2 米；`sill + height` ≤ 净高 − 0.12 |
| `DOOR_CONNECTION` | error | 改蓝图 | 门必须落在来源房间与 `to` 空间**同层的共边**上，且没有门槛 → 先让两间贴边，再把门移进共边范围 |
| `WINDOW_CONNECTION` | error | 改蓝图 | 窗不能声明 `to`（窗不做可通行连接） |
| `OPENING_PARTITION` | error | 改蓝图 | 门跨过了共墙分区端点 → 挪门；或让房间与目标空间的共边更长（同一墙线上每段共边是独立墙段） |
| `OPENING_OVERLAP` | error | 改蓝图 | 同一墙面开口重叠；跨房间共墙的门只登记一次（两边各写一扇会重叠） |

## 六、楼梯

| 诊断码 | 级别 | 修复对象 | 怎么改 |
|---|---|---|---|
| `STAIR_FLOORS` | error | 改蓝图 | 楼梯要从低层空间连到高层空间（不同层，`to` 更高） |
| `STAIR_ENDPOINT_KIND` | error | 改蓝图 | 楼梯端点不能是房间 → 接走廊、平台或庭院 |
| `STAIR_GEOMETRY` | error | 改蓝图 | 宽 1.2—8 米、坡度 ≤ 45°（水平长度 ≥ 上升高度）、2—120 级整数、只能沿 X 或 Z 一个方向 |
| `STAIR_LANDING` | error | 改蓝图 | 端点要落在平台边界上：平台沿行进方向向外留 ≥ 0.6 米，左右容得下梯宽 |
| `STAIR_SPACE_INTERSECTION` | error | 改蓝图 | 楼梯投影与平层空间相交 → 把楼板拆成避开梯井的矩形（别用一块大矩形盖满整层） |
| `STAIR_INTERSECTION` | error | 改蓝图 | 楼梯之间头部净空不足 2.2 米 |
| `STAIR_COMFORT` | warning | 改蓝图 | 踏步偏陡或偏窄（> 0.22 米高、< 0.24 米宽）→ 调步数与水平长度；可保留，但要在交付说明里写明 |

## 七、屋顶

| 诊断码 | 级别 | 修复对象 | 怎么改 |
|---|---|---|---|
| `ROOF_REFS` | error | 改蓝图 | 屋顶引用了不存在或重复的空间 id |
| `ROOF_RECTANGLE` | error | 改蓝图 | 同一屋顶引用的空间必须同层、同墙顶标高，且并集正好是完整矩形（不能有空洞，也不能用一个大矩形无意盖上中庭） |
| `ROOF_SIZE` | error | 改蓝图 | 挑檐 0—2 米；坡顶 `rise` ∈ (0, 8]（省略按 1.8）；平顶省略 `rise` 或写 `0`，写其它值才报错 |
| `ROOF_UPPER_FLOOR` | error | 改蓝图 | 屋顶穿进了上层空间 → 只给顶层做屋顶，或缩小范围 |
| `ROOF_INTERSECTION` | error | 改蓝图 | 两个屋顶的包络相交（本版不自动处理交接屋脊）→ 合并或错开 |
| `ROOF_MISSING` | warning | 改蓝图 | 该房间上方没有完整覆盖的屋顶 → 补屋顶；确实不补要在交付说明里写明理由 |

## 八、状态声明

| 诊断码 | 级别 | 修复对象 | 怎么改 |
|---|---|---|---|
| `STATE_EVIDENCE_REQUIRED` | error | 改蓝图 | 声明 `implementation: present`／`tests: passed`／`acceptance: passed` 必须给出处 → 没出处就退回 `unknown`／`pending` |
| `STATE_CONTRADICTION` | error | 改蓝图 | `tests`／`acceptance` 为 `passed` 但实现不是 `present`；或 `approval: approved` 但设计不是 `detailed` |
| `ACCEPTANCE_INCOMPLETE` | error | 改蓝图 | `phase: "accepted"` 要求每间业务房设计批准、实现、测试、验收记录齐备 → 建房阶段不要写 `accepted`，这四种事实由作者裁决 |

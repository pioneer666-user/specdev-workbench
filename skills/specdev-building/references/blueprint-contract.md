# 蓝图契约（字段、取值、默认值）

**以生成器为准，本表是索引**：字段行为的唯一来源是插件 `src/core/house.ts` 的 `blueprintRule` 与几何检查；本表与它不一致时以代码为准，并回报作者修订本文件。写蓝图前逐项对照一遍，比事后看诊断便宜得多。

形状校验**不容错**：出现未定义字段（拼错一个字母也算）直接 `INPUT_UNKNOWN_FIELD`。

## 1. 顶层

| 字段 | 必填 | 取值 | 说明 |
|---|---|---|---|
| `format` | ✓ | `"specdev-building"` | 固定 |
| `schema` | ✓ | `"specdev/building/1"` | 固定 |
| `units` | ✓ | `"m"` | 固定，米 |
| `style` | ✓ | `"warm-modern"`／`"chinese-timber"` | 影响配色与构件材质，**不影响几何与诊断**；怎么选见 SKILL.md 选型表的"风格"列（跟各户型样板同款：`single`／`row`／`tower` 一族 `warm-modern`，`court` `chinese-timber`） |
| `defaults` | | `{wallThickness, slabThickness, doorHeight}` | 厚度 ∈ (0, 0.6] 米、门高 ∈ (0, 8]；**整块可以省略**，省略即 0.18／0.18／2.5（`single.json` 里那一块就是这个值——写它和省略**等价**）；也可以只写要改的字段。**只有"写与缺省相同的值"才等价**：改墙厚／楼板厚会改构件尺寸与楼层净空，改门高会改门洞与漫游落点 |
| `floors` | ✓ | 数组，至少一条 | 见 §2 |
| `spaces` | ✓ | 数组，至少一条 | 见 §3 |
| `openings` | | 数组 | 见 §4 |
| `stairs` | | 数组 | 见 §5 |
| `roofs` | | 数组 | 见 §6 |
| `construction` | | `{phase, status}` | 缺省 `design` ＋ 全 pending／unknown，见 §7 |
| `entry` | ✓ | `{spaceId, x, z}` | 必须在已登记空间内，且离该空间边缘 ≥ 0.35 米 |

规模上限：≤ 240 空间、≤ 24 层、≤ 2000 开口、≤ 96 跑楼梯、≤ 240 屋顶（`INPUT_LIMIT`）。

可选数组（`openings`／`stairs`／`roofs`）不需要时**省略或写空数组都合法**、几何一样：照抄样板即可（`row.json` 里就写着 `"stairs": []`）。

## 2. floors[]

| 字段 | 必填 | 取值 |
|---|---|---|
| `id` | ✓ | `^[a-z][a-z0-9-]*$`，全文件唯一 |
| `name` | ✓ | 非空字符串（如 `一层`） |
| `elevation` | ✓ | 数字，该层楼板上表面标高；绝对值 ≤ 500 |
| `height` | ✓ | 2.6—12（室内净高，不含楼板） |

## 3. spaces[]

| 字段 | 必填 | 取值 |
|---|---|---|
| `id` | ✓ | `^[a-z][a-z0-9-]*$`，全文件唯一 |
| `kind` | ✓ | `room`／`corridor`／`terrace`／`yard` |
| `floorId` | ✓ | 必须指向已登记楼层 |
| `rect` | ✓ | `{x, z, width, depth}`：`x`／`z` 是**中心**坐标；边长 1.6—200 米；坐标绝对值 ≤ 1000 |
| `businessId` | room 必填 | **只填业务目录名**（如 `account-access`），不带 `docs/specdev/` 前缀；一个业务只能绑一间房 |
| `directory` | | 布尔；缺省＝开。`false` 会关掉该房间的资料目录 → 该业务的资料全部报 `MATERIAL_NO_ENTRY`，只在作者要求时用 |
| `name` | | 非 room 空间的显示名（room 的显示名以清单为准）；可照抄样板（走廊「南廊」、前庭「前庭」），不影响校验 |
| `prototype` | | `foyer`／`studio`／`archive`／`review`／`observatory`：只影响色调与标签，**不参与户型算术**；建房 v1 **一律省略**（省略即 `studio`，五份样板都没用它） |
| `height` | | 2.6—12；缺省跟随所在楼层 |
| `accent` | | `#rrggbb`；省略时随 `prototype` 取色——建房 v1 不写 |
| `wallType` | | `plaster`／`brick`／`timber`，**省略即 `plaster`**；共墙两侧的房间必须同墙高、同墙材（否则 `SHARED_WALL_CONFLICT`）——比的是**两侧的最终取值**，所以两侧都不写＝两侧都 `plaster`（一致）；要写就两侧写同一个值 |
| `status` | | 建造状态，见 §7 |

几何硬约束：

- `rect` 是**墙中心线**范围：室内净尺寸还要扣掉墙厚（`defaults.wallThickness`）。
- 同层空间**不许内部重叠**，可以共边（差 0.1 米既不是共边也不算重叠，会各建一堵墙）。
- 上下层空间重叠时，必须留出净空：下层顶 ≤ 上层地坪 − 楼板厚（`FLOOR_CLEARANCE`）。
- 房间（`room`）必须有门；从入口经门、楼梯、相邻非房间空间要能走遍每个空间（`SPACE_UNREACHABLE`）。

## 4. openings[]（门与窗）

| 字段 | 必填 | 取值 |
|---|---|---|
| `id` | ✓ | `^[a-z][a-z0-9-]*$`，全文件唯一 |
| `kind` | ✓ | `door`／`window` |
| `spaceId` | ✓ | 必须是 `kind: "room"` 的空间（开口只挂在房间上） |
| `side` | ✓ | `north`／`south`／`east`／`west`（世界坐标的四个方向） |
| `offset` | ✓ | **相对该墙中心**的距离（米），不是"从左数第几块"；南北墙沿 +X 增大，东西墙沿 +Z 增大 |
| `width` | ✓ | 门 ≥ 0.95；窗 ≥ 0.2；且 ≤ 房间该边长度 − 0.4（墙角各留 0.2 米） |
| `height` | | 门省略时取 `defaults.doorHeight`（`defaults` 缺省 2.5，**必须 ≥ 2.2**，否则所有门报错）；窗缺省 1.2；`sill + height` ≤ 空间净高 − 0.12 |
| `sill` | | 门缺省 0（**门不许有门槛**）；窗缺省 1（窗台高） |
| `to` | 门必填 | 门通向的空间 id，见下 |

门的额外要求（`DOOR_CONNECTION`）：

- 必须落在**来源房间与 `to` 空间的共边**上，同一层，且整扇门都在共边范围内；
- 跨房间的共墙只登记**一次**门，两边各写一扇会重叠（`OPENING_OVERLAP`）；
- 门不许跨过共墙的分区端点（`OPENING_PARTITION`）：同一面墙线上，每个房间与走廊的共边是独立墙段，门要整扇落在其中一段里。

窗：`to` 一律不写（`WINDOW_CONNECTION`）。

## 5. stairs[]（只支持轴向直跑梯）

| 字段 | 必填 | 取值 |
|---|---|---|
| `id` | ✓ | 同上 |
| `from`／`to` | ✓ | `{spaceId, x, z}`；端点空间**不能是 room**（走廊／平台／庭院），必须不同层且 `to` 更高 |
| `width` | ✓ | 1.2—8 米 |
| `steps` | ✓ | 整数 2—120 |

硬约束：

- 只能沿 X 或 Z 一个方向（`dx`、`dz` 至多一个非零）；
- 水平长度 ≥ 上升高度（≤ 45°）；
- 两端要"落"在平台里：沿行进方向平台向外至少留 0.6 米，左右要容得下梯宽（`STAIR_LANDING`）；
- 楼梯投影**不许与任何平层空间相交**：楼板要拆成避开梯井的矩形（`STAIR_SPACE_INTERSECTION`）；梯段之间头部净空 ≥ 2.2 米（`STAIR_INTERSECTION`）。

## 6. roofs[]

| 字段 | 必填 | 取值 |
|---|---|---|
| `id` | ✓ | 同上 |
| `spaceIds` | ✓ | 不重复的现有空间 id 列表 |
| `type` | ✓ | `flat`／`gable`（坡顶屋脊只沿 X） |
| `rise` | | 坡顶可省略，缺省 1.8，取值 (0, 8]；平顶省略或显式写 `0`（写其它值报 `ROOF_SIZE`） |
| `overhang` | | 0—2 米，缺省 0.35 |

硬约束：同一个屋顶引用的空间必须**同层、同墙顶标高**，且并集正好是一个**完整矩形**（不能有空洞，不能用一个大矩形无意盖上中庭）。屋顶包络不许穿进上层空间（`ROOF_UPPER_FLOOR`）或与另一个屋顶相交（`ROOF_INTERSECTION`）。

**每个房间上方都要有屋顶**，否则报 `ROOF_MISSING`（warning，不阻塞生成，但要在交付说明里写明理由）。第四种做法：一排等高等深的房间可以合成一个组合屋顶（见 `assets/layouts/row.json`）。

## 7. construction 与 status

| 字段 | 取值 |
|---|---|
| `phase` | `design`／`foundation`／`structure`／`enclosure`／`services`／`interior`／`accepted` |
| `status.design` | `concept`／`detailed` |
| `status.approval` | `pending`／`approved`（`approved` 要求 `design: detailed`） |
| `status.implementation` | `absent`／`unknown`／`present` |
| `status.tests`／`acceptance` | `pending`／`passed` |
| `status.evidence` | `{implementation, tests, acceptance}`：声明 `present`／`passed` 时**必须**给出处，否则 `STATE_EVIDENCE_REQUIRED` |

一致性：`tests`／`acceptance` 为 `passed` 时 `implementation` 必须是 `present`（`STATE_CONTRADICTION`）；`phase: "accepted"` 要求每间业务房四项齐备（`ACCEPTANCE_INCOMPLETE`）。

**建房的默认写法**：整块照抄样板（`design` ＋ `detailed`／`pending`／`unknown`／`pending`／`pending`／空 `evidence`）。计划、实现、测试、验收是**四种不同的事实**——生成器诊断通过不是业务实现证据，本技能不替作者声明任何一项。

## 图种资料补充

已接通workflow流程图与lifecycle生命周期图，都按当前业务chartId绑定，不编码URL或复制制图步骤。旧kind=workflow保持，新lifecycle目录投影kind=chart、diagramType=lifecycle，正文均经同一read入口；文档仍Markdown。图源由共享contract固定选择workflow.json/lifecycle.json，校验报实际缺失/类型冲突，不把新图当文档。制作/修改/来源/简化归specdev-business对应参考。

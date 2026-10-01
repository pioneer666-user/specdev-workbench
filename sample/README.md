# 第一批示例项目生成器

性质：第一批正式实现（目录与阅读）的**开发与验收数据源**（作者裁决③：第一批用虚构示例仓）。
业务内容全部虚构（Campus Services），非真实业务；不接入任何真实项目。

## 当前生成契约（N2c，2026-09-29）

以后生成的新虚构仓使用 `docs/specdev`、五类 `specdev/*/1` 登记 schema 与 `specdev/` 快照标签。业务、时间线、坏样例和切片保持；目标已存在即拒绝。此前生成的 local-artifacts 与历史回执不迁移、不改写，不向已有目录重新生成。

## 用法

```bash
node sample/generate.mjs            # 生成到 local-artifacts/2026-09-14-第一批示例项目/sample-repo
node sample/generate.mjs <目录>      # 指定目录（必须不存在；不覆盖、不删除既有产物）
```

生成后在旁边写 `manifest.json`（各提交号、标签、时间线、工作区改动位置），验收断言以它为准。

## 覆盖的样本

| 样本 | 位置 | 验收点 |
|---|---|---|
| 两版快照（design → implemented） | activity-registration/submit-review | 快照切换、证据跟随固定提交 |
| 无快照图 | activity-registration/seat-refund | 没有快照也必须能读（§3.3） |
| 一版快照 + 工作区未提交改动 | member-points/points-earn | "已改动"徽标（§3.2） |
| 5 个坏标签（轻量/非 JSON/坏 schema/张冠李戴/目录越界） | 挂在 points-earn 名下 | 无效标签跳过 + 计数提示（§2.4） |
| 坏证据图（1 合法 + 4 坏引用） | member-points/bad-evidence | 坏引用明确报错、不展示近似切片（§2.3） |
| 最小新图（只有 chart.json + workflow.json） | member-points/fresh-chart | 缺 details/evidence 的降级（§3.5） |

`points-earn/details.md` 里含图上已不存在的节点条目 `old_removed_node`：按约定容忍不报错（裁决⑥）。

## 素材来源与确定性

- `wf-submit-v1/v2.json`、`src-activity-eligibility-v1/v2.js` 取自贯通小样（2026-09-14 的图快照贯通验证用例），
  可编译性与 12–16 行证据切片已被该实验验证；其余 workflow 由 wf-points 仅改标题派生。
- 提交/标签的作者与日期固定（Git 环境变量逐次注入），仓库本地 `core.autocrlf=false`。
  同机同 git 版本下输入相同则产物可复现；跨 git 版本不承诺。

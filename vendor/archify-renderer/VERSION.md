# Archify vendor 副本（阅读渲染＋制图校验）

- 拷贝日期：2026-09-22；来源：工作区 `archify/`（外部库，不改动）。
- 来源识别（评审 #4 修正）：`archify/` 没有自己的 .git，此前记录的提交号 `f25840e` 实为外层 SpecDev Harness 仓库的提交，已废止。本副本只记**内容指纹**：全部拷贝文件（相对路径 + 内容）的 SHA-256 = `298de55a65fb468e50cf8cdbe95b3fcefc88d25360090ff17bb613a0add65335`。
- 一份原版文件，两处使用（2026-09-17 起，1b-0 实验验证后校验侧并入本目录，重叠文件合并为一份）：
  - **阅读页渲染**：`archify/renderers/workflow/workflow-compiler.mjs`（compileWorkflow），模板样式 `archify/assets/template.html`。浏览器经 import map 以 `stubs/` 与 `shims/process.mjs` 顶替 node: 内置（源维护于插件 renderer-stubs/，做法源自 2026-09-13 贯通小样并已验证产物与官方一致）。
  - **制图校验（specdev-business Skill 用）**：`node <本目录>/archify/bin/archify.mjs validate workflow <图.json>`；skillRoot 相对解析（bin/ 的上一级），字段规范在 `archify/schemas/`（workflow＋common）。在 Node 下运行，node: 内置按原样使用，不经替身。
- 用途：插件只读本副本，工作区 archify/ 目录怎么变都不影响插件页与校验；升级 = 重跑 `node scripts/vendor-renderer.mjs` 并更新本文件（一次有意决策，不自动跟随）。
- 许可：Archify 为 MIT，随副本携带于 `archify/LICENSE`；第三方声明见 `archify/THIRD_PARTY_NOTICES.md`。

## 本次拷贝的文件（35 个：导入闭包自动收集＋固定清单；替身非 Archify 原版）

### 原版 Archify 文件（25 个）

- archify/LICENSE
- archify/THIRD_PARTY_NOTICES.md
- archify/assets/template.html
- archify/bin/archify.mjs
- archify/renderers/shared/brand-marks.mjs
- archify/renderers/shared/cli.mjs
- archify/renderers/shared/desktop-readability.mjs
- archify/renderers/shared/diagnostics.mjs
- archify/renderers/shared/engineering-profiles.mjs
- archify/renderers/shared/generated-brand-marks.mjs
- archify/renderers/shared/generated-validators.mjs
- archify/renderers/shared/geometry.mjs
- archify/renderers/shared/i18n.mjs
- archify/renderers/shared/legend.mjs
- archify/renderers/shared/output-path.mjs
- archify/renderers/shared/repository-evidence.mjs
- archify/renderers/shared/text-fit.mjs
- archify/renderers/shared/utils.mjs
- archify/renderers/shared/validator.mjs
- archify/renderers/workflow/render-workflow.mjs
- archify/renderers/workflow/workflow-compiler.mjs
- archify/renderers/workflow/workflow-migration-geometry.mjs
- archify/schemas/common.schema.json
- archify/schemas/workflow.schema.json
- archify/scripts/check-render-output.mjs

### 浏览器替身（10 个，非 Archify 原版）

- shims/process.mjs
- stubs/child_process.mjs
- stubs/crypto.mjs
- stubs/dns-promises.mjs
- stubs/fs.mjs
- stubs/http.mjs
- stubs/https.mjs
- stubs/net.mjs
- stubs/path.mjs
- stubs/url.mjs

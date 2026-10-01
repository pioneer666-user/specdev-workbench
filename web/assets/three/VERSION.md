# Three.js 副本（随包发布）

- 版本：r186（`REVISION = '186'`，2026 构建，MIT 许可，文件头保留原版权与 SPDX 标识）
- 来源：工作区实验 `experiments/2026-09-22-threejs多房间房子/lib/`（该实验与后续
  JSON 房子生成器系列均用这一副本完成验证）。复制时间 2026-09-24。
- 文件：`three.module.js`（入口，内部引同目录 `three.core.js`）、`three.core.js`、
  `OrbitControls.js`（官方 addon，引裸名 `three`，由 building.html 的 importmap 解析）。
- 页面用法见 `web/building.html` 的 importmap：`three` → 本目录 `three.module.js`、
  `three/addons/controls/OrbitControls.js` → 本目录 `OrbitControls.js`。
- 升级：从官方发布取新版三文件整组替换（两个核心文件必须同版本成组更新），
  改动涉及渲染的页面后由作者看页面验收；本目录文件不手改。
- 大小核对：三文件均低于插件静态资源 2 MiB 读取上限（最大 three.core.js ≈1.46 MB）。

# SpecDev 工作台 0.2.2

简体中文 | [English](README.md)

在 DSH 中选择项目，浏览业务、资料与流程图，也可以用 Skill 为一个业务布置能行走、能读资料的独立房间。

0.2.2 包含主题跟随与页面整理、陶瓷／童话房材质和亮度、Archify 3.0.1 流程图及生命周期图阅读、逐段源码文档对照与单 HTML 房间导出。[更新说明](CHANGELOG.md)。

点击「导出房间」，选择当前业务资料，再点击「导出 HTML」；房间及所选文档、图可离线阅读。插件页内按本地 Git 固定提交读取精确源码；分享 HTML 只提供远端固定提交链接，不携带仓库源码片段。外链需联网，私仓还需访问权限。文档可能含你写入的代码或敏感信息，请确认分享范围。全不选可只导出房间。插件不在业务工作区另存 HTML，文件仅保留在你的下载位置；关闭导出层释放临时下载数据，下次导出重新生成。

## 效果预览

以下是真实产品截图，使用虚构样例；两种房间均可布置家具，工具栏沿用房间材质。

![陶瓷房：釉面墙体、日光与家具](https://raw.githubusercontent.com/pioneer666-user/specdev-workbench/v0.2.2/web/assets/screenshots/ceramic-room.png)

陶瓷房：釉面高光、通透窗户，可调节房间亮度。

![童话房：木纹、绿叶与家具](https://raw.githubusercontent.com/pioneer666-user/specdev-workbench/v0.2.2/web/assets/screenshots/fairy-room.png)

童话房：温暖木纹与小绿叶，亮度联动昼夜效果。

## 下载与安装

### npm 安装（推荐，精确版本）

[npm 0.2.2](https://www.npmjs.com/package/@pioneer_zmc/dsh-workbench/v/0.2.2)。GitHub 与 npm 0.2.2 分发同一份 `@pioneer_zmc/dsh-workbench` 安装包；插件 ID、路由和业务数据根不变。

### Windows 桌面

先保存任务，从菜单或托盘正常退出并确认后台实例结束。使用桌面随包 CLI，沿用桌面实际 DSH_HOME；原来未设置就保持未设置，不为安装切换数据根。下面只演示自选根；CLI 与桌面必须使用同一个根，此变量只影响当前终端及子进程。

~~~powershell
$DesktopDir = 'C:\Apps\DSH' # 替换为实际桌面安装目录
$env:DSH_HOME = 'C:\DSHData\desktop' # 仅自选根示例；已有用户沿用实际根
& "$DesktopDir\resources\runtime\cli\bin\dsh.cmd" plugin --profile desktop add '@pioneer_zmc/dsh-workbench@0.2.2' '--registry=https://registry.npmjs.org/'
& "$DesktopDir\DeepSeek Harness.exe"
~~~

升级前记录实际包名及自定义插件配置。已有 npm 用户按上面的 add 命令更新同一身份；如果宿主要求先移除，只用同一 CLI 的 `plugin --profile desktop remove <实际已安装包名>` 移除该包，然后 add 并核对原配置。不清空数据根，不并装两种身份。历史 GitHub 0.2.1 是 `@specdev/dsh-workbench`，npm 0.2.1 是 `@pioneer_zmc/dsh-workbench`，更早版本是 `@specdev/dsh-archify-manage`；旧标签和附件保留原身份，不承诺所有旧版本无损迁移。

侧栏「SpecDev 工作台」在中央面板展开，选择项目后进入业务，使用「返回聊天」回到原会话。

### Web

停止对应实例，沿用原数据根和 Web CLI；旧包移除及配置核对要求同上，profile 使用 web。

~~~sh
dsh plugin --profile web add @pioneer_zmc/dsh-workbench@0.2.2 --registry=https://registry.npmjs.org/
~~~

安装后重启对应 Web 实例。侧栏「SpecDev 工作台 ↗」在新标签列出项目名称和完整路径，原聊天保留。空清单先回 DSH 创建工作区并刷新；读取失败可重试，均保留手动配置入口。使用实际运行实例对应的 CLI 与 profile。

### GitHub 备用下载

[同版安装包](https://github.com/pioneer666-user/specdev-workbench/releases/download/v0.2.2/specdev-dsh-workbench-0.2.2.tgz) · [Release 与 SHA256](https://github.com/pioneer666-user/specdev-workbench/releases/tag/v0.2.2)。下载到无空格路径，使用对应 profile 的 `plugin add <本地tgz路径>`。历史 [GitHub 0.2.1](https://github.com/pioneer666-user/specdev-workbench/releases/tag/v0.2.1) 保留 `@specdev/dsh-workbench` 身份，与 npm 0.2.1 的包不同。

## 本版能力

- 一个业务的独立房间：写实/童话两种底座，总览/行走双视角，门内外通行。
- 十二款家具与真实缩略图图鉴：书架、书桌、台灯、告示牌、展示台、花瓶、盆栽、书堆、床、阅读椅、矮柜、落地灯；图鉴勾选后复制清单回聊天。
- 具备资料能力的家具可绑定当前业务已登记的文档、流程图和生命周期图；阅读时暂停行走，关闭后原位恢复。其他家具是摆设，不承诺坐卧、灯光开关或任意拖摆。
- 项目/业务目录、交互流程图、节点说明和固定提交源码证据；版本条回看历史，保存版本只为已提交内容添加附注Git标签。
- 保留整栋建筑总览与行走。三份Skill：[specdev-business](skills/specdev-business/SKILL.md)、[specdev-building](skills/specdev-building/SKILL.md)、[specdev-room](skills/specdev-room/SKILL.md)。

## 第一次使用

1. 在DSH选择Git仓库顶层工作区。已有 `docs/specdev` 项目可直接浏览；没有业务资料时，先与AI确认业务，再用specdev-business登记说明和流程图。
2. 在该项目会话里说：

> 用 specdev-room，为这个业务建一个房间。

Skill会引导确认业务、风格与布置方式，读取当前家具目录，写唯一 `docs/specdev/<业务ID>/room.json` 并调用只读校验。它不替你生成模型、业务正文或新流程图，也不默认一个项目。

3. 点侧栏工作台，选择项目和业务，进入房间；总览中看布局，行走中阅读已绑定资料。配置修改后刷新页面。

管理页面唯一写操作是保存快照标签，不改业务文件、分支或提交；AI技能只在你的授权范围内写项目文件。

## 0.1.x升级边界

现行 npm 包 `@pioneer_zmc/dsh-workbench`，插件/侧栏ID `specdev-workbench`，客户端模块 `@pioneer_zmc/dsh-workbench/client`。页面和API前缀改为 `/specdev-workbench`，资料根为 `docs/specdev`，六类正式schema为 `specdev/*/1`，建筑格式及快照标签也改为SpecDev命名。旧技能archify-maker/archify-house改为specdev-business/specdev-building，新加specdev-room。

只读新根、新格式和新标签，不自动迁移旧项目，不保证旧书签可用，不注册旧URL或技能别名；旧数据和标签保留。每个旧项目需另行约定迁移，不能直接批量改名。已登记资料路径可继续指向仓库内原位置。

## 限制与验证

当前房间、阅读及导出体验已在 Windows / DSH Desktop、Web 0.2.0-rc.2 固定环境验证。其他平台、真实系统主题模式、后续宿主与所有旧版本迁移未覆盖。本版构建、下载及安装状态以发布凭证为准。独立 DSH_HOME 隔离插件与业务数据，同账户 Electron 偏好、缓存及单实例行为仍可能共用。

正式制作和登记支持 workflow、lifecycle；时序图及其他上游图种尚未开放为业务资料。旧流程图阅读和历史快照保留兼容，不自动升级旧图。分享文件的源码外链不代表官方远端源码验证，产品不自动检查外链可达性。

导出当前房间及所选已登记 Markdown 文档、流程图、生命周期图，不打包整个项目或历史。外部文档图片不随包，阅读时显示占位。限额为 64 文档、16 图、32 MiB 输入、64 MiB HTML 输出。生成失败或取消后可重新选择；发起下载不等于保存成功，必要时点击「下载文件」。

不支持页内家具编辑、任意缩放、墙挂、嵌套承载、跨房连接或坐卧动画；支持地面摆放和一层桌面承载。房间校验核对摆放和登记资料读取；图编译另用制图校验入口。

## 源码构建与示例

Node.js ≥22。在本仓库根目录依次运行：

~~~sh
npm install
node node_modules/typescript/bin/tsc --noEmit
node scripts/build.mjs
npm pack --ignore-scripts --pack-destination .
~~~

生成 `pioneer_zmc-dsh-workbench-0.2.2.tgz`。渲染器及只读校验已随包，不依赖外部研究仓。

~~~sh
node sample/generate.mjs ./local-artifacts/demo-project
~~~

目标目录必须不存在；示例说明见 [sample/README.md](sample/README.md)。将生成目录作为DSH工作区打开。

可按需串行运行 `node scripts/smoke.mjs`、`node scripts/check-save.mjs`，会创建独立示例，不操作你的项目。

## 许可与致谢

插件及十二款自制家具的模型、生成纹理、渲染缩略图采用 [MIT](LICENSE)，家具逐项来源见 [SOURCES](web/assets/furniture/SOURCES.md)。保留 [Archify 3.0.1 许可](vendor/archify-3.0.1/LICENSE)、[Marked 许可](web/assets/vendor/marked/LICENSE) 及旧 [Archify许可证](vendor/archify-renderer/archify/LICENSE)、[第三方声明](vendor/archify-renderer/archify/THIRD_PARTY_NOTICES.md) 与 [Three.js版本来源](web/assets/three/VERSION.md)。感谢DSH插件宿主及上游项目。

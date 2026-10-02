# SpecDev 工作台 0.2.1

简体中文 | [English](README.md)

在 DSH 中选择项目，浏览业务、资料与流程图，也可以用 Skill 为一个业务布置能行走、能读资料的独立房间。

## 下载与安装

### Windows 桌面

使用桌面安装目录中的随包命令，不使用全局 Web CLI。先保存任务，从菜单或托盘退出桌面并确认后台实例结束。下载 tgz 到无空格的本地路径。

下面是**自选数据根**的示例：替换安装目录与文件路径，CLI 和桌面启动必须使用同一个 DSH_HOME。已有桌面用户应沿用实际数据根；原来未设置 DSH_HOME 就保持未设置，不要为了安装随意切换。此环境变量只影响当前终端及其子进程，不修改系统设置。

~~~powershell
$DesktopDir = 'C:\Apps\DSH' # 替换为桌面安装目录
$Package = 'C:\DSHPackages\specdev-dsh-workbench-0.2.1.tgz'
$env:DSH_HOME = 'C:\DSHData\desktop' # 仅自选新根示例；须与桌面实际使用一致
& "$DesktopDir\resources\runtime\cli\bin\dsh.cmd" plugin --profile desktop add $Package
& "$DesktopDir\DeepSeek Harness.exe"
~~~

更新已有插件时，在 add 前只移除实际已安装的包：当前身份用同一随包命令的 'plugin --profile desktop remove @specdev/dsh-workbench'；0.1.11及更早旧身份为 '@specdev/dsh-archify-manage'。未安装的包不执行 remove，不清空数据根。安装后从相同环境重启桌面；普通快捷方式不一定继承终端自选数据根。

侧栏「SpecDev 工作台」在桌面中央面板展开；选择项目后进入相应业务，使用「返回聊天」回到原会话。

### Web

已有 Web 宿主继续使用其终端命令和原数据根：

~~~sh
dsh plugin --profile web add https://github.com/pioneer666-user/specdev-workbench/releases/download/v0.2.1/specdev-dsh-workbench-0.2.1.tgz
~~~

升级时先停止对应 Web 实例，只对实际安装的身份执行 'dsh plugin --profile web remove @specdev/dsh-workbench'（旧身份则为 '@specdev/dsh-archify-manage'），再 add 并重启。不要把 Web 命令用于桌面 profile。

Web 侧栏「SpecDev 工作台 ↗」在新标签显示项目名称和完整路径，原聊天保留。空清单先回 DSH 创建工作区并刷新；读取失败可重试，均保留手动配置入口。

[下载0.2.1安装包](https://github.com/pioneer666-user/specdev-workbench/releases/download/v0.2.1/specdev-dsh-workbench-0.2.1.tgz) · [Release](https://github.com/pioneer666-user/specdev-workbench/releases/tag/v0.2.1)

以上0.2.1链接在正式发布后可用；发布前是准备地址。已发布0.2.0仍见[原Release](https://github.com/pioneer666-user/specdev-workbench/releases/tag/v0.2.0)。

## 本版能力

- 一个业务的独立房间：写实/童话两种底座，总览/行走双视角，门内外通行。
- 十二款家具与真实缩略图图鉴：书架、书桌、台灯、告示牌、展示台、花瓶、盆栽、书堆、床、阅读椅、矮柜、落地灯；图鉴勾选后复制清单回聊天。
- 具备资料能力的家具可绑定当前业务已登记的文档和流程图；阅读时暂停行走，关闭后原位恢复。其他家具是摆设，不承诺坐卧、灯光开关或任意拖摆。
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

新包 `@specdev/dsh-workbench`，插件/侧栏ID `specdev-workbench`，客户端模块 `@specdev/dsh-workbench/client`。页面和API前缀改为 `/specdev-workbench`，资料根为 `docs/specdev`，六类正式schema为 `specdev/*/1`，建筑格式及快照标签也改为SpecDev命名。旧技能archify-maker/archify-house改为specdev-business/specdev-building，新加specdev-room。

只读新根、新格式和新标签，不自动迁移旧项目，不保证旧书签可用，不注册旧URL或技能别名；旧数据和标签保留。每个旧项目需另行约定迁移，不能直接批量改名。已登记资料路径可继续指向仓库内原位置。

## 限制与验证

不支持页内家具编辑/保存、任意缩放、墙挂、嵌套承载、跳跃上下楼、跨房连接或坐卧动画。支持地面摆放及一层桌面承载，风格是软推荐。CLI核对配置、摆放、绑定和登记资料读取；流程图只读到JSON语法，不等于图编译/渲染验证。

0.2.1候选已在 Windows / DSH Desktop 0.2.0-rc.2 验收中央入口、项目归属、房间阅读、内部导航和聊天草稿保留；三技能通过宿主正常查看入口确认可发现、正文及参考文件可读。最终发布包仅README变化，运行文件与该实测候选相同，未重新安装最终包。Web既有真实安装/使用覆盖0.2.0发布包、Windows / DSH 0.1.6-alpha.2；0.2.1源码入口相关单档回归12项通过，另有新版Web宿主0.2.0-rc.2隔离验证，不能据此宣称0.2.1最终包已在所有Web宿主安装。其他平台及后续宿主版本未验证。独立DSH_HOME隔离插件/业务数据，同账户Electron偏好、缓存、单实例及协议仍可能共用。

## 源码构建与示例

Node.js ≥22。在本仓库根目录依次运行：

~~~sh
npm install
node node_modules/typescript/bin/tsc --noEmit
node scripts/build.mjs
npm pack --pack-destination .
~~~

生成 `specdev-dsh-workbench-0.2.1.tgz`。渲染器及只读校验已随包，不依赖外部研究仓。

~~~sh
node sample/generate.mjs ./local-artifacts/demo-project
~~~

目标目录必须不存在；示例说明见 [sample/README.md](sample/README.md)。将生成目录作为DSH工作区打开。

可按需串行运行 `node scripts/smoke.mjs`、`node scripts/check-save.mjs`，会创建独立示例，不操作你的项目。

## 许可与致谢

插件及十二款自制家具的模型、生成纹理、渲染缩略图采用 [MIT](LICENSE)，家具逐项来源见 [SOURCES](web/assets/furniture/SOURCES.md)。保留 [Archify许可证](vendor/archify-renderer/archify/LICENSE)、[第三方声明](vendor/archify-renderer/archify/THIRD_PARTY_NOTICES.md) 与 [Three.js版本来源](web/assets/three/VERSION.md)。感谢DSH插件宿主及上游项目。

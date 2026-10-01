# SpecDev 工作台 0.2.0

简体中文 | [English](README.md)

在 DSH 中选择项目，浏览业务、资料与流程图，也可以用 Skill 为一个业务布置能行走、能读资料的独立房间。

## 下载与安装

前置：已安装 DSH，终端可用 `dsh`、`pnpm` 和 `git`。已验证 Windows、DSH 0.1.6-alpha.2、web profile；其他平台和宿主版本尚未验证。

~~~sh
dsh plugin --profile web add https://github.com/pioneer666-user/dsh-archify-manage/releases/download/v0.2.0/specdev-dsh-workbench-0.2.0.tgz
~~~

[下载0.2.0安装包](https://github.com/pioneer666-user/dsh-archify-manage/releases/download/v0.2.0/specdev-dsh-workbench-0.2.0.tgz) · [Release](https://github.com/pioneer666-user/dsh-archify-manage/releases/tag/v0.2.0)

重启 DSH，点击侧栏「SpecDev 工作台 ↗」。新标签的「选择项目」页显示名称和完整路径，选择后在同一标签进入对应项目，原聊天保留。空清单先回DSH创建工作区并刷新；读取失败可重试，两种状态均保留手动配置入口。

### 升级已有安装

先完成会话任务并停止DSH。按实际已安装包选择移除命令；若两份都存在，分别移除，避免双份插件。

~~~sh
# 旧发布包（0.1.11及更早）
dsh plugin --profile web remove @specdev/dsh-archify-manage
# 开发期新身份包（仅已安装此包时执行）
dsh plugin --profile web remove @specdev/dsh-workbench
# 安装唯一新包，再启动DSH
dsh plugin --profile web add https://github.com/pioneer666-user/dsh-archify-manage/releases/download/v0.2.0/specdev-dsh-workbench-0.2.0.tgz
~~~

只移除实际存在的包。此过程保留会话及业务仓库数据；本地下载的tgz请放在无空格路径，再按其实际路径安装。

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

作者已在真实DSH中验收项目选择、建房、文档和流程图阅读；技术检查仅覆盖已声明宿主和固定包，不宣称所有平台或最新DSH均已验证。

## 源码构建与示例

Node.js ≥22。在本仓库根目录依次运行：

~~~sh
npm install
node node_modules/typescript/bin/tsc --noEmit
node scripts/build.mjs
npm pack --pack-destination .
~~~

生成 `specdev-dsh-workbench-0.2.0.tgz`。渲染器及只读校验已随包，不依赖外部研究仓。

~~~sh
node sample/generate.mjs ./local-artifacts/demo-project
~~~

目标目录必须不存在；示例说明见 [sample/README.md](sample/README.md)。将生成目录作为DSH工作区打开。

可按需串行运行 `node scripts/smoke.mjs`、`node scripts/check-save.mjs`，会创建独立示例，不操作你的项目。

## 许可与致谢

插件及十二款自制家具的模型、生成纹理、渲染缩略图采用 [MIT](LICENSE)，家具逐项来源见 [SOURCES](web/assets/furniture/SOURCES.md)。保留 [Archify许可证](vendor/archify-renderer/archify/LICENSE)、[第三方声明](vendor/archify-renderer/archify/THIRD_PARTY_NOTICES.md) 与 [Three.js版本来源](web/assets/three/VERSION.md)。感谢DSH插件宿主及上游项目。

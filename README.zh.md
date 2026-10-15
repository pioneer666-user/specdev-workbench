# SpecDev 工作台

简体中文 | [English](README.md)

把项目的文档和图读明白，再为它们布置一个能行走、能阅读、能分享的房间。

SpecDev 工作台是 **DeepSeek Harness（DSH）** 的插件。DSH 是供你与 AI 协作的智能体工作环境；本插件把普通文档、Archify 图阅读和有家具的三维房间结合起来。你可以请 AI 围绕项目资料布置森林阅读小屋或陶瓷工作室，体验雨天与环境声，再把房间导出给别人逛一逛。

这里的“业务”指项目中的一个功能或主题，例如登录、阅读清单。它已登记的资料可以拥有一个独立房间。

**[下载免安装房间示例](https://github.com/pioneer666-user/specdev-workbench/releases/download/v0.2.3/specdev-reading-list-0.2.3.html)** · **[安装插件](#安装插件)**

体验示例时，先下载 HTML 文件，再用浏览器打开；这是文件下载，不是在线试玩。房间及所选文档、图可以离线阅读，源码外链仍需联网，私有仓库还需要访问权限。

## 看看房间

以下是真实产品截图，展示使用虚构项目资料的完整布置样板。

![森林房：暖木阅读小屋](https://raw.githubusercontent.com/pioneer666-user/specdev-workbench/v0.2.3/web/assets/screenshots/forest-room-0.2.3.jpg)

森林小屋：温暖木纹、阅读区域，以及分布在房间各处的装饰。

![陶瓷房：工作与陈列区域](https://raw.githubusercontent.com/pioneer666-user/specdev-workbench/v0.2.3/web/assets/screenshots/ceramic-room-0.2.3.jpg)

陶瓷房：釉面高光、通透窗户，工作区与陈列区分开布置。

## 可以用它做什么

- **了解项目。** 浏览已登记的 Markdown 文档、交互流程图和生命周期图，查看节点说明与固定提交的源码依据。普通二维阅读入口也保留，方便专注阅读和回看历史快照。
- **给资料布置一个空间。** 请随包 AI 技能借助现有家具和成品样板布置房间。选择森林或陶瓷风格，看看十二款家具图鉴，用日常语言表达偏好。
- **在房间里阅读。** 走到书架、书桌或告示牌旁打开绑定资料，也可进入完整资料目录。阅读时暂停行走，关闭后回到浏览位置。
- **调节氛围。** 调整亮度、雨量、湿润反射和声音；快捷控件与“显示／天气／声音”设置共用状态。声音需要你手动开启。
- **分享房间。** 把房间与所选资料导出为一份 HTML；接收者无需安装 DSH 或插件，就能打开探索。

技能（Skill）是一套帮助 AI 使用插件格式和校验工具的操作说明。它不会自动把源码变成正确的项目资料，也不保证所有模型都能一次布置出漂亮房间。

## 安装插件

先准备好 **DSH 宿主，并确认能打开工作区**。宿主获取与配置请看 [DSH 官方项目](https://github.com/deepseek-ai/deepseek-harness)及[用户文档](https://deepseek-harness.github.io/deepseek-harness/)。本插件的房间、阅读与导出体验已在 **Windows / DSH Desktop、Web 0.2.0-rc.2** 验证；这个结果不覆盖其他宿主版本或平台。

当前插件版本：**0.2.3** · [Release 与校验文件](https://github.com/pioneer666-user/specdev-workbench/releases/tag/v0.2.3) · [npm 精确版本](https://www.npmjs.com/package/@pioneer_zmc/dsh-workbench/v/0.2.3)

### 首次安装：Windows 桌面

先打开一次 DSH，完成宿主初始设置。保存任务，从菜单或托盘正常退出，并确认后台实例结束。使用这套桌面安装自带的 CLI，沿用 DSH 实际使用的数据根：以前没有设置 `DSH_HOME` 就保持未设置。安装插件无需源码构建。

在 PowerShell 中运行，只替换桌面安装目录：

~~~powershell
$DesktopDir = 'C:\Apps\DSH' # 替换为实际 DSH 桌面安装目录
& "$DesktopDir\resources\runtime\cli\bin\dsh.cmd" plugin --profile desktop add '@pioneer_zmc/dsh-workbench@0.2.3' '--registry=https://registry.npmjs.org/'
& "$DesktopDir\DeepSeek Harness.exe"
~~~

点侧栏「SpecDev 工作台」，在中央面板选择项目；「返回聊天」可恢复原会话。

### 首次安装：Web

完成宿主初始设置后，停止对应 Web 实例，使用它自己的 `dsh` CLI 和同一个数据根：

~~~sh
dsh plugin --profile web add @pioneer_zmc/dsh-workbench@0.2.3 --registry=https://registry.npmjs.org/
~~~

重启该实例，侧栏入口会在新标签打开工作台，保留聊天。通过 npm 或源码启动宿主的用户，按[安装指南](https://github.com/pioneer666-user/specdev-workbench/blob/main/docs/public/guide.zh.md#安装与升级)使用对应的 CLI 调用方式。

### 已经安装过？

升级前先备份自定义插件配置，记录实际已安装包名。现行 npm 身份使用上方对应桌面／Web 命令；重复安装同版本可能被宿主跳过，历史包身份还需要单独处理迁移。移除前请看[升级、本地包安装与数据根说明](https://github.com/pioneer666-user/specdev-workbench/blob/main/docs/public/guide.zh.md#安装与升级)，保留已有项目数据。

## 第一个房间

1. **在 DSH 选定 Git 项目。** 把仓库顶层作为工作区，再到工作台选择该项目。列表为空时先创建 DSH 工作区并刷新。资料在 `docs/specdev` 下登记；已有登记资料可以直接到第 3 步。
2. **整理并登记一个主题的资料。** 在该项目会话中，请 AI 使用 **specdev-business**，确认目标仓库、可提交分支和主题，提供需求或现有文档。例如：

   > 用 specdev-business，为当前 Git 项目的“阅读清单”主题整理并登记说明文档和流程图。拟定功能是添加一本书、标记已读；只做设计资料，不实现功能。请先和我确认目标仓库及可提交分支，需求不清楚就问我。校验完成后，给我工作台入口查看。

   把示例替换为自己的主题和需求。资料完成前，AI 可能需要你裁决问题；已有文档登记时可以保留仓库内原路径，拟定设计应明确标记。
3. **围绕已登记资料建房。** 资料准备好后说：

   > 用 specdev-room，给当前项目“阅读清单”这个已登记业务建一个森林房，我想在里面看现有资料，其余布置你安排。以成品样板为起点，绑定真实资料，完成最终完整房间校验。

   可以改选陶瓷房、指定家具，也可以交给 AI 安排。房间技能负责写布置配置并校验，不另造文档、图或模型。
4. **打开看看。** 刷新工作台，选择业务并进入房间；在总览看布置，再走到阅读处打开一份资料。布局是否好看、走动是否舒服，由你实际判断。

[入门指南](https://github.com/pioneer666-user/specdev-workbench/blob/main/docs/public/guide.zh.md)继续说明资料登记、房间操作、导出、排查、迁移与源码构建；随包 [specdev-building 技能](skills/specdev-building/SKILL.md)还支持整栋建筑的总览与行走。

## 兼容与能力边界

通过 AI 修改配置，可以布置地面家具及一层台面摆件。目前没有页内家具编辑、任意缩放、墙挂、嵌套承载、跨房连接和坐卧动画。房间校验核对摆放与登记资料读取，图的编译另有校验入口。

制作和登记支持流程图（workflow）、生命周期图（lifecycle）；时序图及其他上游图种尚未开放为项目资料。旧流程图阅读和历史快照保留兼容，不自动迁移旧项目或升级旧图。

亮度、天气、声音和家具显隐仅保留在当前页面；后台停声，返回需手动继续。导出首次晴天且声音关闭，只包含所选资料，不包含整个仓库或历史。分享前检查敏感文字。完整导出限额与兼容范围见指南。

新指南位于公开 **main**，在 0.2.3 发布后补充；已发布的 0.2.3 安装包和标签保留原 README，尚不包含这两份指南。

[入门指南](https://github.com/pioneer666-user/specdev-workbench/blob/main/docs/public/guide.zh.md) · [更新日志](CHANGELOG.md) · [MIT 许可](LICENSE)

## 许可与致谢

插件及十二款自制家具的模型、生成纹理、渲染缩略图采用 [MIT](LICENSE)，逐项来源见 [家具 SOURCES](web/assets/furniture/SOURCES.md)。图能力使用 Archify，保留 [Archify 3.0.1 许可](vendor/archify-3.0.1/LICENSE)、[Marked 许可](web/assets/vendor/marked/LICENSE)、旧 [Archify 许可](vendor/archify-renderer/archify/LICENSE)、[第三方声明](vendor/archify-renderer/archify/THIRD_PARTY_NOTICES.md)和 [Three.js 来源](web/assets/three/VERSION.md)。[环境声](web/assets/audio/ambience/notices.json)、[脚步](web/assets/audio/footsteps/notices.json)、[雨声](web/assets/audio/rain/notices.json)保留作者、加工说明与许可原文。感谢 DSH、Archify 和音频创作者。

# SpecDev 工作台 0.2.3

简体中文 | [English](README.md)

在 DSH 中选择项目，浏览业务、资料与流程图，也可以用 Skill 为一个业务布置能行走、能读资料的独立房间。

0.2.3 整理自由布置、森林／陶瓷成品样板、家具资料浏览、雨天与声音、快捷控制及分类设置。[更新说明](CHANGELOG.md)。安装包、校验文件与发布状态见 [0.2.3 Release](https://github.com/pioneer666-user/specdev-workbench/releases/tag/v0.2.3)，npm精确版本入口为 [0.2.3](https://www.npmjs.com/package/@pioneer_zmc/dsh-workbench/v/0.2.3)。历史 [npm 0.2.2](https://www.npmjs.com/package/@pioneer_zmc/dsh-workbench/v/0.2.2) 保留。

点击「导出房间」，选择当前业务资料，再点击「导出 HTML」；房间及所选文档、图可离线阅读。插件页内按本地 Git 固定提交读取精确源码；分享 HTML 只提供远端固定提交链接，不携带仓库源码片段。外链需联网，私仓还需访问权限。文档可能含你写入的代码或敏感信息，请确认分享范围。全不选可只导出房间。插件不在业务工作区另存 HTML，文件仅保留在你的下载位置；关闭导出层释放临时下载数据，下次导出重新生成。

房间工具栏的太阳按钮可快捷调亮度；声音主按钮开关全部声音，旁边的小箭头只展开总音量，不会启声。完整设置按“显示／天气／声音”分类，切换时窗口大小保持，内容在窗口内部滚动。雨量及分类音量在设置中调节；背景被浏览器暂停时，展开音量后点“点击继续播放”。

完整资料目录位于“房间家具 → 展开浏览 → 全部房间资料”，没有家具或绑定有误也能查看已登记资料；关闭阅读回到原家具浏览位置。工具栏和设置中的亮度、总音量共用本次页面状态，刷新后恢复原默认。

## 效果预览

以下是真实产品截图，使用虚构业务的完整布置样板；中英文共用两张v0.2.3原图。

![陶瓷房：完整工作与陈列布置](https://raw.githubusercontent.com/pioneer666-user/specdev-workbench/v0.2.3/web/assets/screenshots/ceramic-room-0.2.3.jpg)

陶瓷房：釉面高光、通透窗户，工作区与陈列区分开布置。

![森林房：完整暖木阅读小屋](https://raw.githubusercontent.com/pioneer666-user/specdev-workbench/v0.2.3/web/assets/screenshots/forest-room-0.2.3.jpg)

森林房：温暖木纹与小绿叶，阅读、休憩及装饰组合。旧版截图原位保留：[0.2.2陶瓷](https://raw.githubusercontent.com/pioneer666-user/specdev-workbench/v0.2.2/web/assets/screenshots/ceramic-room.png)、[0.2.2童话](https://raw.githubusercontent.com/pioneer666-user/specdev-workbench/v0.2.2/web/assets/screenshots/fairy-room.png)。

## 下载与安装

### npm 安装（推荐，精确版本）

使用精确版本 `@pioneer_zmc/dsh-workbench@0.2.3`；GitHub与npm使用同一固定包，插件ID、路由和业务数据根不变。实际发布状态见上方本版本Release。

### Windows 桌面

先保存任务，从菜单或托盘正常退出并确认后台实例结束。使用桌面随包 CLI，沿用桌面实际 DSH_HOME；原来未设置就保持未设置，不为安装切换数据根。下面只演示自选根；CLI 与桌面必须使用同一个根，此变量只影响当前终端及子进程。

~~~powershell
$DesktopDir = 'C:\Apps\DSH' # 替换为实际桌面安装目录
$env:DSH_HOME = 'C:\DSHData\desktop' # 仅自选根示例；已有用户沿用实际根
& "$DesktopDir\resources\runtime\cli\bin\dsh.cmd" plugin --profile desktop add '@pioneer_zmc/dsh-workbench@0.2.3' '--registry=https://registry.npmjs.org/'
& "$DesktopDir\DeepSeek Harness.exe"
~~~

升级前记录实际包名及自定义插件配置。已有 npm 用户按上面的 add 命令更新同一身份；如果宿主要求先移除，只用同一 CLI 的 `plugin --profile desktop remove <实际已安装包名>` 移除该包，然后 add 并核对原配置。不清空数据根，不并装两种身份。历史 GitHub 0.2.1 是 `@specdev/dsh-workbench`，npm 0.2.1 是 `@pioneer_zmc/dsh-workbench`，更早版本是 `@specdev/dsh-archify-manage`；旧标签和附件保留原身份，不承诺所有旧版本无损迁移。

侧栏「SpecDev 工作台」在中央面板展开，选择项目后进入业务，使用「返回聊天」回到原会话。

### Web

停止对应实例，沿用原数据根和 Web CLI；旧包移除及配置核对要求同上，profile 使用 web。

~~~sh
dsh plugin --profile web add @pioneer_zmc/dsh-workbench@0.2.3 --registry=https://registry.npmjs.org/
~~~

安装后重启对应 Web 实例。侧栏「SpecDev 工作台 ↗」在新标签列出项目名称和完整路径，原聊天保留。空清单先回 DSH 创建工作区并刷新；读取失败可重试，均保留手动配置入口。使用实际运行实例对应的 CLI 与 profile。

### GitHub 备用下载

[同版安装包](https://github.com/pioneer666-user/specdev-workbench/releases/download/v0.2.3/specdev-dsh-workbench-0.2.3.tgz) · [Release与SHA256](https://github.com/pioneer666-user/specdev-workbench/releases/tag/v0.2.3)。下载到无空格路径，使用对应profile的 `plugin add <本地tgz路径>`；旧正式版 [GitHub 0.2.2](https://github.com/pioneer666-user/specdev-workbench/releases/tag/v0.2.2) 仍可使用。历史 [GitHub 0.2.1](https://github.com/pioneer666-user/specdev-workbench/releases/tag/v0.2.1) 保留 `@specdev/dsh-workbench` 身份，与npm 0.2.1的包不同。

## 本版能力

- 一个业务的独立房间：陶瓷／森林两种底座，总览／行走双视角，门内外通行；可参考随包成品样板再适配自己的资料。
- 十二款家具与真实缩略图图鉴：书架、书桌、台灯、告示牌、展示台、花瓶、盆栽、书堆、床、阅读椅、矮柜、落地灯；图鉴勾选后复制清单回聊天。
- 十二款家具均可绑定当前业务已登记的文档、流程图和生命周期图；选择家具与打开阅读分开，完整目录也能从家具浏览中进入。阅读时暂停行走，关闭后回到原浏览位置。总览可临时隐藏家具，进入行走前自动恢复；显隐不写回布局，不承诺坐卧或灯光开关。
- AI可通过room.json自由布置地面家具及一层台面摆件，公开工具提供只读试摆、单件落地位置／承载面推荐。推荐有固定预算且不自动写回；碰撞、入口、操作空间和可达性仍要验证，并非任意位置都能放，最终完整check-room不可省略。
- 环境声与行走脚步、亮度联动昼夜、可调雨量和湿润反射；森林鸟虫背景随雨量淡出，在30时归零。声音需手动开启，后台暂停，回来需手动继续播放。
- 太阳快捷亮度、声音主开关和小箭头总音量，与“显示／天气／声音”设置同步。亮度、天气、声音方案／音量和显隐只属当前页面，刷新／重进恢复默认；导出可保留所选主题／亮度，首次仍晴天且声音关闭，不携带声音或天气偏好。
- 项目/业务目录、交互流程图、节点说明和固定提交源码证据；版本条回看历史，保存版本只为已提交内容添加附注Git标签。
- 保留整栋建筑总览与行走。三份Skill：[specdev-business](skills/specdev-business/SKILL.md)、[specdev-building](skills/specdev-building/SKILL.md)、[specdev-room](skills/specdev-room/SKILL.md)。

## 第一次使用

1. 在DSH选择Git仓库顶层工作区。已有 `docs/specdev` 项目可直接浏览；没有业务资料时，先与AI确认业务，再用specdev-business登记说明和流程图。
2. 在该项目会话里说：

> 用 specdev-room，给“阅读清单”这个已登记业务建一个森林房，我想在里面看现有资料，其余布置你安排。

把业务名称替换为自己的已登记业务；森林对应fairy，陶瓷对应ceramic。Skill只问缺少的业务／风格信息，布置感觉可选；已说“其余你安排”就由AI安排件数和组合，也可明确极简、指定家具或禁用品。参考 [成品样板与适配指导](skills/specdev-room/references/furnished-layouts.md)，先复用成熟组合，再保留真实业务身份、绑定已有资料，并做最终完整校验。只写 `docs/specdev/<业务ID>/room.json`，不生成模型、业务正文或新图，不默认项目；单次森林房新上下文AI试用成功不代表所有模型、风格或宿主都稳定美观。

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

Node.js ≥22。从公开源码仓库取得本版本源码后，在仓库根目录依次运行；npm安装包提供运行产物，不包含源码构建脚本：

~~~sh
npm install
node node_modules/typescript/bin/tsc --noEmit
node scripts/build.mjs
npm pack --ignore-scripts --pack-destination .
~~~

生成 `pioneer_zmc-dsh-workbench-0.2.3.tgz`。渲染器及只读校验已随包，不依赖外部研究仓。

~~~sh
node sample/generate.mjs ./local-artifacts/demo-project
~~~

目标目录必须不存在；示例说明见 [公开源码sample/README.md](https://github.com/pioneer666-user/specdev-workbench/blob/v0.2.3/sample/README.md)。将生成目录作为DSH工作区打开。

可按需串行运行 `node scripts/smoke.mjs`、`node scripts/check-save.mjs`，会创建独立示例，不操作你的项目。

## 许可与致谢

插件及十二款自制家具的模型、生成纹理、渲染缩略图采用 [MIT](LICENSE)，家具逐项来源见 [SOURCES](web/assets/furniture/SOURCES.md)。流程图能力使用Archify，保留 [Archify 3.0.1许可](vendor/archify-3.0.1/LICENSE)、[Marked许可](web/assets/vendor/marked/LICENSE)、旧 [Archify许可证](vendor/archify-renderer/archify/LICENSE)、[第三方声明](vendor/archify-renderer/archify/THIRD_PARTY_NOTICES.md) 与 [Three.js版本来源](web/assets/three/VERSION.md)。[环境声](web/assets/audio/ambience/notices.json)、[脚步](web/assets/audio/footsteps/notices.json)、[雨声](web/assets/audio/rain/notices.json)的作者、加工说明及许可原文随包保留。感谢DSH插件宿主、Archify及音频上游作者。

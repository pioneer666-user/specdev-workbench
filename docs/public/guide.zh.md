# SpecDev 工作台入门指南

[项目介绍](../../README.zh.md) · [English](guide.md)

本指南适用于 0.2.3 的现有能力，发布后补充在公开 main；不在已发布的 0.2.3 标签或 npm 包中。先体验房间可下载 [离线示例](https://github.com/pioneer666-user/specdev-workbench/releases/download/v0.2.3/specdev-reading-list-0.2.3.html)，保存 HTML 后在浏览器打开。

## 安装与升级

### 宿主和 CLI

插件运行在 [DeepSeek Harness（DSH）](https://github.com/deepseek-ai/deepseek-harness) 中，宿主安装、模型配置与工作区操作见 [DSH 官方文档](https://deepseek-harness.github.io/deepseek-harness/)。先完成宿主设置，确认可以打开项目与聊天，再安装插件。

已验证环境为 Windows / DSH Desktop、Web 0.2.0-rc.2，不代表所有新旧宿主都兼容。桌面与 Web 的 CLI、profile 和数据根要与实际运行实例匹配；不要用另装的 Web CLI 更新桌面 profile。

桌面安装命令见 [README](../../README.zh.md#首次安装windows-桌面)。Web 的 `dsh` 表示你实际宿主的 CLI，不保证系统已配置该短命令。通过 npm 使用已验证宿主版本时，对应调用为：

~~~sh
npx --package=@deepseek-ai/dsh@0.2.0-rc.2 dsh plugin --profile web add @pioneer_zmc/dsh-workbench@0.2.3 --registry=https://registry.npmjs.org/
~~~

如果从 DSH 源码运行，在**自己的 DSH 源码仓库**使用 `pnpm dsh plugin --profile web add @pioneer_zmc/dsh-workbench@0.2.3 --registry=https://registry.npmjs.org/`，沿用该仓库实际版本和数据根。这不是在本插件源码仓库执行的命令。按宿主说明准备 Node.js、pnpm；宿主版本变化需另验兼容。

### 数据根与升级保护

安装前保存任务、停止对应实例，桌面从菜单或托盘正常退出并确认后台结束。沿用原 `DSH_HOME`：以前未设置就不设置；已有自定义根时，CLI 和宿主必须使用同一个实际根。不要为了照抄教程新建数据根，造成原工作区或配置“消失”。

确有自定义根的用户，可在安装用的 PowerShell 终端设置 `$env:DSH_HOME = '<你现有的实际数据根>'`；占位符必须替换。这只影响该终端及其子进程，之后从另一个入口启动宿主也应保持原根。同一 Windows 账户内，即使数据根不同，Electron 偏好、缓存和单实例行为仍可能共用。

升级前记录已装包身份，备份对应 profile 的 `package.json`、`pnpm-lock.yaml` 和自定义 `cordis.patch.yml`。现行身份是 `@pioneer_zmc/dsh-workbench`。使用 README 中同 profile 的精确版 add 命令；完成后核对版本和原配置再启动。

重复安装相同版本可能不会更新实际文件。只有确认需要重装时，才用**同一 CLI、同一 profile**移除实际已装插件再 add。例如桌面当前身份：

~~~powershell
& "$DesktopDir\resources\runtime\cli\bin\dsh.cmd" plugin --profile desktop remove '@pioneer_zmc/dsh-workbench'
& "$DesktopDir\resources\runtime\cli\bin\dsh.cmd" plugin --profile desktop add '@pioneer_zmc/dsh-workbench@0.2.3' '--registry=https://registry.npmjs.org/'
~~~

`$DesktopDir` 沿用 README 中的实际安装目录。Web 使用自己的 CLI 和 `--profile web`。不清空数据根、其他插件或项目资料；不同时安装两种 SpecDev 包身份。重装后核对原自定义配置，不凭命令退出成功认定资料、配置都已恢复。

### GitHub 本地包安装

从 [0.2.3 Release](https://github.com/pioneer666-user/specdev-workbench/releases/tag/v0.2.3) 下载 `specdev-dsh-workbench-0.2.3.tgz` 和 `SHA256SUMS.txt`，对照 SHA256，再将包放在无空格路径。用对应 CLI 的 `plugin --profile desktop add <本地tgz路径>` 或 `plugin --profile web add <本地tgz路径>`；先遵守上面的停机、数据根和配置保护要求。Windows 可用 `Get-FileHash -Algorithm SHA256 '<本地tgz路径>'` 计算摘要。

两渠道发布的是同一固定包。GitHub 附件在本次执行环境的正式匿名完整下载未验证通过；草稿认证完整读回及 npm 完整下载已核对。浏览器网络与命令行可能表现不同，不能把能打开网页当完整安装包已校验。

## 从资料到第一个房间

### 选定项目

在 DSH 创建或选择 Git 仓库顶层工作区，再打开侧栏工作台。桌面在中央面板打开，可「返回聊天」；Web 在新标签打开。工作台列出项目名称和完整路径，确认自己选对项目。

空列表先创建工作区并刷新；读取失败可重试，手动配置入口仍保留。原本配置过 `repoRoot` 的用户先核对原值，不为解决空列表新增重复插件条目。仅确需手动指定时，在原配置条目按 ID 修改：

~~~yaml
- id: specdev-workbench
  config:
    repoRoot: '<你的实际Git仓库顶层路径>'
~~~

保留该条目其他自定义字段，不复制占位符运行。资料须符合 `docs/specdev` 的现行登记格式，散落在仓库里的文档不会自动变成已登记业务。

### 整理／登记资料

在选定项目的聊天中使用随包 [specdev-business](../../skills/specdev-business/SKILL.md)。提供业务名称、目标仓库、可提交分支、需求或现有文档，并告知实际工作台入口；缺信息由 AI 集中确认。README 中的自然语言示例可直接替换主题和需求使用。

技能会整理规格，按需要制作 workflow 或 lifecycle 图、节点说明和登记文件。`project.json` 登记项目，`business.json` 登记业务及文档路径，图目录以 `chart.json` 登记；文档引用仓库根相对路径，可以留在原位置。这里只解释文件作用，不要求初学者手写 JSON。

新设计明确标记为拟定设计，不能编造已实现的代码依据；维护已有业务时保留真实证据。图和登记必须按技能完成相应校验，最后由你查看内容。资料不是自动从代码反推的正确结论，未决需求仍需你裁决。页面保存版本只为**已提交内容添加附注 Git 标签**，不代你提交文件、改分支；是否保存由你决定。

### 布置并校验

已有登记资料者可直接使用 [specdev-room](../../skills/specdev-room/SKILL.md)：指定当前项目、业务名称和森林／陶瓷风格，说“其余布置你安排”即可让 AI 决定组合；也可指定极简、数量、必选或禁用家具。家具图鉴支持勾选后复制清单回聊天。

技能读取同一实际安装包的模板、家具目录和尺寸，以[成品样板](../../skills/specdev-room/references/furnished-layouts.md)为起点适配真实业务，绑定本业务已登记资料。森林对应 `fairy`，陶瓷对应 `ceramic`。只写 `docs/specdev/<业务ID>/room.json`，不改业务正文、图、建筑蓝图或安装包，也不生成／下载模型。

试摆和位置／承载面推荐只提供有界建议，不自动写回，不保证任意坐标合法。最终必须用**实际安装包**的入口完整检查：

~~~text
node "<实际插件包根>/dist/check-room.js" "<实际Git项目根>" "<业务ID>" --json
~~~

让 AI 从技能实际加载路径定位包根，不猜个人安装路径，也不为校验自动构建。只有退出 0、`kind=checked`、`ok=true` 才算房间配置和登记资料检查通过；图编译另验。可达性暂未确认不能放行，不能删资料绑定、缩小人物或绕过规则凑通过。同一问题两轮修复仍失败应带诊断返回。校验不代替你看观感、点资料、实际行走；不同模型、风格或宿主的建房效果并未全面验证。

## 在房间里使用

- 总览看布置，行走模式进门并走到阅读处；整栋建筑总览／行走仍由 [specdev-building](../../skills/specdev-building/SKILL.md) 支持。
- 十二款家具包括书架、书桌、台灯、告示牌、展示台、花瓶、盆栽、书堆、床、阅读椅、矮柜、落地灯，均可绑定已登记文档和图；纯装饰可以不绑。选家具和打开资料是两个动作，完整目录在「房间家具 → 展开浏览 → 全部房间资料」。阅读暂停行走，关闭后回到原浏览位置。
- 太阳按钮快捷调亮度；声音主按钮开关全部声音，小箭头只展开总音量、不自行启声。设置分“显示／天气／声音”，切换时窗口稳定，内容内部滚动。
- 雨量、环境声、脚步和雨声音量在设置中调节。亮度联动昼夜，雨天有湿润反射；森林鸟虫背景随雨量淡出，在 30 时归零。后台停声，回来在音量层手动点「点击继续播放」。
- 亮度、天气、声音方案／音量和显隐仅属本次页面，刷新或重进恢复默认。总览可临时隐藏家具，进入行走前自动恢复，不写回布局。没有坐卧动画或家具灯光开关。

## 导出与分享

点击「导出房间」，选择当前业务资料，再点击「导出 HTML」。全不选可只导出房间。导出可保留所选主题／亮度，首次仍晴天且声音关闭，不携带天气、声音偏好。

房间与所选已登记 Markdown 文档、workflow／lifecycle 图可离线阅读；不打包整个项目或历史。插件内从本地 Git 固定提交读精确源码；分享 HTML 只提供远端固定提交链接，不携带仓库源码片段，外链需联网／私仓权限。产品不自动验证外链可达性。文档本身可能含代码或敏感文字，分享前检查内容和范围。

外部文档图片不随包，阅读时显示占位。限额：64 文档、16 图、32 MiB 输入、64 MiB HTML 输出。生成失败／取消后可以重新选择；发起下载不等于文件保存成功，必要时点「下载文件」。插件不在项目里另存 HTML，保留你下载到的位置；关闭导出层释放临时数据，下一次导出重新生成。

## 历史迁移与完整限制

现行包 `@pioneer_zmc/dsh-workbench`，插件／侧栏 ID `specdev-workbench`，客户端模块 `@pioneer_zmc/dsh-workbench/client`，页面和 API 前缀 `/specdev-workbench`。资料根 `docs/specdev`，六类正式 schema `specdev/*/1`，建筑格式和快照标签采用 SpecDev 命名，快照前缀为 `specdev/`。

0.1.x 的 `archify-maker`／`archify-house` 变为 `specdev-business`／`specdev-building`，新增 `specdev-room`。只读新根、新格式和新标签，不提供旧 URL 或技能别名，不保证旧书签；旧文件、标签保留，不自动迁移。每个旧项目应单独约定迁移，不能批量改名；已登记资料仍可引用原仓库位置。

历史 GitHub 0.2.1 身份为 `@specdev/dsh-workbench`，npm 0.2.1 为 `@pioneer_zmc/dsh-workbench`，更早版本为 `@specdev/dsh-archify-manage`。旧标签和包不覆盖，所有旧版本无损迁移未验证。[GitHub 0.2.1](https://github.com/pioneer666-user/specdev-workbench/releases/tag/v0.2.1)、[GitHub 0.2.2](https://github.com/pioneer666-user/specdev-workbench/releases/tag/v0.2.2)及 [npm 0.2.2](https://www.npmjs.com/package/@pioneer_zmc/dsh-workbench/v/0.2.2)保留。旧截图也原位保留：[陶瓷](https://raw.githubusercontent.com/pioneer666-user/specdev-workbench/v0.2.2/web/assets/screenshots/ceramic-room.png)、[童话](https://raw.githubusercontent.com/pioneer666-user/specdev-workbench/v0.2.2/web/assets/screenshots/fairy-room.png)。

制作／登记支持 workflow、lifecycle；时序图及其他上游图种尚未开放为业务资料。旧流程图阅读与历史快照兼容，不自动升级旧图。支持地面摆放及一层台面承载，不支持页内家具编辑、任意缩放、墙挂、嵌套承载、跨房连接、坐卧动画。

验证范围限 Windows / DSH Desktop、Web 0.2.0-rc.2；其他平台、真实系统主题模式、未来宿主和全部旧版本迁移未覆盖。房间与资料共同运行的性能只代表已验机器和资料，不保证任意复杂 JS 页面都流畅。

## 源码构建与开发示例

仅源码开发者需要本节。取得[公开源码仓库](https://github.com/pioneer666-user/specdev-workbench)，在**该插件源码仓库根**使用 Node.js ≥22 依次运行；npm 安装包含运行产物，不含源码构建脚本：

~~~sh
npm install
node node_modules/typescript/bin/tsc --noEmit
node scripts/build.mjs
npm pack --ignore-scripts --pack-destination .
~~~

生成 `pioneer_zmc-dsh-workbench-0.2.3.tgz`；渲染器和只读校验器已随源码提供，不依赖研究仓。要阅读本指南请用 main；要复现原发布源码可检出 `v0.2.3`，该标签不会包含发布后指南。

开发用虚构资料生成器：

~~~sh
node sample/generate.mjs ./local-artifacts/demo-project
~~~

目标目录必须不存在，不覆盖现有项目；生成后将目标作为 DSH 工作区打开。它含兼容和故意损坏的测试资料，不是前面的成品房间示例。详见 [sample 说明](https://github.com/pioneer666-user/specdev-workbench/blob/v0.2.3/sample/README.md)。可按需串行运行 `node scripts/smoke.mjs`、`node scripts/check-save.mjs`，使用独立示例，不操作你的业务项目。

许可、模型／音频来源及 Archify、Marked、Three.js 等第三方声明见 [README 许可与致谢](../../README.zh.md#许可与致谢)；相关原文随源码和包保留。

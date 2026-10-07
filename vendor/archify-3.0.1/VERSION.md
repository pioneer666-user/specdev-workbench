# 官方 Archify 3.0.1 · 原样 Node 闭包

来源：https://github.com/tt-a1i/archify，v3.0.1提交`2ab3cae7ac2c2a55d7386ca789d03c4fcd31816c`。T23新增7份lifecycle必要原件，闭包现为36文件；原29份字节保持，新增件与T16固定来源逐项一致。摘要见manifest.json；MIT在LICENSE，模板内字体SIL OFL原文保留。官方文件不手改。

范围：workflow、sequence及lifecycle直接Node入口、相对import闭包、完整模板和对应schema/common及package。新增lifecycle renderer/grid-routing、architecture routing/labels、共享route-quality/desktop-readability和lifecycle schema；architecture只是依赖，不代表开放该图种。没有总CLI、示例、Skill或上游测试。

消费方：`src/core/archify-render.ts`/`archify-evidence.ts`，装配为dist/archify-node.js。workflow已沿T18–T21正式阅读链消费；lifecycle在T23仅类型/读取/保存/CLI，页面、房间和Skill尚未接入。sequence保留内部能力，无业务登记。远程品牌对象明确拒绝，内置品牌按官方处理。

维护：`node scripts/vendor-archify301.mjs --source-root <固定官方检出绝对根>`，必须显式给源根，HEAD和全部指纹匹配才原样复制；`--check`只核对当前包。无默认工作区archify来源、无下载/升级/旧vendor刷新。版本变化必须另单，同时更新清单、固定摘要和证据。

旧`vendor/archify-renderer/`、刷新脚本、阅读页及现行制图校验入口完整保留。下一单迁移消费、旧数据兼容和作者验收完成后，才可决定退役；本单无移除授权。

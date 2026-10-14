# 已有小摆件绑定资料（T34）

纯装饰可以不绑定，不为每件家具编造内容。本包正式台灯/花瓶/盆栽/书摆均有资料能力；仍读取当前包asset.json核实，未知或无能力占位资产拒绝。

1. 读取获准业务的完整room.json、business.docs与已有小摆件instanceId；资料必须已登记，正文不改，图按已有chartId规则。下面只示范一条binding，不是一份新房间配置：

```json
{"instanceId":"existing-plant","action":"open-document-collection","documents":["docs/花园札记.md"],"title":"窗边花园","summary":"花园札记记录了每周照料与观察，可以在这里慢慢读。"}
```

2. 确认原文确有照料/观察内容再填写介绍；否则省略summary。title最多80、summary最多280个Unicode码点，出现时非空白字符串，纯文本展示。名称/简介不作资料身份，不自动概括、不推断完成状态。
3. 在同一完整room.json里，已有该instanceId的binding就最小更新那条，没有才追加；保留其他实例/绑定/文档顺序与父家具局部依附，不按名称或坐标找目标，不为每家具新建JSON。
4. 完整检查仍必须：`node <当前包>/dist/check-room.js <仓根> <业务ID> --json`。只有退出0、kind=checked、ok=true算数据通过，试摆/推荐通过不免资料读取；按准确字段处理BINDING_INPUT，两轮同问题未解决即返回。

非空集合有小资料标记，纯装饰无标记，空集合仍可打开原空态。分享选中的资料时，所在家具的名称简介一起分享；集合全部未选则删除自定义文字，显示“此资料未随包导出”。最终观感与实际阅读由作者验收。

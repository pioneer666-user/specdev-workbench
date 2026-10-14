# 公开试摆接口（0.2.3候选）

T31在同一checker兼容新增单件floor的`suggest(layout,{instanceId})`；原check签名/结果保持。[有限推荐契约与新增/已有父子短例](placement-suggestions.md)说明48次正式校验、1500ms、无结果与截断；不替代本页试摆或最终完整检查。

以本次实际resourceBase.path或SKILL.md位置向上两级定位同包；先核包身份和三个dist入口。缺新增入口即报告候选能力缺失，不import内部web模块。

少量单次候选：

```text
node "<实际包根>/dist/check-placement.js" "<自有候选room.json>" --json
```

连续局部调整：用pathToFileURL导入同包`dist/room-placement.js`，`await createRoomPlacementChecker()`无参数；返回`checker.check(layout)`同步接收一个完整内存room.json对象，无选项、预算或路径覆盖。成功初始化只读当前包模板/占位及正式家具一次；新checker重新读元数据。不访问业务仓、绑定正文或图源，不启服务、不渲染、不联网、不安装依赖。每次调用原正式validatePlacement，不修改输入；每份返回值独立，可保存为证据，调用方修改它不影响checker。初始化资源失败抛出带code/message和diagnostics的错误，不降级；正常结构/摆放问题返回诊断。

结果为schemaVersion=1、scope=placement、kind=checked/failed、ok、status、diagnostics、unchecked；有可达性结果时含reachability.status/reason/stage，不返回模型。confirmed通过，invalid静态拒绝，unconfirmed暂未确认可达，两种拒绝必须区分；诊断保留code/message/fieldPath/instanceIds/targetId。独立调用可能在200ms预算触顶处不同，不能承诺时间确定性。当前入口不检查业务归属、绑定有效性、资料可读性（unchecked逐项标明），layout结构本身仍按正式规则检查，businessId/bindings不得删除或改写为过检。

CLI只读取指定本地JSON，支持绝对或cwd相对的含空格路径，普通文件最大2MiB，不递归扫描、不执行脚本。退出0仅摆放通过，1是摆放问题或REACHABILITY_UNCONFIRMED，2是用法/读取解析/资源错误；JSON模式stdout只有一个结果，没有混合日志。非JSON是简短中文。

[有限试摆示例](../assets/try-placement.mjs)只读取自有候选，不写回、不自动寻找位置，针对该候选的指定floor实例和仍合规的自选坐标/朝向演示最多一次局部修改（原始检查＋修改后检查），总计不超过两次。示例不适合任意资产通用套用；从真实元数据及授权范围确定实例与数值。临时材料依调用方工作区约定安放，不复制真实项目或给真实业务添加持久文件：

```text
node "<实际包根>/skills/specdev-room/assets/try-placement.mjs" "<自有候选room.json>" "<floor实例ID>" "<自选X>" "<自选Z>" "<允许yawDeg>"
```

同问题两轮具体修复后仍失败必须停，保留每轮修改和诊断；运行示例和CLI不能重新计算轮数。成功选定候选并写回获准room.json后，**必须**运行原完整检查：

```text
node "<实际包根>/dist/check-room.js" "<Git仓库顶层>" "<业务ID>" --json
```

完整检查仍读取业务、绑定及全部登记资料，试摆通过却坏绑定或缺资料必须失败。最终完整检查通过再交作者视觉、点击和行走验收；本例运行不代表陌生AI完整使用体验已验。

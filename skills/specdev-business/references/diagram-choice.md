# 按用户问题选图

用户已指定workflow或lifecycle就采用，不再强制选型问答。未指定时用一句理由推荐；只有业务对象有实质歧义才问。

- workflow：回答步骤如何推进、谁负责、条件分支走向；适合填写→校验→保存等跨角色过程。
- lifecycle：回答同一个对象有哪些状态、什么触发状态变化、该状态可做哪些动作；适合发布/暂停/关闭等有项目依据的对象状态。

这是固定Archify3.0.1 workflow/lifecycle说明的用途，不是套用示例规则。状态不是函数调用，多个独立对象不能混成状态机；未实现审核/撤回/重开不得添画。先列状态、进入/离开条件、动作、依据，并区分持久字段、推导状态与操作步骤。

每个业务按需要选图，不强制画两张。产品业务登记只支持workflow/lifecycle，sequence等仍不支持。workflow按[workflow.md](workflow.md)，lifecycle按[lifecycle.md](lifecycle.md)，共同出处/修改/来源按既有参考，不全量加载五图种。

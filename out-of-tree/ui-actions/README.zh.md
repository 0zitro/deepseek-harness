# @zitro/dsh-oot-ui-actions

[English](README.md) | 中文

动作与键绑定子系统：供特性插件贡献的 action registry（`ctx.uiActions`）、派生的 when-context 映射（`ctx.uiWhenContext`）、以及一个把手势与有效绑定——注册默认值合并用户逐席位覆盖——匹配并运行匹配动作的中央捕获阶段 keydown dispatcher。覆盖持久化在 `keybindings` 设置命名空间，在经 `settings.section` slot 注册的设置页里编辑（录制器、when 子句输入、优先级放置、逐来源溯源）。

编排器自己不拥有任何动作，也不绑定任何表面：组件声明 `FocusScope` 区域、在自己拥有状态时发布显式上下文键、注册动作；`ui-stock-actions` 提供内置动作集。设计依据见第一版分支的 keybinding-seats 决策与 [out-of-tree Agent
Note](../../.agents/notes/implemented/architecture/2026-09-03-out-of-tree-plugin-packages.zh.md)。

# Agent Note：富文本 composer 把"源码之上的装饰"编辑器移植到会话 shell 之上

Status: implemented

[English](2026-09-03-out-of-tree-rich-composer.md) | 中文

## 问题

原生 web composer 是纯文本 Lexical 编辑器：Markdown 只在发送后渲染、数学只在消息流里渲染，而 fork 的键绑定子系统刻意推迟了所有 `composer.*` 手势，因为没有接缝让外部表面驱动会话输入。第一版键绑定分支还在另一个宿主上（`claude-code-katex-patcher`）造过一个带装饰的数学 composer，其光标机制——进入/离开仲裁、点击到字形偏移映射、逐位置撤销——在那里被逐一测量成型，弃之可惜。

## 决策

`out-of-tree/ui-composer` 接管 `conversation.composer` chain 槽（优先级 −5，有业务交互待处理时让位），渲染一个从参考实现移植的"源码之上的装饰"编辑器：

- **隐藏，从不移除。** 缓冲区文本就是完整 Markdown 源码；装饰只负责样式与折叠。偏移由"所持文本"树遍历测量，跳过折叠表达式 KaTeX 绘制所在的 `data-ccx-draw` 子树——参考实现用 `Range.toString()` 读偏移，因此被迫选用 MathJax-SVG（输出不携带文本）；树遍历让携带文本的 KaTeX HTML 毫无代价。复制、剪切与发送携带源码；折叠标签上的一列报告其下方的字符。
- **由文法驱动的实时装饰。** @lezer/markdown 绘制闭合构造并淡化标记符；悬空起始符处理把仍开着的 `_`/`**`/反引号尾部样式化到行尾，可与已闭合构造叠加，代码内部由解析本身抑制。数学是解析器构造（remark-math 的等宽规则），代码段里的 `$` 根本不可达，无需排除。
- **字形映射安全失败。** 源码记号（命令名与 `\begin{env}` 各为一个记号；转义锚定在反斜杠）与 KaTeX 绘制字符经 LCS 对齐配对，NFKD 归一，只写下一个反序（`.msupsub` 自下而上访问上下标），未配对字形取其间隙起点。错误姿态沿用参考实现：少放锚点，绝不放错。
- **会话平面复用原生 shell。** 本表面是唯一写者（每次编辑 `setDraft`）；shell 侧变更被收养回来；提交准入、排队/转向、通知、图片摄入与草稿持久化全部继承而非重实现。撤销由表面以 `(text, selection)` 快照拥有，逐召回位置独立栈——装饰每击键重写 DOM，原生撤销追踪的是投影。
- **chain 条目拥有自己的完整 chrome。** slot 注册表按声明条目授权子渲染，原生 bar 的 chrome 槽（附件栏、模型座、触发菜单）无法从接管方重渲染——与审批和提问接管相同的条件。chrome 从输入触发控制器自己的 store 渲染自己的触发菜单；`rich-composer.enabled` 设置开关让出选举、恢复原生 bar（其状态全程由 chain 的 overlay 契约保持挂载隐藏）。

三处增量上游编辑支撑它：`ui-input-trigger` 客户端面导出 `detectTrigger`、`ui-primitives` 导出高亮面、`SessionInput`/`SessionInputResolver` 扩宽为完整 shell 动词集加上 `IConversation` 的浏览器本地图片面——shell 类本就实现了每个扩宽成员，只是接口此前把它们收窄给了原生 bar。

`ui-stock-actions` 现在把推迟的 `composer.*` 与 `commandPalette.*` 手势注册到本包提供的 `ctx.composer` 服务上；编辑器内置处理器仍是手势未绑定时的回退，并在绑定认领按键时（经 `defaultPrevented`）让位。

## Alternatives considered

- **给原生 Lexical 编辑器加装饰插件。** Lexical 拥有文档模型；把数学折叠进去意味着 DecoratorNode 原子经变换往返源码，而参考实现的偏移不变量（隐藏的文本仍是文本）在 Lexical 里没有对应物。纯文本可编辑区让浏览器继续当编辑器。
- **按优先级遮蔽 `conversation.composer.bar` 单槽。** 注册表对第二次单槽注册直接抛错；替换 bar 不是 slot 系统提供的机制。
- **从接管方重渲染原生 chrome 槽。** 子渲染权属于声明条目（原生 bar）；按条目放松授权会让任何条目渲染任何槽，而这正是注册表要守住的性质。
- **独立的 OOT 会话平面。** 单缓冲、无推送/收养回声——但要重实现提交准入、忙碌回车解析、通知与草稿持久化，还脱离了它要喂给的触发管线。

## 影响

- 接管当选期间，原生 bar 的 chrome 占用者（附件栏呈现、模型与计划座、原生 MenuView）不显示；开关是逃生门，第二阶段以扩展 OOT chrome（词元芯片、队列 dock）的方式补齐，而不是伸手回 bar 的子槽。
- 触发选中的插入落在缓冲区末尾（接管下 shell 的编辑器未聚焦）；插入点路由随第二阶段到来。
- OOT 测试类型检查经 `tsc -b out-of-tree/tsconfig.client.json` 运行，带受控 `outDir`：没有 outDir 的 composite 聚合会向其程序触达的每个源码旁发射声明文件——游离的 `.js`/`.d.ts` 文件因此出现过两次，直到 outDir 把它关住。

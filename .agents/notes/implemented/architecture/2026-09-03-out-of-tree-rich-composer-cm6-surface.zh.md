# Agent Note: 富文本 composer 的编辑表面改为 CodeMirror 6

Status: implemented

[English](2026-09-03-out-of-tree-rich-composer-cm6-surface.md) | 中文

## 问题

v1 composer 在 `contenteditable="plaintext-only"` 的 div 上原地装饰：每次击键都是浏览器对 DOM 的自有编辑，而装饰又在重写同一个 DOM，两者争夺一个缓冲区。实测反复暴露的都是同一*类*缺陷，每一个都用又一层补偿修补——浏览器对不肯绘制的换行以两个换行应答（由测得的 `beforeinput`/`input` 通道外加光标亲和移除）；折叠岛周围读到的光标与可视光标不一致（`offsetOf` 反演表）；自身推送经 shell 收养回声（所持文本比对守卫）；重装饰须在不丢弃亲和的前提下恢复选择。每个修补都正确，而每个修补都证明这一层是错的：偏移、补偿、回声，全是"既不拥有文档也不拥有编辑"的产物。

## 决策

`out-of-tree/ui-composer` 以 **CodeMirror 6** 替换编辑核心，落位 `conversation.composer.editor` 槽；浏览器不再编辑缓冲区，该缺陷类是被删除而非被修补的。

- **文档即源码。** CM6 拥有缓冲区；输入成为事务；装饰是喂给 ViewPlugin 的纯构建器（`buildDecorations(doc, {colorFor, head})`）。逐字源码不变式——所有补偿所保卫的东西——由构造保证，jsdom 也不必再断言它：没有可漂移的东西了。
- **消亡的部分。** `attach.ts`、`text.ts`（所持文本遍历）、`selection.ts`、`reconcile.ts`、`undo.ts` 及其测试：占位符补偿、光标亲和移位、选择往返、原地 DOM 调和，以及手写的 `(text, selection)` 历史（CM6 的 `history()` 接管撤销；逐召回位置栈推迟到上游出现召回导航）。
- **幸存的部分。** 整个引擎：Lezer 文法及其数学/删除线扩展、带逐字符类叠加的悬空起始符通道、Shiki 围栏着色，以及带 LCS 对齐和 `data-ccx-at` 戳的 KaTeX 字形映射。折叠现在是带 widget 的 `replace` 装饰；折叠跨度是 `atomicRanges`，即"方向键整跨、边缘删除整取"的 CM6 原生形态。
- **打开是推导的，非状态的。** 光标*严格*处于其内的可折叠对象按 Markdown 源码绘制——没有需要在收养间验证的 `opened` 变量。严格而非含边界：停在边缘的光标读到的对象是折叠的，这正是边缘整删成立的前提（含边界的变体试过，恰在此处破坏）。点击绘制以最近的带戳字形应答——一次派发同时打开折叠并落下光标，取代参考实现的两段式光标。
- **手势按层分治。** 键绑定分发器在 window 捕获阶段以 `preventDefault()` **加 `stopPropagation()`** 认领已绑定的手势（CM6 的元素处理器不必尊重 `defaultPrevented`；传播停止是一般解，落在 `ui-actions`）；表面的 `onKey` 在 `Prec.highest`、先于 CM6 键映射认领 composer 自有的手势（菜单仲裁、空格、加速和弦）；一切未绑定的穿过——纯 Enter 经 `defaultKeymap` 换行。
- **Widget 事件显式加入。** `WidgetType.ignoreEvent` 默认为 *true*（widget 自持其事件）；数学与注释 widget 覆写之，编辑器的 mousedown 才能到达字形戳路径。这是唯一一个静默吞掉"点击打开"契约的 CM6 默认值。

`@codemirror/*` 依赖与 fork 其余闭包一样内联打包，钉在经过评审的 2026-08-31 发布列车上（`view` 为精确版本——其下一版晚于仓库供应链的发布年龄窗口，否则就得把它豁免出 `minimumReleaseAgeExclude`）。

## 考虑过的替代方案

- **继续修补原地装饰核心。** 每次修补都在局部正确，而缺陷类挺过了它们；参考 composer 做同样的测量是因为宿主没有编辑器框架，不是因为那些测量就是设计。
- **在原生编辑器上做 Lexical 装饰插件。** 再次考虑并再次否决：Lexical 的文档模型没有"隐藏文本仍是文本"的对应物，DecoratorNode 原子把源码经变换往返，字形映射无处锚定。
- **在 v2 保留逐位置撤销栈。** `EditorState.toJSON/fromJSON` 支持，但上游不存在可挂钩的消息召回导航；让核心迁移背负一个无法行使的特性，只会把迁移耦合到死状态上。

## 后果

- 与浏览器搏斗的那一层从 fork 中消失：没有任何文件再持有换行占位符、光标亲和移位或所持文本遍历，后来者除非重新引入 contenteditable 核心，否则无法回归到那一类缺陷。
- `ui-actions` 的分发器如今在每次认领时停止传播，任何未来挂载在 window 之下的编辑器（不限于 CM6）都免受已认领按键的影响。
- composer 的 client bundle 因内联 CM6 闭包而增大（构建前约 1.3 MB）——这是 fork 自己的 patch bundle，按设计对根部门禁不可见。
- fork 里的 widget 作者须记住 `ignoreEvent` 默认为 true：想让编辑器处理事件的 widget 要显式加入。
- CDP 浏览器套件如今承载用户在原地装饰核心上上报的每个缺陷的真实按键回归，该缺陷类被钉死在死亡状态。

## 验证

`cm-decorations.client.spec.ts` 把分段断言移植为 DecorationSet 查询（叠加、代码抑制、flanking、折叠形状、按源码打开、围栏着色）；`cm-surface.client.spec.tsx` 钉住 shell 契约（唯一写者推送、带文档相等空操作的单事务收养、先于键映射的认领、文件粘贴）；CDP `caret.browser.spec.ts` 以真实按键钉住上报的缺陷——```` ``` ```` +Enter 光标落位、尾行持久、`x`-Enter-`y`、围栏中行键入、字形偏移点击扫描、原子边缘删除、分组撤销/重做——另加开发服务器上的实测（折叠、点按字形打开、光标离开重折叠、`/` 触发菜单、卡片内带样式的 KaTeX）。

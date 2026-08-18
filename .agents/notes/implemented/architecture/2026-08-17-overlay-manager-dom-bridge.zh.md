# Agent Note: Overlays contribute through DOM events, not through a Cordis context

Status: implemented

[English](2026-08-17-overlay-manager-dom-bridge.md) | 中文

## Problem

Escape 关闭过去是每个浮层各实现一次。菜单、模态框、灯箱与气泡卡各自挂上 window 或 document 监听器，各自判断某次 keydown 是不是属于自己，而没有谁知道同时打开的几个浮层里哪一个在最上层。两个同时打开，结果要么两个都关，要么关错一个，取决于监听器的顺序——一个谁也没有选择过的顺序。

把 Escape 改走动作（action）这条路，在变好之前先让问题更严重。快捷键分发器需要一个可调用的处理器和一个用来把关的谓词，而这两样都不存在：没有任何子句可以指名的 `overlayOpen` 状态键，也没有可以接收关闭命令的收件人，因此 `overlay.close` 无物可关。

放注册表最顺理成章的地方是持有浮层原语的那个包，而那个包恰恰不能有注册表。`ui-primitives` 是刻意不依赖 Cordis 的：它持有纯 React 原子组件，任何界面无需插件上下文即可使用，整棵客户端树都依赖这一点。让 `OverlayScope` 去调用一个 Cordis 服务，等于为原语的每一个消费方反转这条依赖。

## Decision

`OverlayScope` 用 DOM 事件宣告自身。挂载时派发 `dsh:overlay-open`，卸载时派发 `dsh:overlay-closed`，并监听派发到它自身元素上的 `dsh:overlay-close`，收到时执行自己的 `onClose`。因此该原语对谁在监听一无所知，`ui-primitives` 也保住了自己零依赖的形态。

另一半是 `ui-overlay` 中的 `overlays` 服务。它按挂载顺序跟踪存活的 scope，正是这一点让「最上层」成为事实而非竞态；它发布供 `when` 子句求值的 `overlayOpen` 上下文键；并暴露 `closeTop()`，向最上层 scope 派发 `dsh:overlay-close`。由 `ui-stock-actions` 注册的 `overlay.close` 只是一个调用该方法的普通动作，因此 Escape 是被绑定的、可重新绑定的，也像其他绑定一样受把关。

事件名就是这两个包之间的约定。浮层通过挂载该原语来贡献自身，并凭借成为最上层的贡献者来接收命令；两个方向都不要求它触及 Cordis 上下文，也不要求它知道管理器的存在。

## Alternatives considered

- **在 `ui-primitives` 中放一个 React context 或 hook**：否决——这会迫使原语的每一个消费方都挂一个 provider，而 provider 又必须来自持有注册表的地方，那正是这个包刻意不依赖的 Cordis。
- **把注册表句柄经 props 逐层传下去**：否决——每个浮层的持有方都得把一个它本不需要的句柄穿过自己的 props，而忘记传的界面不会报错，只会悄悄缺席于排序之外。
- **把管理器放进 `ui-primitives` 并由它持有状态**：否决——这份状态是应用状态（什么开着、按什么顺序），而原语包是一个组件库。一旦还有别的东西需要观察浮层，这样做还会让两个包都有理由持有同一份注册表。
- **保留每个浮层各自的 Escape 监听器，只补上上下文键**：否决——这个键报告的顺序并不被那些监听器遵守，于是子句可以正确地声称有浮层打开，关掉的却是错的那个。

## Consequences

浮层由单一权威排序，因此 Escape 关闭最上层的那个，而 `when` 子句无需询问任何浮层即可指名 `overlayOpen`。代价是一处无类型的接缝：DOM 事件名是两个包共享的字符串，在其中一侧改名，在另一侧只是无声失效，而不是类型错误——这正是让原语保持不依赖插件上下文所付的价钱。

迁移按设计是渐进的。尚未包裹进 `OverlayScope` 的浮层保留自己的 Escape 处理器，也留在排序之外，因此两套机制会共存到最后一个完成迁移为止；这部分残留是该包明确写下的限制，而不是一个被藏起来的状态。

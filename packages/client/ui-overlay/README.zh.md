# @deepseek-ai/dsh-client-ui-overlay

[English](README.md) | 中文

浮层管理器。浮层（菜单、模态框、灯箱、气泡卡）通过 `ui-primitives` 提供的 `OverlayScope` 原语声明自身，该原语在挂载与卸载时分别派发 `dsh:overlay-open`／`dsh:overlay-closed` DOM 事件。`overlays` 服务按挂载顺序跟踪这些 scope，并发布 `overlayOpen` 上下文键；`overlay.close` 动作（action，由 `ui-stock-actions` 注册）调用 `closeTop()`，后者向最上层 scope 派发 `dsh:overlay-close`，由该 `OverlayScope` 自行执行它的 `onClose`。

这条桥接走 DOM 事件而不是 React 钩子，是因为 `OverlayScope` 位于不依赖 Cordis 的 `ui-primitives` 包中：浮层无需触及 Cordis 上下文，即可贡献和接收命令。

## 模型体验

无。该包只跟踪呈现层面的浮层状态；这里没有任何内容进入模型请求。

#### KV Cache 影响

无；该包既不组装也不发送提供方请求。

## 已知限制与暂缓事项

- **Escape 监听器仍在逐步迁移**：尚未包裹进 `OverlayScope` 的浮层，各自保留自己的 window／document Escape 处理器。

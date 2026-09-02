# @zitro/dsh-oot-ui-overlay

[English](README.md) | 中文

浮层管理器（`ctx.overlays`）与 `OverlayScope` 原语。scope 通过 `dsh:overlay-open`/`dsh:overlay-closed` DOM 事件宣告挂载/卸载——这个字符串接缝让原语保持无 Cordis 依赖——管理器按挂载顺序跟踪元素（LIFO 最上层），把 `overlayOpen` 发布进 when-context，并为可重绑的 `overlay.close` 动作应答 `closeTop()`。scope 不绑定任何按键；哪个手势关闭浮层是键绑定的事，不是组件行为。

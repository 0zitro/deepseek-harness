# @zitro/dsh-oot-ui-stock-actions

[English](README.md) | 中文

面向 out-of-tree 表面的内置动作集，经 `ctx.uiActions` 注册，带本地化标签和默认键绑定。第一天提供 `overlay.close`（Escape，以 `overlayOpen` 为门）。`composer.*` 与 `commandPalette.*` 随 out-of-tree composer 接管一起到来，届时才会暴露它们的 run 接缝；旧分支针对上游 composer 内部实现的那些注册被刻意置为伪造。

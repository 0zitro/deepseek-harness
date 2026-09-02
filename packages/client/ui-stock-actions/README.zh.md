# @deepseek-ai/dsh-client-ui-stock-actions

[English](README.md) | 中文

内置 UI 动作（action）及其默认快捷键。浏览器侧向快捷键编排器提供的 `uiActions` 注册表注册编辑器相关的动作：`composer.send`（默认 Enter，遵循「忙碌时 Enter」偏好设置的聚合动作），以及默认未绑定的两个原始退出通道 `composer.queue` 与 `composer.steer`；编排器随后持久化每条绑定，并渲染它的设置行。每个动作的 `run` 都调用 `ctx.composer` 提交服务。

该包是一层可直接摘除的贴附层：内置动作放在这里而不是放在编排器里，编排器因此与具体动作无关，上游 fork 也保持干净可合并——删掉这个包，内置动作随之消失。

## 模型体验

无。该包贡献的是浏览器配置界面；这里没有任何内容进入模型请求。

#### KV Cache 影响

无；该包既不组装也不发送提供方请求。

## 已知限制与暂缓事项

- **目前只注册了编辑器相关的动作**：后续的内置动作（面板开关、导航）也加在这里，各自一次 `ctx.uiActions.register` 调用。
- **InputBar 仍直接处理 Enter**：快捷键分发器尚未成为唯一的提交路径；移除那处硬编码处理属于 `ui-conversation` 的独立改动。

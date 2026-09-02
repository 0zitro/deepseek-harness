# @zitro/dsh-oot-ui-widgets

[English](README.md) | 中文

面向 out-of-tree client 插件的共享控件库：预留空间 run（`FittedRun`、`ScrollingRun`、`RunRoom`）和可排序/可调宽表格（`Table`、`TableGroup`、`TableSash`、`TableSeam`、`TableGutter`，以及 `table-order`/`table-resize`/`table-runs` 三个核心）。纯渲染 React 组件，仅通过 `--dsw-*` 令牌样式化；无 service、无 `inject`。

作为动态 module-table 行提供。消费方在 `dsh.client.external` 中列出精确 specifier `@zitro/dsh-oot-ui-widgets/client` 并按裸名导入；模块图会把该行排在其消费方之前。

移植自第一版键绑定分支，这些控件当时作为上游代码住在 `ui-primitives` 里。

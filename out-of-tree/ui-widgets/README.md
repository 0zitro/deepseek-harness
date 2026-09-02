# @zitro/dsh-oot-ui-widgets

English | [中文](README.zh.md)

Shared widget library for out-of-tree client plugins: reserved-room runs
(`FittedRun`, `ScrollingRun`, `RunRoom`) and sortable/resizable tables
(`Table`, `TableGroup`, `TableSash`, `TableSeam`, `TableGutter`, plus the
`table-order`/`table-resize`/`table-runs` cores). Render-only React
components styled through `--dsw-*` tokens; no services, no `inject`.

Served as a dynamic module-table row. Consumers list the exact specifier
`@zitro/dsh-oot-ui-widgets/client` in their `dsh.client.external` and import
it bare; the module graph orders the row before its consumers.

Ported from the first keybindings branch, where these widgets lived in
`ui-primitives` as upstream code.

# Out-of-tree 模块

[English](README.md) | 中文

仅 fork 使用的插件包，通过 Cordis patch 组装扩展已发布的 web client，而不修改 `packages/`。本目录是一个 pnpm workspace glob（`out-of-tree/*`），但对所有根级门禁和构建都不可见：根 vitest include、根 tsdown workspace 列表、覆盖率门禁、枚举包的脚本全部硬编码 `packages/*` 路径。因此上游合并永远不会看到这些文件，这些文件也永远不接触上游内部实现的变动——它们只耦合有文档的 Cordis 扩展点（slot、service、patch 行）。该决策及其被否决的替代方案记录在 [out-of-tree Agent
Note](../.agents/notes/implemented/architecture/2026-09-03-out-of-tree-plugin-packages.zh.md)。

## 包

| 包 | 职责 |
| --- | --- |
| `@zitro/dsh-oot-ui-actions` | 动作与键绑定子系统：action registry、when-context、支持 chord 的中央 dispatcher、逐席位存储覆盖、设置页 |
| `@zitro/dsh-oot-ui-widgets` | 共享控件库（预留空间 run、可排序/可调宽表格），经 `dsh.client.external` 作为动态 module-table 行提供 |
| `@zitro/dsh-oot-ui-overlay` | 浮层管理器（LIFO 挂载顺序、DOM 事件桥）+ `OverlayScope` 原语 |
| `@zitro/dsh-oot-ui-stock-actions` | 把手势绑定到上述表面的内置动作集 |
| `@zitro/dsh-oot-web-profile` | 插入上述行的可安装 patch bundle |

## 架构

- **中央分发**：每个 out-of-tree 表面都不绑定按键。`ui-actions` 独占一个 window 级捕获阶段 keydown 监听，对照共享上下文映射（`data-focus-scope` 派生加上 `overlayOpen` 等显式键）求值 when 子句，并运行匹配到的已注册动作。哪个手势触发什么只是数据：默认值来自动作注册，用户的逐席位覆盖持久化在 `keybindings` 设置命名空间，在设置页的录制器里编辑。
- **浮层**：`ui-overlay` 通过 DOM 事件跟踪已挂载的 `OverlayScope` 元素的 LIFO 顺序（这座桥让无 Cordis 依赖的原语可以在任何组件树里使用），发布 `overlayOpen`，并为可重绑的 `overlay.close` 动作应答 `closeTop()`。
- **原生表面第一天不动**：上游组件保留自己的 Escape 监听。每个表面只在被 out-of-tree 接管替换时才迁移到 dispatcher 上——composer 优先，走 `conversation.composer` chain slot，其"fallback 保持挂载"的契约本就为接管而建。

## 挂载

开发——不改 profile，行锚定到本目录：

```sh
pnpm --filter '@zitro/dsh-oot-*' run bundle
pnpm dsh web --patch ./out-of-tree/cordis.patch.yml
```

可安装——bundle 行经 profile 的 node_modules 解析：

```sh
pnpm --filter '@zitro/dsh-oot-*' run bundle
pnpm dsh plugin --profile web add ./out-of-tree/web-profile
```

## 开发

```sh
pnpm exec vitest run --config out-of-tree/vitest.config.ts   # OOT suites
pnpm exec tsc -b out-of-tree/tsconfig.client.json            # OOT typecheck
pnpm --filter '@zitro/dsh-oot-*' run bundle                  # client bundles
```

包名使用 `@zitro/dsh-oot-*` scope（绝不用 `@deepseek-ai/dsh-*`），因此上游未来出现同用途的包也不会撞名。共享 client tsdown preset 经它的 `out-of-tree` glob 读取 OOT manifest；若上游移动该 preset，各包的 `tsdown.config.ts` 导入会响亮报错——这是唯一刻意保留的构建期耦合。

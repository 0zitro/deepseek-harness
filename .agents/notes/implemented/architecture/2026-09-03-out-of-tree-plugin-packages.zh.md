# Agent Note：out-of-tree 插件包通过 patch 层组装 fork UI

Status: implemented

[English](2026-09-03-out-of-tree-plugin-packages.md) | 中文

## 问题

fork 的第一版键绑定子系统（`feat/0zitro/ui-keybindings`）放在 `packages/client/` 里，触及了六处上游表面：InputBar 键位映射、ui-primitives（OverlayScope/FocusScope/Run/Table）、设置根组件、bundle patch、tsconfig client 聚合、以及设置网关白名单。上游对这些文件的每次重构——Lexical composer 重写和 apiproxy 移除都在该分支之后落地——都会把整个特性变成 git 文本合并的债务。fork 特性应当只耦合有文档的扩展点，让上游提交不再成为它的合并事件。

## 决策

仅 fork 使用的插件包放在 `out-of-tree/`，通过 Cordis patch 组装挂载；`packages/` 下没有任何代码导入它们。

- **目录**：`out-of-tree/*` 是一个 pnpm workspace glob。所有根级门禁和构建都硬编码 `packages/*` glob（vitest include、tsdown workspace 列表、覆盖率门禁、枚举包的脚本），因此这些包在构造上就对上游检查不可见；它们在 `out-of-tree/` 下有自己的 vitest 配置和 tsc 聚合。
- **挂载**：两条路径，都是上游扩展点。开发用 `pnpm dsh web --patch ./out-of-tree/cordis.patch.yml`，其中的相对行名由 `anchorInsertedPluginNames` 锚定到 patch 文件所在目录，解析到构建产物。部署则安装 `out-of-tree/web-profile`——一个 bundle 包（`dsh.bundle.patch`），行名是裸名，经 profile 的 node_modules 解析——用 `dsh plugin --profile web add` 安装。client 的 `modules` 行扫描活跃 loader 树，patch 插入的行无需在任何地方注册即可加入浏览器花名册。
- **共享控件**：`out-of-tree/ui-widgets` 把 Run/Table 作为动态 module-table 行提供；消费方在 `dsh.client.external` 中列出 `@zitro/dsh-oot-ui-widgets/client`（精确 specifier，遵循 gateway controller 的先例）并按裸名导入。`PLATFORM_MODULES` 由上游冻结，刻意不扩展。
- **持久化**：自 settings controller 的 `describe()` 投影起，设置网关服务所有已注册命名空间，所以旧的白名单编辑不再必要；host 半用标准的 `ctx.inject(['settings'], …)` 模式注册 `keybindings` 命名空间。

上游编辑共三处，全是增量：workspace glob、`tsconfig.base.json` 生成区域之外的手写 paths 块（`gen-tsconfig-paths` 看不见 OOT 包）、共享 client tsdown preset 的 `workspaceManifest` 里新增一个 glob（让 OOT 包能声明 `dsh.client.external`）。三处都是追加形态，上游改动无关行时不会冲突。

子系统本身移植自先前分支的"席位与贡献"键绑定模型（action registry、when-context、chord dispatcher、逐席位存储覆盖），其设计依据见第一版分支的 keybinding-seats 决策。原生组件第一天保留自己的 Escape 监听——patch 层无法移除它们——只有当某个 out-of-tree 表面接管那个槽位时才迁移到 dispatcher 上，从计划中的 composer 替换开始，走 `conversation.composer` chain slot，其"fallback 保持挂载"的契约本就为接管而建。

## Alternatives considered

- **把包继续放在 `packages/client/`**（第一版分支）：所有根级门禁、目录生成器和 client 聚合都会拥有它们，上游每重组一次 `packages/`，特性几乎碰不到的文件也要出合并冲突。
- **把 widgets 包加进 `PLATFORM_MODULES`**：该列表编译进 shell 内核和每个静态 bundle；把 fork 条目加进去会让冻结的模块表耦合 fork 的存在，而动态行机制本来就是为此存在的。
- **用无监听的克隆组件以更高 slot 优先级替换原生组件**：今天就能集中 Escape，但每个克隆都在重新 fork 上游组件内部实现——正是 OOT 布局要避免的维护成本。

## 影响

- `verify-cordis-config` 是唯一扫描 `out-of-tree/**/*cordis*.yml` 的门禁；这些 patch 文件按普通 overlay 文件满足它。
- 挂载前必须先构建 OOT client bundle（`pnpm --filter '@zitro/dsh-oot-*' run bundle`）；共享 preset 移动时 `tsdown.client.ts` 会响亮报错。
- `@zitro/dsh-oot-*` scope 让包名免于与未来任何上游等价物冲突；设置命名空间出于同样原因叫 `keybindings`。

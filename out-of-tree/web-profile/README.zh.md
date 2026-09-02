# @zitro/dsh-oot-web-profile

[English](README.md) | 中文

把 out-of-tree UI 模块挂载到 dsh profile 的可安装 patch bundle。它的全部内容就是 `cordis.patch.yml` patch 层（四个模块的裸名行）加上这个入口模块。构建完模块包之后（`pnpm --filter '@zitro/dsh-oot-*' run
bundle`）安装：

    pnpm dsh plugin --profile web add ./out-of-tree/web-profile

架构与开发期的 `--patch` 替代方案见 `../README.md`。

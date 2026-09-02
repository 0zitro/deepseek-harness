# @zitro/dsh-oot-web-profile

English | [中文](README.zh.md)

Installable patch bundle mounting the out-of-tree UI modules on a dsh
profile. Its whole content is the `cordis.patch.yml` patch layer (bare-name
rows for the four modules) plus this entry module. Install with:

    pnpm dsh plugin --profile web add ./out-of-tree/web-profile

after building the module packages (`pnpm --filter '@zitro/dsh-oot-*' run
bundle`). See `../README.md` for the architecture and the development
`--patch` alternative.

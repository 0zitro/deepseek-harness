# @zitro/dsh-oot-ui-stock-actions

English | [中文](README.zh.md)

The stock action set for out-of-tree surfaces, registered through
`ctx.uiActions` with localized labels and default keybindings. Day one ships
`overlay.close` (Escape, gated on `overlayOpen`). `composer.*` and
`commandPalette.*` arrive with the out-of-tree composer takeover, which will
expose their run seams; the old branch's registrations against the upstream
composer's internals are deliberately not faked.

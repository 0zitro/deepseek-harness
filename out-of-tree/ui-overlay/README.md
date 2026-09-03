# @zitro/dsh-oot-ui-overlay

English | [中文](README.zh.md)

Overlay manager (`ctx.overlays`) and the `OverlayScope` primitive. A scope
announces mount/unmount through `dsh:overlay-open`/`dsh:overlay-closed` DOM
events — the string seam keeps the primitive Cordis-free — and the manager
tracks elements in mount order (LIFO topmost), publishes `overlayOpen` into
the when-context, and answers `closeTop()` for the rebindable `overlay.close`
action. A scope binds no keys; which gesture dismisses an overlay is a
keybinding, not a component behavior.

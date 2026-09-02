# @deepseek-ai/dsh-client-ui-overlay

English | [中文](README.zh.md)

The overlay manager. Overlays (menus, modals, lightboxes, popovers) declare themselves with the `OverlayScope` primitive from `ui-primitives`, which emits `dsh:overlay-open`/`dsh:overlay-closed` DOM events on mount/unmount. The `overlays` service tracks those scopes in mount order and publishes the `overlayOpen` context key; the `overlay.close` action (registered by `ui-stock-actions`) calls `closeTop()`, which dispatches `dsh:overlay-close` at the topmost scope so its `OverlayScope` runs its own `onClose`.

The bridge is DOM events rather than a React hook because `OverlayScope` lives in the Cordis-free `ui-primitives` package: overlays contribute and receive commands without reaching a Cordis context.

## Model Experience

None, as the package tracks presentation-only overlay state; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Escape listeners are being migrated incrementally** — overlays not yet wrapped in `OverlayScope` still keep their own window/document Escape handlers.

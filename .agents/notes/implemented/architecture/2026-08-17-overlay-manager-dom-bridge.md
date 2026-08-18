# Agent Note: Overlays contribute through DOM events, not through a Cordis context

Status: implemented

English | [中文](2026-08-17-overlay-manager-dom-bridge.zh.md)

## Problem

Escape dismissal was implemented once per overlay. Menus, modals, lightboxes and popovers each attached a window or document listener, each decided for itself whether a keydown was theirs, and nothing knew which of several open overlays was topmost. Two open at once meant either both closed or the wrong one did, depending on listener order — an ordering nobody had chosen.

Routing Escape through an action made that worse before it made it better. The keybindings dispatcher needs one handler to invoke and one predicate to gate it on, and neither existed: there was no `overlayOpen` state key any clause could name, and no addressee for a close command, so `overlay.close` had nothing to close.

The obvious place to put a registry is the package that owns the overlay primitives, and that package cannot have one. `ui-primitives` is deliberately Cordis-free: it holds pure React atoms that any surface can use without a plugin context, and the whole client tree depends on that. Giving `OverlayScope` a Cordis service to call would invert that dependency for every consumer of the primitives.

## Decision

`OverlayScope` announces itself with DOM events. On mount it dispatches `dsh:overlay-open`, on unmount `dsh:overlay-closed`, and it listens for `dsh:overlay-close` addressed at its own element, running its own `onClose` when one arrives. The primitive therefore knows nothing about who is listening, and `ui-primitives` keeps its zero-dependency shape.

The `overlays` service in `ui-overlay` is the other half. It tracks live scopes in mount order, which is what makes "topmost" a fact rather than a race, publishes the `overlayOpen` context key that `when` clauses resolve against, and exposes `closeTop()`, which dispatches `dsh:overlay-close` at the topmost scope. `overlay.close` — registered by `ui-stock-actions` — is an ordinary action calling that method, so Escape is bound, rebindable, and gated like every other binding.

The event names are the contract between the two packages. An overlay contributes by mounting the primitive, and receives commands by being the topmost contributor; neither direction requires it to reach a Cordis context or to know the manager exists.

## Alternatives considered

- **A React context or hook in `ui-primitives`**: rejected — it makes every consumer of the primitives mount a provider, and the provider would have to come from somewhere with the registry, which is the Cordis dependency the package exists without.
- **Pass a registry handle down as props**: rejected — every overlay owner would thread a handle it does not otherwise need through its own props, and a surface that forgets is silently absent from the ordering rather than failing.
- **Put the manager in `ui-primitives` and let it hold the state**: rejected — the state is application state (what is open, in what order) and the primitives package is a component library. It would also give two packages a reason to own the same registry once anything else needed to observe overlays.
- **Keep per-overlay Escape listeners and add only the context key**: rejected — the key would report an order the listeners do not honor, so a clause could correctly say an overlay is open while the wrong one closes.

## Consequences

Overlays are ordered by one authority, so Escape closes the topmost one and a `when` clause can name `overlayOpen` without asking any overlay. The cost is an untyped seam: DOM event names are strings shared by two packages, and a rename in one is a silent no-op in the other rather than a type error — the price of keeping the primitives free of a plugin context.

The migration is incremental by design. An overlay that is not yet wrapped in `OverlayScope` keeps its own Escape handler and stays outside the ordering, so both mechanisms coexist until the last one is migrated; that remainder is the package's stated limitation rather than a hidden state.

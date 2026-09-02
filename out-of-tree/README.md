# Out-of-tree modules

English | [中文](README.zh.md)

Fork-only plugin packages that extend the shipped web client through Cordis
patch composition instead of edits to `packages/`. The directory is a pnpm
workspace glob (`out-of-tree/*`) but invisible to every root gate and build:
root vitest includes, the root tsdown workspace list, the coverage gate, and
the package-enumerating scripts all hardcode `packages/*` paths. Upstream
merges therefore never see these files, and these files never see upstream
internal churn — they couple only to documented Cordis extension points
(slots, services, patch rows). The decision and its rejected alternatives are
recorded in the [out-of-tree Agent
Note](../.agents/notes/implemented/architecture/2026-09-03-out-of-tree-plugin-packages.md).

## Packages

| Package | Role |
| --- | --- |
| `@zitro/dsh-oot-ui-actions` | Actions & keybindings subsystem: action registry, when-context, chord-aware central dispatcher, per-seat stored overrides, settings section |
| `@zitro/dsh-oot-ui-widgets` | Shared widget library (reserved-room runs, sortable/resizable tables) served as a dynamic module-table row via `dsh.client.external` |
| `@zitro/dsh-oot-ui-overlay` | Overlay manager (LIFO mount order, DOM-event bridge) + `OverlayScope` primitive |
| `@zitro/dsh-oot-ui-stock-actions` | Stock action set binding gestures to the surfaces above |
| `@zitro/dsh-oot-web-profile` | Installable patch bundle inserting the rows above |

## Architecture

- **Central dispatch**: every out-of-tree surface binds no keys. `ui-actions`
  owns one window-level capture-phase keydown listener, evaluates when-clauses
  against the shared context map (`data-focus-scope` derivation plus explicit
  keys such as `overlayOpen`), and runs the matching registered action. Which
  gesture triggers what is data: defaults come from action registrations, and
  the user's per-seat overrides persist in the `keybindings` settings
  namespace, edited in the settings section's recorder.
- **Overlays**: `ui-overlay` tracks mounted `OverlayScope` elements in LIFO
  order over DOM events (the bridge keeps the Cordis-free primitive usable in
  any component tree) and publishes `overlayOpen`. `overlay.close` is a
  rebindable action, not a hardcoded Escape handler.
- **Stock surfaces are untouched day one**: upstream components keep their own
  Escape listeners. Each surface migrates onto the dispatcher only when an
  out-of-tree takeover replaces it — the composer first, via the
  `conversation.composer` chain slot whose fallback-stays-mounted contract is
  built for takeover.

## Mounting

Development — no profile mutation, rows anchored to this directory:

```sh
pnpm --filter '@zitro/dsh-oot-*' run bundle
pnpm dsh web --patch ./out-of-tree/cordis.patch.yml
```

Installable — bundle rows resolve through the profile's node_modules:

```sh
pnpm --filter '@zitro/dsh-oot-*' run bundle
pnpm dsh plugin --profile web add ./out-of-tree/web-profile
```

## Development

```sh
pnpm exec vitest run --config out-of-tree/vitest.config.ts   # OOT suites
pnpm exec tsc -b out-of-tree/tsconfig.client.json            # OOT typecheck
pnpm --filter '@zitro/dsh-oot-*' run bundle                  # client bundles
```

Package names use the `@zitro/dsh-oot-*` scope (never `@deepseek-ai/dsh-*`)
so an upstream package of the same purpose can never collide. The shared
client tsdown preset reads OOT manifests through its `out-of-tree` glob; if
upstream moves the preset, the per-package `tsdown.config.ts` imports fail
loudly — that is the one deliberate build-time coupling.

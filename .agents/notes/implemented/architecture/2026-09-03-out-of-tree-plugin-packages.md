# Agent Note: Out-of-tree plugin packages compose fork UI through patch layers

Status: implemented

English | [中文](2026-09-03-out-of-tree-plugin-packages.zh.md)

## Problem

The fork's first keybindings subsystem (`feat/0zitro/ui-keybindings`) lived in `packages/client/` and reached into six upstream surfaces: the InputBar keymap, ui-primitives (OverlayScope/FocusScope/Run/Table), the settings root, the bundle patch, the tsconfig client aggregate, and the settings gateway allowlist. Every upstream refactor of those files — and the Lexical composer rewrite and apiproxy removal both landed after the branch — turned the feature into a git text-merge debt. A fork feature needs to couple to documented extension points only, so upstream commits stop being merge events for it.

## Decision

Fork-only plugin packages live in `out-of-tree/` and mount through Cordis patch composition; nothing under `packages/` imports them.

- **Directory**: `out-of-tree/*` is a pnpm workspace glob. Every root gate and build hardcodes `packages/*` globs (vitest includes, tsdown workspace list, coverage gate, package-enumerating scripts), so the packages are invisible to upstream checks by construction; they get their own vitest config and tsc aggregate under `out-of-tree/`.
- **Mounting**: two paths, both upstream extension points. Development uses `pnpm dsh web --patch ./out-of-tree/cordis.patch.yml`, whose relative row names are anchored to the patch file's directory by `anchorInsertedPluginNames` and resolve to the built packages. A deployment installs `out-of-tree/web-profile` — a bundle package (`dsh.bundle.patch`) whose rows use bare names resolved through the profile's node_modules — with `dsh plugin --profile web add`. The client `modules` row scans the live loader tree, so patch-inserted rows join the browser roster without registration anywhere.
- **Shared widgets**: `out-of-tree/ui-widgets` serves Run/Table as a dynamic module-table row; consumers list `@zitro/dsh-oot-ui-widgets/client` in `dsh.client.external` (exact specifier, per the gateway controller precedent) and import it bare. `PLATFORM_MODULES` is frozen upstream and deliberately not extended.
- **Persistence**: the settings gateway serves every registered namespace since the settings controller's `describe()` projection, so the old allowlist edit is unnecessary; the host half registers the `keybindings` namespace with the standard `ctx.inject(['settings'], …)` pattern.

Upstream edits are three and additive: the workspace glob, a hand-written `tsconfig.base.json` paths block outside the generated region (OOT packages are invisible to `gen-tsconfig-paths`), and one glob added to `workspaceManifest` in the shared client tsdown preset so OOT packages can declare `dsh.client.external`. All three are append-shaped and survive upstream renames of unrelated lines.

The subsystem itself ports the seats-and-contributions keybinding model (action registry, when-context, chord dispatcher, per-seat stored overrides) from the earlier branch; its design rationale lives in the keybinding-seats note of the first branch. Stock components keep their own Escape listeners day one — a patch layer cannot remove them — and migrate onto the dispatcher only when an out-of-tree surface takes that slot over, starting with the planned composer replacement through the `conversation.composer` chain slot, whose fallback-stays-mounted contract is built for takeover.

## Alternatives considered

- **Keep the packages under `packages/client/`** (the first branch): every root gate, catalog generator, and the client aggregate then owns them, so each upstream reorganization of `packages/` forces merge resolutions in files the feature barely touches.
- **Extend `PLATFORM_MODULES` with the widgets package**: the list is compiled into the shell kernel and every static bundle; adding a fork entry there couples the frozen module table to fork presence, and the dynamic-row mechanism already exists for exactly this.
- **Shadow-replace stock slot components with listener-free clones at higher priority**: centralizes Escape today, but each clone re-forks upstream component internals — the maintenance cost the OOT layout exists to avoid.

## Consequences

- `verify-cordis-config` is the one gate that scans `out-of-tree/**/*cordis*.yml`; the patch files satisfy it as ordinary overlay files.
- OOT client bundles must be built (`pnpm --filter '@zitro/dsh-oot-*' run bundle`) before mounting; `tsdown.client.ts` fails loudly if the shared preset moves.
- The `@zitro/dsh-oot-*` scope keeps package names collision-proof against any future upstream equivalent; the settings namespace is `keybindings` for the same reason.

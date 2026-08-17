# @deepseek-ai/dsh-client-ui-keybindings

English | [中文](README.zh.md)

The keybindings orchestrator. The client half provides the `uiActions` registry where feature packages register actions (id, label, default bindings, and a `run` handler), persists one partial override per adjusted default (`{ action, source, key, base, strokes?, when?, prio? }`) in the `ui-keybindings` settings namespace, renders the effective bindings as a table, and dispatches keystrokes to the matched action's handler. A registrar states its own branded action id and default keys; the brands reach it by type-only import, which the client bundle allows where a value import across plugins is forbidden.

The rendered list projects the stored overrides and nothing else, so an edit appears once it is stored rather than when it is made, and a write the Host refuses cannot leave a binding on screen that no reload will bring back. Each write derives the next list from the stored one; absent a stored list — unread, unserved, or undecodable — there is nothing to derive from, so the write is refused with an error rather than allowed to replace overrides it never saw.

A stored base is reconciled against the world: whenever a registration or a durable change moves either side, an override whose default now ships a different gesture has that default written back into its base, so the snapshot it merges with stays the one its origin ships. The comparison is structural, so reconciling an already-reconciled list writes nothing and the pass settles after one write. An override whose default is unavailable keeps the base it retained — failing to reconcile is not failing to merge — and its overridden fields are never touched by a reconcile.

An edit carries the fields the user changed and no others, and merges into the stored override rather than replacing it. Recording a gesture therefore leaves the clause absent from the override, so the binding keeps following its default's clause and a later change to that default still reaches the merged binding; restating the merged value would have frozen it instead. A clause the user does clear is stored as the empty string, which states no predicate and is always active — the one way an override can drop a predicate its default carries.

Every field commits on blur, so a half-typed value is never stored, never dispatched, and never reaches another client; a draft that was not edited commits nothing, and one that changes underneath the field is replaced. A clause that does not parse is flagged and left uncommitted, because storing it would resolve false and disable the binding it belongs to. The key recorder is the exception: a gesture has no meaningful intermediate form, so it commits when recording finishes. A `when` clause resolves against `uiWhenContext`, a map derived from the focus-scope stack (`<FocusScope>`/`data-focus-scope`) plus explicit state keys. The Host half registers the settings namespace.

The domain model (`keybinding.ts`) is shared by the recorder, the persisted schema, and the consumer: a keybinding is an ordered list of strokes — one stroke is a simple binding, two or more is a chord — and each stroke is one non-modifier key plus an optional modifier set. An optional `when` clause (`when-clause.ts`) predicates the binding on UI state using the VSCode grammar (`&&`, `||`, `!`, `==`, `!=`, `=~`, parentheses). Matching is modifier-exact, so a bound `Ctrl+Enter` does not fire while `Alt` is also held. Single-letter keys persist lowercase, so a letter records the same way whether Shift was held during capture.

The page is one grid over every row — a command cell spans the rows it owns, which no per-row element could do — with five columns: command, keybinding, when clause, priority, and source. One command's rows are adjacent because rows sort by the action's dot-delimited segments, and the command reads once, centered over its run. Every column is `minmax(0, …)`, so a long label or clause wraps inside its cell rather than widening the row past the panel. A field the user overrode renders italic; one still following its default recedes, which is the same distinction the stored override draws. The priority a row shows is the one dispatch settles collisions with — the value the override states, or its position among the bindings it can actually collide with. Priority separates entries sharing a `(stroke, source)` and nothing else, so a binding that competes with none reads 0 and only a genuine contest counts upward; seeding from the whole list would number bindings that never meet and would leave a real collision undetectable, every seeded value being distinct. Only whole, non-negative values are stored. A source is the shipped default, the user, or the contributing plugin named by its own id.

A recorder captures a chord: click to arm, then each non-modifier keydown appends a stroke while held modifiers render as pressed chips; a Done button commits, Escape or blur cancels, plain Backspace removes the last stroke, lock-key release resets a stuck modifier, and auto-repeat keydowns are ignored. Keystrokes are captured at the window so focus is irrelevant, and modifier state is read from `getModifierState()` with the boolean flags as fallback.

## Model Experience

None, as the section renders a browser configuration UI; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **No feature declares a focus scope or state keys yet** — `composerFocused`/`agentBusy` stay unset, so a binding gated on them stays inactive until the composer wiring lands.
- **The composer send action's `run` is a no-op placeholder** — wiring the `InputBar` submit to the dispatched action is a separate `ui-conversation` change.
- **Firefox on Linux filters modifier events from content pages** — `Alt` is absent from a combined keydown and lone modifier keydowns never dispatch to `http` pages (they do reach privileged `about:` pages), so `Alt` chords and the pre-key pressed-modifier preview are unavailable there; Chromium works. The recorder already prefers `getModifierState()`; the events are absent, not merely misflagged.

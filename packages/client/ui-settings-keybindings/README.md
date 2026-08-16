# @deepseek-ai/dsh-client-ui-settings-keybindings

English | [中文](README.zh.md)

Keybindings settings section and the keybinding domain model. The client Cordis plugin registers the Keybindings page (`settings.section`) and renders one recorder row per configured action binding; the Host half registers the `ui-keybindings` settings namespace. Today the only binding is the composer send action (`sendMessage`), persisted as a keybinding (`{ strokes, when? }`) with default `{ strokes: [{ key: 'Enter', modifiers: [] }] }`.

The domain model (`keybinding.ts`) is shared by the recorder, the persisted schema, and the consumer: a keybinding is an ordered list of strokes — one stroke is a simple binding, two or more is a chord — and each stroke is one non-modifier key plus an optional modifier set. An optional `when` clause (`when-clause.ts`) predicates the binding on UI state using the VSCode grammar (`&&`, `||`, `!`, `==`, `!=`, `=~`, parentheses). Matching is modifier-exact, so a bound `Ctrl+Enter` does not fire while `Alt` is also held. Single-letter keys persist lowercase, so a letter records the same way whether Shift was held during capture.

A recorder captures a chord: click to arm, then each non-modifier keydown appends a stroke while held modifiers render as pressed chips; a Done button commits, Escape or blur cancels, plain Backspace removes the last stroke, lock-key release resets a stuck modifier, and auto-repeat keydowns are ignored. Keystrokes are captured at the window so focus is irrelevant, and modifier state is read from `getModifierState()` with the boolean flags as fallback.

## Model Experience

None, as the section renders a browser configuration UI; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Only the send-message binding is configurable** — the schema field, hook, setter, and row are the extension point for future actions.
- **The composer must consult the binding** — this package persists and edits it; wiring the `InputBar` submit gate to `keybindingMatches` and resolving `when` against a context-key registry is a separate `ui-conversation` change.
- **Firefox on Linux filters modifier events from content pages** — `Alt` is absent from a combined keydown and lone modifier keydowns never dispatch to `http` pages (they do reach privileged `about:` pages), so `Alt` chords and the pre-key pressed-modifier preview are unavailable there; Chromium works. The recorder already prefers `getModifierState()`; the events are absent, not merely misflagged.

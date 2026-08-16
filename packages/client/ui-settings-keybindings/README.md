# @deepseek-ai/dsh-client-ui-settings-keybindings

English | [中文](README.zh.md)

Keybindings settings section and the simple-keybinding domain model. The client Cordis plugin registers the Keybindings page (`settings.section`) and renders one recorder row per configured action binding; the Host half registers the `ui-keybindings` settings namespace. Today the only binding is the composer send action (`sendMessage`), persisted as `{ key, modifiers }` with default `{ key: 'Enter', modifiers: [] }`.

The domain model (`keybinding.ts`) is shared by the recorder, the persisted schema, and the consumer: a binding is exactly one non-modifier key plus an optional modifier set — no chords, no context predicates. Matching is modifier-exact, so a bound `Ctrl+Enter` does not fire while `Alt` is also held. Single-letter keys persist lowercase, so a letter records the same way whether Shift was held during capture. A recorder captures the next non-modifier keydown (Escape cancels, blur disarms, IME composition is ignored) and renders the binding as `<kbd>` chips.

## Model Experience

None, as the section renders a browser configuration UI; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Only the send-message binding is configurable** — the schema field, hook, setter, and row are the extension point for future actions; chords and context predicates are deliberately out of scope.
- **The composer must consult the binding** — this package persists and edits it; wiring the `InputBar` submit gate to `keybindingMatches` is a separate `ui-conversation` change.

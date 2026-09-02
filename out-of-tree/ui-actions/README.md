# @zitro/dsh-oot-ui-actions

English | [中文](README.zh.md)

The actions & keybindings subsystem: an action registry features contribute
to (`ctx.uiActions`), a derived when-context map (`ctx.uiWhenContext`), and
one central capture-phase keydown dispatcher that matches gestures against
effective bindings — registered defaults merged with the user's per-seat
overrides — and runs the matched action. Overrides persist in the
`keybindings` settings namespace and are edited in the settings section
registered through the `settings.section` slot (recorder, when-clause input,
priority placement, per-source provenance).

The orchestrator owns no action and binds no surface: components declare
`FocusScope` regions, publish explicit context keys when they own state, and
register actions; `ui-stock-actions` supplies the stock set. Design rationale lives in the
first branch's keybinding-seats note and the [out-of-tree Agent
Note](../../.agents/notes/implemented/architecture/2026-09-03-out-of-tree-plugin-packages.md).

# @zitro/dsh-oot-ui-composer

English | [中文](README.zh.md)

The rich composer takeover: one plaintext editable whose text is the full
markdown source, decorated live — emphasis and code from an incremental
@lezer/markdown parse with a dangling-opener pass (a lone `_` italics its
tail, `_**` stacks, and code contexts suppress every modifier because the
grammar, not a scan, says what is code), math folded into typeset KaTeX with
a glyph-to-source offset map, and fenced code coloured by the client's shared
Shiki singleton.

Architecture ported from the katex-patcher reference composer, with two
deliberate departures. The reference read offsets with `Range.toString()`,
which forced a math engine whose output owns no text; here offsets are
measured by a held-text tree walk that skips the marked drawing subtree, so
KaTeX's HTML output owning text costs nothing — the hidden source stays in
the held text (hiding never removes), the drawing stays out of it. And where
the reference enumerated its engine's layout permutations wholesale, this
port writes down the one KaTeX inversion that matters (`.msupsub` stacks
scripts top-down where the source writes them the other way) and lets the
LCS alignment fail safe — fewer anchors, never a wrong one.

The session plane is the stock `SessionInputShell`: the surface is the single
writer (every edit pushed via `setDraft`), shell-side changes (persisted
seeds, pick inserts, send-clears) are adopted back, and submission, queueing,
steering, notices, image intake, and draft persistence are inherited. Undo
lives over the source — `(text, selection)` snapshots with per-position
stacks for recalled messages — because the decoration rewrites the DOM every
keystroke and native undo tracks the projection.

A chain entry owns its whole chrome (the slot system authorizes child
rendering per declaring entry, so the stock bar's chrome slots cannot be
re-rendered from a takeover); the `rich-composer` settings namespace's
`enabled` toggle declines the election and restores the stock bar. Stock
gestures for the surface ship in `@zitro/dsh-oot-ui-stock-actions` through
the `ctx.composer` service this package provides.

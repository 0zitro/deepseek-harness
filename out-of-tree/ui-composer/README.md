# @zitro/dsh-oot-ui-composer

English | [中文](README.zh.md)

The rich composer editor: a CodeMirror 6 surface elected into the
`conversation.composer.editor` seat, whose document is the full markdown
source and whose look is a live decoration of it. The browser never edits
the buffer — CodeMirror turns input into transactions on its own document
and renders the decorations — so the entire class of bugs a
decorate-in-place editable ships with (line-break stand-ins, caret-affinity
mapping, selection round-trips, adoption echo) is structurally gone rather
than patched.

The decoration engine is ported from the katex-patcher reference composer:
emphasis and code from an incremental @lezer/markdown parse with a
dangling-opener pass (a lone `_` italics its tail, `_**` stacks, and code
contexts suppress every modifier because the grammar, not a scan, says what
is code), math folded into typeset KaTeX with a glyph-to-source offset map,
and fenced code coloured by the client's shared Shiki singleton. A fold is a
replace decoration with a widget; the folded spans are atomic ranges, so the
caret crosses them whole and a delete at an edge takes the object entire.
Open is derived from the caret on every rebuild — an object the caret sits
strictly inside is drawn as its markdown source, a click on a drawing opens
it at the glyph under the pointer, and leaving re-folds it.

One deliberate departure from the reference remains. Where the reference
enumerated its math engine's layout permutations wholesale, this port writes
down the one KaTeX inversion that matters (`.msupsub` stacks scripts
top-down where the source writes them the other way) and lets the LCS
alignment fail safe — fewer anchors, never a wrong one. The reference's
`Range.toString()` offset constraint is moot here: document offsets are
CodeMirror's own, and the drawing's glyphs carry source offsets as
attributes for the pointer path.

The session plane is the stock `SessionInputShell`: the surface is the
single writer (every document change pushed via `setDraft`), shell-side
changes (persisted seeds, pick inserts, send-clears) are adopted back in one
transaction gated on document-versus-draft, and submission, queueing,
steering, notices, image intake, and draft persistence are inherited. Undo
is CodeMirror's history over the source.

The composer registers its own actions (`composer.*`, `commandPalette.*`)
through the `ctx.composer` service this package provides — a component owns
its gestures. The keybinding dispatcher claims bound gestures at window
capture before any editor handler runs; an unbound gesture falls to the
editor (plain Enter breaks the line), and the accelerated chord steers an
empty draft. The `rich-composer` settings namespace's `enabled` toggle
declines the election: the same div binds the stock Lexical editor as its
root, restoring the stock editing behavior without touching registrations.

Known limitations: GFM tables and task
lists decorate as plain text (`@lezer/gfm` is unreachable from this
deployment's registry mirror). The `@codemirror/*` dependencies are pinned
to the reviewed 2026-08-31 release train, `@codemirror/view` exactly (its
next release post-dates the repository's supply-chain release-age window).
Arrow navigation into folded objects: a plain arrow at a maths span's edge
opens it at its LaTeX's near end, a vertical move whose column crosses a
drawing opens it at the drawing's nearest corner, and a group move
(Ctrl/Mod+Arrow) crosses a whole link as one unit. The placement is a
corner argmin over the atomic glyphs' own laid-out rects — every glyph
offers its corners, a LEFT one standing for the caret placed before the
glyph and a RIGHT one for the caret after it, and the distances are honest
two-dimensional ones, so a stacked layout resolves itself: from above a
superscript's top corners are nearer than the subscript's below it, from
below the subscript's bottom corners are, and a press on a row reads that
row. What each corner maps to comes from the ENGINE: KaTeX's parse tree
(`__parse`) states one node per source atom with `loc` spans written by
the engine itself, macros collapse to their one command (the
giant-character rule as KaTeX's fact), and the drawing's glyphs align to
those leaves by what they draw — the pseudo text layer the reference
sought from MathJax, taken from KaTeX's own tree instead. Leaving runs
the machinery backwards: the caret's offset snaps to the nearest caret
stop, a hidden copy of the drawing supplies the owning glyph's corner,
and the adjacent line answers for that column — the render's width, not
the source's, so equal spans mirror to equal columns. At the buffer's
edges the vertical arrows walk the send history: every submission is a
position carrying its whole serialized editor — text, selection, and undo
stack — so recalling it restores its own undo, the draft is a position
too, and consecutive duplicates of a message are one walk. The draft scroll is the stock bar's scrollport: the seat renders inside it, so its cap, its
scrollbar, and its wheel chaining (forwarding the gesture to the
conversation only at its own edges) behave exactly as the stock composer's.

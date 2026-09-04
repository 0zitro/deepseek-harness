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

Known limitations: per-position undo stacks for recalled messages are
deferred until upstream grows message-recall navigation (nothing for
ArrowUp/ArrowDown at the buffer's edges to walk yet); GFM tables and task
lists decorate as plain text (`@lezer/gfm` is unreachable from this
deployment's registry mirror). The `@codemirror/*` dependencies are pinned
to the reviewed 2026-08-31 release train, `@codemirror/view` exactly (its
next release post-dates the repository's supply-chain release-age window).
Arrow navigation into folded objects: a plain arrow at a maths span's edge
opens it at its LaTeX's near end, a vertical move whose column strikes a
drawing opens it at the position that column lands on, and a group move
(Ctrl/Mod+Arrow) crosses a whole link as one unit. The drawing's mapping is
TOTAL and token-atomic — the pseudo text layer the reference built MathJax
for, derived from KaTeX's own laid-out glyph rects instead: each stamped
glyph pins its two edges to its source's start and end, the stretches no
glyph covers (spacing commands, the room around a construct) interpolate
between their neighbours out to the drawing's edges, and every landed
position snaps to a caret stop of the grammar's own tokens, so a `\cmd` is
one giant character — the caret stands before it or after it, never inside
it. The draft scroll is the stock bar's scrollport: the seat renders inside it, so its cap, its
scrollbar, and its wheel chaining (forwarding the gesture to the
conversation only at its own edges) behave exactly as the stock composer's.

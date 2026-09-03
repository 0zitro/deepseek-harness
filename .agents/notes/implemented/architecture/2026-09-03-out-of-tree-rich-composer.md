# Agent Note: The rich composer ports a decoration-over-source editor onto the session shell

Status: implemented

English | [中文](2026-09-03-out-of-tree-rich-composer.zh.md)

## Problem

The stock web composer is a plain-text Lexical editor: markdown renders only after send, math only in the transcript, and the fork's keybindings subsystem deliberately deferred every `composer.*` gesture because no seam let an outside surface drive the session's input. The first keybindings branch had also built a decorated math composer for a different host (`claude-code-katex-patcher`), whose caret machinery — enter/leave arbitration, click-to-glyph offset mapping, per-position undo — was measured into shape there and was too valuable to leave behind.

## Decision

`out-of-tree/ui-composer` takes the `conversation.composer` chain slot (priority −5, declining whenever a business interaction is pending) and renders a decoration-over-source editor ported from the reference:

- **Hide, never remove.** The buffer text is the full markdown source; decoration only styles and folds. A held-text tree walk measures offsets, skipping the `data-ccx-draw` subtree a folded expression's KaTeX drawing lives in — the reference read offsets with `Range.toString()`, which forced it to MathJax-SVG (output owning no text); the walk makes KaTeX's text-bearing HTML cost nothing. Copy, cut, and send carry the source; a column over a folded label reports the character beneath it.
- **Live decoration from the grammar.** @lezer/markdown paints closed constructs with markers dimmed; a dangling-opener pass styles the still-open `_`/`**`/backtick tail to end of line, stacking over closed constructs, suppressed inside code by the parse itself. Math is a parser construct (remark-math's run-width rule), so a `$` in a code span is unreachable rather than excluded.
- **The glyph map fails safe.** Source tokens (command names and `\begin{env}` are single tokens; escapes anchor at the backslash) pair against KaTeX's drawn characters by LCS alignment, NFKD-normalized, with one written-down inversion (`.msupsub` visits scripts bottom-up) and unpaired glyphs taking their gap's start. The error posture is the reference's: fewer anchors, never a wrong one.
- **The session plane is the stock shell.** The surface is the single writer (`setDraft` per edit); shell-side changes are adopted back; submission admission, queue/steer, notices, image intake, and draft persistence are inherited rather than reimplemented. Undo is owned by the surface over `(text, selection)` snapshots with per-recalled-position stacks, because decoration rewrites the DOM every keystroke and native undo tracks the projection.
- **A chain entry owns its whole chrome.** The slot registry authorizes child rendering per declaring entry, so the stock bar's chrome slots (attachments rail, model seat, trigger menu) cannot be re-rendered from a takeover — the same terms the approval and question takeovers render under. The chrome renders its own trigger menu from the input-trigger controller's stores, and a `rich-composer.enabled` settings toggle declines the election, restoring the stock bar (mounted-hidden behind the chain's overlay contract the whole time).

Three additive upstream edits carry it: `detectTrigger` exported from `ui-input-trigger`'s client face, the highlight faces from `ui-primitives`, and `SessionInput`/`SessionInputResolver` widened to the full shell verb set plus `IConversation`'s browser-local image faces — the shell class already implemented every widened member; the interface had narrowed them to the stock bar.

`ui-stock-actions` now registers the deferred `composer.*` and `commandPalette.*` gestures against the `ctx.composer` service this package provides; the editor's built-in handlers remain the fallback when a gesture is unbound, and yield (via `defaultPrevented`) when a binding claims the key.

## Alternatives considered

- **Extend the stock Lexical editor with decoration plugins.** Lexical owns the document model; folding math into it means DecoratorNode atoms whose source round-trips through transforms, and the reference's offset invariants (hidden text is text) have no lexical counterpart. The plaintext editable keeps the browser as the editor.
- **Shadow the `conversation.composer.bar` single slot by priority.** The registry throws on a second single-slot registration; replacement of the bar is not a mechanism the slot system offers.
- **Re-render the stock chrome slots from the takeover.** Child rendering rights belong to the declaring entry (the stock bar); relaxing that per-entry authorization would let any entry render any slot, which is the property the registry exists to hold.
- **A separate OOT session plane.** One buffer, no push/adopt echo — but it reimplements submit admission, busy-enter resolution, notices, and draft persistence, and detaches from the trigger pipeline it means to feed.

## Consequences

- The stock bar's chrome occupants (attachments rail presentation, model and plan seats, the stock MenuView) are dark while the takeover is elected; the toggle is the escape hatch, and phase 2 grows the OOT chrome (chips, queue dock) rather than reaching back into the bar's children.
- Trigger picks land at the buffer end (the shell's editor is unfocused under the takeover); mid-text insertion arrives with phase-2 span routing.
- OOT test typecheck runs through `tsc -b out-of-tree/tsconfig.client.json` with a contained `outDir`: a composite aggregate without one emits declarations beside every source its program reaches, which is how stray `.js`/`.d.ts` files appeared twice before the outDir contained it.

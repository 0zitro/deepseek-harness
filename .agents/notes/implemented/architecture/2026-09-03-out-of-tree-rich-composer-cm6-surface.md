# Agent Note: The rich composer's editing surface becomes CodeMirror 6

Status: implemented

English | [中文](2026-09-03-out-of-tree-rich-composer-cm6-surface.zh.md)

## Problem

The v1 composer decorated a `contenteditable="plaintext-only"` div in place: every keystroke was the browser's own edit of a DOM the decoration also rewrote, so the two fought over one buffer. Live testing kept finding the same *class* of bug, each patched with another compensation — the browser answers a line break it will not draw with two newlines (removed by a measured `beforeinput`/`input` pass with a caret-affinity shift), a caret read around a folded island disagrees with the visual one (an `offsetOf` inversion table), an own push echoes back through the shell's adoption (a held-text comparison guard), and a re-decoration must restore selection without discarding affinity. Each fix was correct and each proved the layer wrong: the offsets, the compensation, and the echo were all artifacts of owning neither the document nor the edit.

## Decision

`out-of-tree/ui-composer` replaces the editing core with **CodeMirror 6** in the `conversation.composer.editor` seat; the browser never edits the buffer, so the bug class is deleted rather than patched.

- **The document is the source.** CM6 owns the buffer; input becomes transactions; the decoration is a pure builder (`buildDecorations(doc, {colorFor, head})`) feeding a ViewPlugin. The verbatim-source invariant — the thing every compensation defended — holds by construction, and jsdom no longer needs it asserted: there is nothing to drift.
- **What dies.** `attach.ts`, `text.ts` (the held-text walk), `selection.ts`, `reconcile.ts`, `undo.ts`, and their specs: the stand-in compensation, the caret-affinity shift, the selection round-trips, the in-place DOM reconciliation, and the hand-rolled `(text, selection)` history (CM6's `history()` owns undo; per-recalled-position stacks are deferred until upstream grows recall navigation).
- **What survives.** The whole engine: the Lezer grammar and its math/strikethrough extensions, the dangling-opener pass with per-character class stacking, the Shiki fence colours, and the KaTeX glyph map with its LCS alignment and `data-ccx-at` stamps. A fold is now a `replace` decoration with a widget; the folded spans are `atomicRanges`, which is the CM6-native form of "an arrow crosses it whole and a delete at an edge takes it entire".
- **Open is derived, not stateful.** A foldable the caret sits *strictly* inside is drawn as its markdown source — no `opened` variable to validate across adoptions. Strictly, not inclusively: a caret resting at an edge reads the object folded, which is what makes edge-deletion whole (the inclusive variant was tried and broke exactly that). A click on a drawing is answered by the nearest stamped glyph — one dispatch both opens the fold and lands the caret, replacing the reference's two-phase caret.
- **Gestures split by layer.** The keybinding dispatcher claims bound gestures at window capture with `preventDefault()` **and `stopPropagation()`** (a CM6 element handler does not need to honor `defaultPrevented`; the propagation stop is the general fix, landed in `ui-actions`); the surface's `onKey` claims the composer-native ones (menu arbitration, space, the accelerated chord) at `Prec.highest` before CM6's keymap; everything unbound falls through — plain Enter breaks the line via `defaultKeymap`.
- **Widget events opt in.** `WidgetType.ignoreEvent` defaults to *true* (widgets own their events); the math and note widgets override it so the editor's mousedown reaches the glyph-stamp path. This was the one CM6 default that silently swallowed the click-to-open contract.

The `@codemirror/*` dependencies are bundled inline like the rest of the fork's closure, pinned to the reviewed 2026-08-31 release train (`view` exact — its next release post-dates the repository's supply-chain release-age window, and the fallback would be exempting it from `minimumReleaseAgeExclude`).

## Alternatives considered

- **Keep patching the decorate-in-place core.** Every fix had been locally correct and the class survived them; the reference composer made the same measurements because its host offered no editor framework, not because the measurements were the design.
- **Lexical decoration plugins on the stock editor.** Reconsidered and rejected again: Lexical's document model has no counterpart of "hidden text is text", and DecoratorNode atoms round-trip the source through transforms the glyph map cannot anchor into.
- **Retain per-position undo stacks in v2.** `EditorState.toJSON/fromJSON` supports them, but no upstream message-recall navigation exists to hook them to; carrying dead state through a core swap would couple the migration to a feature that cannot be exercised.

## Consequences

- The browser-fighting layer is gone from the fork: no file owns a stand-in newline, a caret-affinity shift, or a held-text walk, and no future contributor can regress into one without re-adding a contenteditable core.
- `ui-actions`' dispatcher now stops propagation on every claim, so any future editor mounted under the window (not just CM6) is safe from claimed keys.
- The composer's client bundle grows by the inlined CM6 closure (~1.3 MB unbuilt) — the fork's own patch bundle, invisible to root gates by design.
- Widget authors in the fork must remember `ignoreEvent` defaults to true: a widget that wants editor-handled events opts in explicitly.
- The CDP browser suite now carries the real-key regressions for every glitch the user reported on the decorate-in-place core, so the class stays pinned dead.

## Verification

`cm-decorations.client.spec.ts` ports the segment assertions to DecorationSet queries (stacking, code suppression, flanking, fold shapes, open-as-source, fence colours); `cm-surface.client.spec.tsx` pins the shell contract (single-writer push, one-transaction adoption with the doc-equality no-op, claim-before-keymap, file paste); the CDP `caret.browser.spec.ts` suite pins the reported glitches with real keys — ```` ``` ```` +Enter caret placement, trailing-line persistence, `x`-Enter-`y`, mid-fence typing, glyph-offset click sweep, atomic edge deletion, grouped undo/redo — plus live verification on the dev server (fold, click-open at glyph, re-fold on caret exit, `/` trigger menu, styled KaTeX in the card).

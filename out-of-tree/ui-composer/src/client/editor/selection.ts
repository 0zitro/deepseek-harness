/**
 * Selection preservation, by character offsets from the editable's start over the held text.
 *
 * The editable is plaintext-only, so a selection is fully described by a `[start, end]` pair of
 * character offsets plus which end is moving. Offsets are read before a redecoration and
 * re-applied after, so styling the text disturbs neither the caret nor an active selection.
 */

import { beside, offsetOf } from './text.ts'

/** A selection over the held text: the ordered span, the moving end, and its direction. */
export interface HeldSelection {
  start: number
  end: number
  focus: number
  backward: boolean
}

/**
 * The current selection as held-text offsets, or null when the selection lives elsewhere.
 *
 * Which END is moving is not a thing a range says: a range is ordered, and the anchor a selection
 * grew from may be either of its ends. Restoring one as start-to-end therefore turns every
 * backwards selection forwards, and the next `shift+arrow` extends the end the writer was not
 * holding. The anchor is where the selection was begun; the focus is where it is being taken.
 * @param win - the host window.
 * @param el - the composer surface.
 */
export function selectionOffsets(win: Window, el: Element): HeldSelection | null {
  const sel = win.getSelection()
  if (sel === null || sel.rangeCount === 0) return null
  const range = sel.getRangeAt(0)
  if (!el.contains(range.startContainer)) return null

  const start = offsetOf(el, range.startContainer, range.startOffset)
  const end = offsetOf(el, range.endContainer, range.endOffset)
  const anchor = sel.anchorNode !== null && el.contains(sel.anchorNode)
    ? offsetOf(el, sel.anchorNode, sel.anchorOffset)
    : start
  const focus = sel.focusNode !== null && el.contains(sel.focusNode)
    ? offsetOf(el, sel.focusNode, sel.focusOffset)
    : end

  return { start, end, focus, backward: anchor > focus }
}

/**
 * Apply a held-text selection, carets resting BESIDE anything atomic rather than within it.
 *
 * Anchored where it was begun and taken to where it is being taken, so the end the writer is
 * holding stays the end that moves. `setBaseAndExtent` is the only one that can say which is
 * which; a range put back through `addRange` has already forgotten.
 * @param win - the host window.
 * @param el - the composer surface.
 * @param start - held-text offset for the range start (null applies nothing).
 * @param end - held-text offset for the range end; defaults to a collapsed caret at `start`.
 * @param backward - the selection is being taken towards its start.
 */
export function setSelection(
  win: Window,
  el: Element,
  start: number | null,
  end: number = start ?? 0,
  backward = false,
): void {
  if (start === null) return
  const a = beside(el, start)
  const b = end === start ? a : beside(el, end)
  const sel = win.getSelection()
  if (sel === null) return
  const from = backward ? b : a
  const to = backward ? a : b
  sel.setBaseAndExtent(from.node, from.offset, to.node, to.offset)
}

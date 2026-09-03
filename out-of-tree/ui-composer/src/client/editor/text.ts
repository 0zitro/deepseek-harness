/**
 * Editing the composer's own text, as the browser would.
 *
 * Only an edit the BROWSER performs counts as one: a text node written over directly changes what
 * is on the screen and tells nobody. So every change made here goes through
 * `execCommand('insertText')` over a selection of what is being replaced -- deprecated, and
 * deliberately so, because it is the only route that produces a real edit in a `contenteditable`.
 *
 * The offset addressing differs from the reference composer in one deliberate place. The reference
 * read offsets with `Range.toString()`, which forced a math engine whose output owns no text: what
 * is drawn must not be text the composer counts. Here a folded atom holds its hidden SOURCE runs --
 * which are text the composer holds, the whole point of hiding rather than removing -- BESIDE the
 * KaTeX drawing, and the drawing is marked `data-ccx-draw`. Offsets are measured by a TREE WALK
 * that skips exactly those marked subtrees: the held text is every character of the source, and
 * what the typeset glyphs say owns no offset in it.
 */

/**
 * Whether a node lives under a drawing mark, and is therefore outside the held text.
 * @param start - walk upward from here.
 * @param stop - the ancestor to stop the walk at.
 */
function underDraw(start: Node, stop: Node): boolean {
  let node: Node | null = start
  while (node !== null && node !== stop) {
    if (node.nodeType === 1 && (node as Element).hasAttribute('data-ccx-draw')) return true
    node = node.parentNode
  }
  return false
}

/**
 * The text node and local offset a character offset falls on, over the held text.
 *
 * An offset past the end lands at the end rather than nowhere, which is what a caller asking about
 * the end of the text means, and an empty editable has no text node to land in at all.
 *
 * A RANGE is what this addresses, and a range may end anywhere text is, drawn or not -- a folded
 * object's hidden source included. Where a CARET is going the composer answers for itself, since
 * the places a caret may be are fewer than the places a range may end.
 * @param el - the composer surface.
 * @param offset - a character offset into the held text.
 */
export function at(el: Element, offset: number): { node: Node; offset: number } {
  const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  let remaining = offset
  let last: Text | null = null
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (underDraw(node, el)) continue
    const text = node as Text
    const len = text.nodeValue?.length ?? 0
    if (remaining <= len) return { node: text, offset: remaining }
    remaining -= len
    last = text
  }
  return last !== null
    ? { node: last, offset: last.nodeValue?.length ?? 0 }
    : { node: el, offset: 0 }
}

/** One text node's contribution to the held text, skipped when it draws. */
function heldValue(node: Node, stop: Node): string {
  return underDraw(node, stop) ? '' : node.nodeValue ?? ''
}

/**
 * The held text of an editable: every character of the source, hidden runs included, drawing
 * excluded. Concatenating the drawn segments reproduces this exactly -- `concat(segments) ===
 * held` is the invariant the decoration is built on -- and a send carries this, not what the
 * screen shows.
 * @param el - the composer surface.
 */
export function heldText(el: Element): string {
  let out = ''
  const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) out += heldValue(node, el)
  return out
}

/**
 * Where a character offset is, expressed BESIDE anything atomic rather than within it.
 *
 * A folded object is one thing the browser will not edit into, so the places addressable around one
 * are before it and after it, named in the editable's own child list. Asking for a position inside
 * one asks for somewhere that does not exist: a caret put there is moved to wherever that content is
 * nearest to being, and an edit ranged from there is refused outright.
 *
 * The child HOLDS the atom rather than being it: what the browser will not edit into sits inside an
 * ordinary run, so that a line beginning with one still has a caret position at its start.
 * @param el - the composer surface.
 * @param offset - a character offset into the held text.
 */
export function beside(el: Element, offset: number): { node: Node; offset: number } {
  const kids = el.childNodes
  let seen = 0
  for (let i = 0; i < kids.length; i++) {
    const child = kids[i]!
    const len = heldLengthOf(child, el)
    const atom = child.nodeType === 1 && (child as Element).querySelector('[data-ccx-atom]') !== null
    if (offset <= seen + len) {
      if (atom) return { node: el, offset: offset <= seen ? i : i + 1 }
      if (child.nodeType === 3) return { node: child, offset: offset - seen }
      const inner = child.firstChild
      return inner !== null ? { node: inner, offset: offset - seen } : { node: el, offset: i }
    }
    seen += len
  }
  return { node: el, offset: kids.length }
}

/** The held length of one top-level child: its source text, drawing excluded. */
function heldLengthOf(child: Node, editable: Element): number {
  if (child.nodeType !== 1) return child.nodeValue?.length ?? 0
  const walker = editable.ownerDocument.createTreeWalker(child, NodeFilter.SHOW_TEXT)
  let len = 0
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (!underDraw(node, child as Element)) len += node.nodeValue?.length ?? 0
  }
  return len
}

/**
 * The character offset a position in the DOM answers for, over the held text.
 *
 * A position is a text node with a local offset, or an element with a child-list offset. The
 * element case is the boundary BEFORE the named child (or after all of them); the walk answers by
 * stopping at the first held text at or inside that boundary.
 * @param el - the composer surface.
 * @param container - the container node of the position.
 * @param containerOffset - the offset within that container.
 */
export function offsetOf(el: Element, container: Node, containerOffset: number): number {
  let boundary: Node | null
  if (container.nodeType === 3) boundary = container
  else {
    const kids = container.childNodes
    boundary = containerOffset < kids.length ? kids[containerOffset]! : null
  }

  const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  let count = 0
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (boundary !== null) {
      // The boundary is a text node: reaching it IS the answer.
      if (node === boundary) return count + Math.min(containerOffset, node.nodeValue?.length ?? 0)
      if (boundary.nodeType === 1) {
        // The position sits immediately before the boundary element: every
        // node that precedes it counts, and the first node inside its subtree
        // or after it ends the walk. (`compareDocumentPosition` answers where
        // the ARGUMENT sits relative to the receiver — FOLLOWING means the
        // walked node is after the boundary, CONTAINED_BY means inside it.)
        const pos = boundary.compareDocumentPosition(node)
        if (pos & Node.DOCUMENT_POSITION_FOLLOWING || pos & Node.DOCUMENT_POSITION_CONTAINED_BY) break
      }
    }
    count += heldValue(node, el).length
  }
  return count
}

/**
 * Replace the characters in `[from, to)` with `text`, as an edit the composer sees.
 *
 * The selection is left where the edit put it, which is after what was written -- the browser's
 * own answer, and the one a reader carrying on typing expects.
 */
export function replace(win: Window, el: Element, from: number, to: number, text: string): void {
  const write = (): boolean => {
    const start = beside(el, from)
    const stop = beside(el, to)
    const range = win.document.createRange()
    range.setStart(start.node, start.offset)
    range.setEnd(stop.node, stop.offset)
    const selection = win.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    return win.document.execCommand('insertText', false, text)
  }
  // Chromium refuses an `execCommand` raised from inside another one, and a clipboard shortcut
  // reaches the page that way wherever the host answers the keystroke by calling
  // `execCommand('cut')` -- so a cut wrote the clipboard and left the text exactly where it was.
  // The refusal is what the call returns, and a fresh task is outside the command that refused it.
  if (!write()) win.setTimeout(write, 0)
}

// @vitest-environment jsdom
/**
 * The address primitives over a decorated editable: the held text counts hidden source runs and
 * skips `data-ccx-draw` drawings, ranges may end in hidden runs, carets rest beside atoms, and the
 * reconcile keeps node identity across unchanged runs.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { at, beside, heldText, offsetOf } from '../src/client/editor/text.ts'
import { reconcile, decorate } from '../src/client/editor/reconcile.ts'
import { segments } from '../src/client/editor/segments.ts'
import { setSelection, selectionOffsets } from '../src/client/editor/selection.ts'

afterEach(() => {
  document.body.innerHTML = ''
})

/** A draw that renders a marked box whose own text would pollute a Range.toString read. */
const draw = (latex: string, display: boolean, at: number): Element => {
  void display; void at
  const span = document.createElement('span')
  // Deliberately character-bearing: the drawing is text, and the held-text walk must still skip it.
  span.textContent = `«${latex}»`
  return span
}

/** Build an editable decorated from `src`, the way `decorate` leaves it. */
function composed(src: string): HTMLDivElement {
  const el = document.createElement('div')
  el.setAttribute('contenteditable', 'plaintext-only')
  document.body.appendChild(el)
  const segs = segments(src, draw)
  reconcile(document, el, segs)
  return el
}

describe('the held text', () => {
  it('counts hidden source runs and skips the drawing, so drawing text owns no offset', () => {
    const el = composed('a $x$ b')
    expect(heldText(el)).toBe('a $x$ b')
    // The DOM holds the hidden source AND the drawing's own characters; only the held walk
    // separates them.
    expect(el.textContent).toBe('a $x$«x» b')
  })

  it('answers at() with hidden runs as range endpoints', () => {
    const el = composed('a $x$ b')
    // Offset 3 is inside the hidden `$x$` — a place a range may end.
    const spot = at(el, 4)
    expect(spot.node.nodeType).toBe(3)
    expect(offsetOf(el, spot.node, spot.offset)).toBe(4)
  })

  it('round-trips offsets over styled runs', () => {
    const el = composed('# Head\n\n**bold** _em_ `code` tail')
    expect(heldText(el)).toBe('# Head\n\n**bold** _em_ `code` tail')
    for (const offset of [0, 1, 7, 9, 12, 18, 20, 24, 30]) {
      const spot = at(el, offset)
      expect(offsetOf(el, spot.node, spot.offset)).toBe(offset)
    }
  })
})

describe('beside', () => {
  it('names atom-edge positions in the editable child list, never inside the atom', () => {
    const el = composed('pre $x$ post')
    // Offset 4 is the character just before the atom: the end of the run it sits in.
    const before = beside(el, 4)
    expect(before.node.nodeType).toBe(3)
    expect(before.offset).toBe(4)
    const after = beside(el, 7)
    expect(after.node).toBe(el)
    // Whichever edge, the caret lands on the drawn side of the atom.
    expect(after.offset).toBeGreaterThan(0)
  })

  it('still answers inside ordinary runs', () => {
    const el = composed('plain')
    const spot = beside(el, 2)
    expect(spot.node.nodeType).toBe(3)
    expect(spot.offset).toBe(2)
  })
})

describe('reconcile', () => {
  it('keeps node identity across an unchanged redecoration', () => {
    const el = composed('**bold** stays')
    const before = [...el.childNodes].map((node) => node)
    const changed = reconcile(document, el, segments('**bold** stays'))
    expect(changed).toBe(false)
    expect([...el.childNodes]).toEqual(before)
  })

  it('rewrites only what changed, keeping a highlighted neighbour in place', () => {
    const el = composed('**bold** and `code`')
    const codeNode = [...el.childNodes].find((node) => node.textContent === 'code')
    const changed = reconcile(document, el, segments('**bold** and `coded`'))
    expect(changed).toBe(true)
    expect([...el.childNodes]).toContain(codeNode)
  })

  it('draws the last line: a trailing newline ends in an appended break', () => {
    const el = composed('line\n')
    expect(el.lastChild?.nodeName).toBe('BR')
    reconcile(document, el, segments('line'))
    expect(el.lastChild?.nodeName).not.toBe('BR')
  })
})

describe('selection round-trip', () => {
  it('reads and restores a collapsed caret over decorated runs', () => {
    const el = composed('**bold** tail')
    setSelection(window, el, 9)
    const read = selectionOffsets(window, el)
    expect(read).toMatchObject({ start: 9, end: 9, backward: false })
  })

  it('reads which end is moving', () => {
    const el = composed('abcdef')
    setSelection(window, el, 1, 4, true)
    const read = selectionOffsets(window, el)
    expect(read?.start).toBe(1)
    expect(read?.end).toBe(4)
    expect(read?.focus).toBe(1)
    expect(read?.backward).toBe(true)
  })

  it('decoration preserves the selection without restoring it on a no-op', () => {
    const el = composed('**bold** tail')
    setSelection(window, el, 9)
    const segs = decorate(window, el, draw, null)
    expect(segs.length).toBeGreaterThan(0)
    expect(selectionOffsets(window, el)).toMatchObject({ start: 9 })
  })
})

// `execCommand` is the one primitive here jsdom only stubs (every call answers false), so the
// browser-performed edit path is pinned by the real-browser caret suite, not here.

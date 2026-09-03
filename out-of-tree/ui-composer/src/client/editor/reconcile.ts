/**
 * Writing the segments onto the editable IN PLACE: a node whose styling signature still matches
 * keeps its identity (only its text is rewritten if it changed), so an untouched run -- a
 * highlighted fence while you type elsewhere -- is never rebuilt and never flashes.
 *
 * A no-op decoration never restores the selection: restoring one discards its AFFINITY, which is
 * the only thing telling the end of a wrapped line from the start of the next, since both are the
 * same offset.
 */

import { heldText } from './text.ts'
import { uncompensated, segments as segmentSource, type Segment } from './segments.ts'
import { selectionOffsets, setSelection } from './selection.ts'

export const CLASS_PREFIX = 'ccx-md-'

/** A segment's styling signature; null means a plain text node. A node keeps its identity across a
 * redecoration iff its signature is unchanged -- the annotation included, so an object whose note
 * changed is rebuilt rather than left showing the old one. */
const sigOf = (seg: Segment): string | null =>
  seg.classes.length > 0 || seg.color !== null || seg.note !== null
    ? seg.classes.map((c) => CLASS_PREFIX + c).join(' ') + '\x00' + (seg.color ?? '') + '\x01' + (seg.note ?? '')
    : null

/** A decorated node, carrying the signature it was built with for identity across redecorations. */
interface SignedNode extends Node {
  __ccxSig?: string | undefined
}

function makeNode(doc: Document, seg: Segment, sig: string | null): Node {
  if (sig === null) return doc.createTextNode(seg.text)
  const span = doc.createElement('span')
  if (seg.classes.length > 0) span.className = seg.classes.map((c) => CLASS_PREFIX + c).join(' ')
  if (seg.color !== null) span.style.color = seg.color
  // What an object says beside itself rides an attribute a `::after` renders, never a node: the
  // text the composer holds is the message about to be sent, and nothing shown beside the text may
  // become part of it.
  if (seg.note !== null) span.setAttribute('data-ccx-note', seg.note)
  span.textContent = seg.text
  ;(span as SignedNode).__ccxSig = sig
  return span
}

/**
 * The runs of one folded object, as a single thing the browser will not edit into.
 *
 * Measured, not supposed, in the reference: left as separate runs with their syntax merely hidden,
 * the caret walks into the hidden part and stops there -- an arrow held down stalls at the end of
 * the label and never leaves, everything typed lands inside the brackets, and a select-all delete
 * takes only what was drawn. Made one thing the browser will not edit into, every one of those
 * becomes what it should be: an arrow crosses the whole object in one press, typing beside it lands
 * beside it, and a delete takes it entire.
 *
 * Its source runs are still text -- the held-text walk counts them -- so what the composer holds is
 * untouched by being drawn this way. The thing the browser will not edit into sits INSIDE an
 * ordinary run rather than standing as one: a line whose first thing is uneditable has no caret
 * position at its own start, so the run around it stays editable.
 */
function makeAtom(doc: Document, segs: readonly Segment[], sig: string): Node {
  const box = doc.createElement('span')
  // Valued rather than bare, so an atom under a pointer says which object it is without anyone
  // counting atoms.
  box.setAttribute('data-ccx-atom', String(segs[0]?.atom ?? ''))
  box.setAttribute('contenteditable', 'false')
  for (const seg of segs) box.appendChild(makeNode(doc, seg, sigOf(seg) ?? null))

  // What an object draws goes inside the same box, beside the runs it hides rather than instead of
  // them, under a `data-ccx-draw` mark: the mark is what keeps the drawing's own characters (the
  // typeset glyphs' spans) out of the held text while the hidden source stays in it.
  const surface = segs[0]?.draws
  if (surface !== null && surface !== undefined) {
    const drawn = doc.createElement('span')
    drawn.setAttribute('data-ccx-draw', '')
    drawn.appendChild(surface(doc))
    box.appendChild(drawn)
  }

  const place = doc.createElement('span')
  place.appendChild(box)
  ;(place as SignedNode).__ccxSig = sig
  return place
}

/**
 * Reconcile the editable's children against the segments in place.
 * @returns whether anything was actually written.
 */
export function reconcile(doc: Document, el: Element, segs: readonly Segment[]): boolean {
  let changed = false

  // Runs of one folded object become ONE element, and that element is `contenteditable="false"`.
  interface Item { atom: number | null; segs: Segment[] }
  const items: Item[] = []
  for (const seg of segs) {
    const last = items[items.length - 1]
    if (last !== undefined && last.atom !== null && last.atom === seg.atom) last.segs.push(seg)
    else items.push({ atom: seg.atom, segs: [seg] })
  }

  let node: Node | null = el.firstChild
  for (const item of items) {
    const sig = item.atom === null
      ? sigOf(item.segs[0]!)
      : `\x05${item.segs.map((seg) => sigOf(seg) ?? '').join('|')}`
    const text = item.segs.map((seg) => seg.text).join('')

    // An object's place is a run the browser MAY write into -- that is what gives a line led by one
    // a caret position at its start -- so a character typed there lands inside it. Its place is
    // kept only while it holds the object and nothing else; anything else typed there is a run of
    // its own, built beside it as any other run is.
    const current = node as SignedNode | null
    const matches = current !== null
      && (sig === null ? current.nodeType === 3 : current.__ccxSig === sig)
      && (item.atom === null || current.textContent === text)

    if (matches && current !== null) {
      if (item.atom === null && current.textContent !== text) {
        current.textContent = text
        changed = true
      }
      node = current.nextSibling
      continue
    }

    const built = item.atom === null
      ? makeNode(doc, item.segs[0]!, sig)
      : makeAtom(doc, item.segs, sig ?? '')
    el.insertBefore(built, node)
    changed = true
  }

  while (node !== null) {
    const next = node.nextSibling
    el.removeChild(node)
    node = next
    changed = true
  }

  // Every line drawn, measured rather than reasoned about. A trailing break is INVISIBLE where the
  // text does not end in a newline and adds exactly one line where it does -- so a text ending in k
  // newlines, which is k+1 lines, is drawn whole by a break appended exactly when it ends in one.
  // Without it the last line is never drawn, which is why emptying a line made it disappear.
  const ends = (segs[segs.length - 1]?.text ?? '').endsWith('\n')
  const last = el.lastChild
  const drawn = last !== null && last.nodeName === 'BR'

  if (ends && !drawn) {
    el.appendChild(doc.createElement('br'))
    changed = true
  } else if (!ends && drawn && last !== null) {
    el.removeChild(last)
    changed = true
  }

  return changed
}

/** The styling of the composer surface, appended to the document once per plugin mount. */
export const COMPOSER_STYLE = `
.ccx-md-marker{opacity:.45}
.ccx-md-strong{font-weight:700}
.ccx-md-em{font-style:italic}
.ccx-md-strike{text-decoration:line-through}
.ccx-md-folded{display:none}
[data-ccx-atom]{cursor:text}
.ccx-md-taken{background:var(--dsw-selection,rgba(127,127,127,.3))}
.ccx-md-link{text-decoration:underline;color:var(--dsw-link,currentColor)}
.ccx-md-url{opacity:.6}
.ccx-md-heading{font-weight:700}
.ccx-md-code,.ccx-md-fence{font-family:ui-monospace,monospace}
.ccx-md-code{background:rgba(127,127,127,.16);border-radius:3px}
[data-ccx-note]::after{content:attr(data-ccx-note);margin-left:.4em;padding:0 .35em;border-radius:3px;background:rgba(127,127,127,.16);opacity:.6;font-size:.9em;font-style:normal;font-weight:400;text-decoration:none;white-space:pre;user-select:none;-webkit-user-select:none}
`

/**
 * Decorate the editable once: read the held text and selection, segment, reconcile, and put the
 * selection back only when something was written.
 * @param win - the host window.
 * @param el - the composer surface.
 * @param drawMath - how to typeset an expression, or null where KaTeX is not ready.
 * @param colorFor - per-character colours for a fenced block's body, or null when unavailable.
 * @param compensated - where the browser has just written a newline of its own to hold a line
 *   open, or -1 for nowhere.
 * @param open - where the one object being edited begins, or -1 for none.
 * @returns what was written, so a caller reading the same text need not parse it again.
 */
export function decorate(
  win: Window,
  el: Element,
  drawMath: ((latex: string, display: boolean, at: number) => Element) | null,
  colorFor: ((lang: string, code: string) => (string | null)[] | null) | null,
  compensated = -1,
  open = -1,
): Segment[] {
  const text = uncompensated(heldText(el), compensated)
  const sel = selectionOffsets(win, el)
  // The compensation removes one character from the buffer: a caret read on
  // the pre-removal text sits one too far right once the segments are
  // written. Shifting keeps the caret on the line the writer broke TO
  // (after the newline) instead of stranding it at the end of the line they
  // broke AWAY from.
  const shifted = sel !== null && compensated >= 0 && sel.start > compensated
    ? { ...sel, start: sel.start - 1, end: sel.end - 1, focus: sel.focus - 1 }
    : sel
  const segs = segmentSource(text, drawMath, colorFor, open)
  const changed = reconcile(win.document, el, segs)
  if (shifted !== null && changed) setSelection(win, el, shifted.start, shifted.end, shifted.backward)
  return segs
}

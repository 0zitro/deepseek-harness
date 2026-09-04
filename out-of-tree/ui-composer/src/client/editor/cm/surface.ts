/**
 * The CodeMirror 6 editing surface: one editable whose document is the full
 * markdown source.
 *
 * The browser never edits freely here — CodeMirror intercepts input, converts
 * it to transactions on its own document, and renders the decorations the
 * builder produces. The surface is a THIN assembly: extensions, the callbacks
 * the shell plane and the trigger pipeline need, and the verbs the action
 * service reaches. Gesture policy stays with the component (`onKey` claims a
 * keydown before CodeMirror's handlers; the keybinding dispatcher claims bound
 * gestures before this surface sees them at all).
 */

import { EditorSelection, EditorState, Prec, type Extension } from '@codemirror/state'
import {
  EditorView, drawSelection, dropCursor, keymap, placeholder,
} from '@codemirror/view'
import {
  cursorGroupBackward, cursorGroupForward, cursorLineDown, cursorLineUp,
  defaultKeymap, history, historyField, historyKeymap, redo, undo,
} from '@codemirror/commands'
import { createColorFor, type ColorFor } from '../highlight.ts'
import { AT, END, caretStops, drawWithAddress } from '../math.ts'
import { linksIn, mathsIn } from '../segments.ts'
import { richDecorations, requestColors } from './decorations.ts'

/** Options for {@link createRichSurface}. */
export interface RichSurfaceOptions {
  /** The element CodeMirror mounts into (already in the document, empty). */
  host: HTMLElement
  /** The initial document text (the shell draft at mount). */
  doc: string
  /** Placeholder shown while the document is empty. */
  placeholderText: string
  /** The label assistive technology announces for the editable. */
  ariaLabel: string
  /** Push a document change: the single writer into the session shell. */
  onEdit(text: string): void
  /** The caret moved (or the text under it changed), with the document text. */
  onCaret(text: string, head: number): void
  /** Files arrived by paste or drop. */
  onFiles(files: readonly File[]): void
  /** Claim a keydown before CodeMirror's handlers. True claims the gesture. */
  onKey(event: KeyboardEvent): boolean
}

/** The control a surface keeps for the behaviors it triggers itself. */
export interface RichSurface {
  /** The CodeMirror view (tests and harnesses reach it; the surface owns it). */
  readonly view: EditorView
  /** The document text right now — the source, verbatim. */
  held(): string
  /**
   * Adopt a text this surface did not type: a persisted seed, a pick insert, a
   * send-clear. One transaction replaces the buffer and puts the caret at its
   * end; adopting the text already held is a no-op.
   * @param text - the next buffer text.
   */
  adopt(text: string): void
  /** Focus the editable. */
  focus(): void
  /** Undo one step, as the keyboard shortcut would. */
  undo(): void
  /** Redo one step, as the keyboard shortcut would. */
  redo(): void
  /**
   * A submission carried the buffer away: the text becomes a history entry
   * (its undo stack riding along) and the composer starts a fresh draft.
   */
  sent(): void
  /** Stop and tear the editable down. */
  dispose(): void
}

/**
 * A plain newline: the default keymap's Enter copies the previous line's
 * indentation, which would write leading spaces the writer never typed into
 * the markdown source (a continued fence body, an indented closing fence).
 * @param view - the view the keypress landed in.
 * @returns true — the gesture is consumed.
 */
function plainNewline(view: EditorView): boolean {
  view.dispatch(view.state.replaceSelection('\n'), { scrollIntoView: true })
  return true
}

/** One maths span, as the movement handlers read it. */
type MathSpan = { from: number; to: number; at: number }

/** Where a folded maths opens when entered from an edge: its LaTeX's ends. */
const entered = (one: MathSpan): { left: number; right: number } => ({
  left: Math.min(one.at, one.to - 1),
  right: Math.max(one.to - (one.at - one.from), one.from + 1),
})

/**
 * The caret position a point over a drawing lands on: the corner argmin.
 *
 * Every atomic glyph offers its corners, and the corners carry their source:
 * a LEFT corner stands for the caret placed BEFORE the glyph, a RIGHT corner
 * for the caret placed AFTER it, each mapped to the glyph's own source span.
 * The nearest corner to the point wins — an argmin over honest
 * two-dimensional distances — so a stacked layout resolves itself: from
 * above, a superscript's top corners are nearer than the subscript's below
 * it; from below, the subscript's bottom corners are; a press on a row
 * reads that row. A command that draws several glyphs (`\LaTeX`) has every
 * glyph carrying the whole command's span, so whichever corner wins, the
 * caret stands before or after the command — never inside it — and the
 * final position snaps to a caret stop regardless. This is the pseudo text
 * layer the reference built MathJax for, derived from KaTeX's own laid-out
 * glyph rects instead; "corner", "before", and "after" are the notions, and
 * they generalise to any dimension a layout may grow.
 * @param view - the view the drawing lives in.
 * @param from - where the span begins in the document.
 * @param to - where the span ends in the document.
 * @param x - the horizontal position the gesture was aimed at.
 * @param y - the vertical position the gesture entered from (the pointer for
 *   a press, the source caret for a vertical move).
 * @returns true when a drawing answered and the caret moved into it.
 */
function openMathAt(view: EditorView, from: number, to: number, x: number, y: number): boolean {
  const box = view.dom.querySelector(`[data-ccx-atom="${from}"]`)
  if (box === null) return false

  const glyphs = [...box.querySelectorAll(`[${AT}]`)].flatMap((one) => {
    // A blank glyph (a `\;`'s mspace) is an empty span whose space is its
    // right margin: its right edge is where that margin ends.
    const rect = one.getBoundingClientRect()
    const margin = parseFloat(getComputedStyle(one).marginRight)
    const right = rect.right + (Number.isFinite(margin) ? margin : 0)
    const at = Number(one.getAttribute(AT))
    const end = Number(one.getAttribute(END))
    if (!Number.isInteger(at) || !Number.isInteger(end)) return []
    return [
      { x: rect.left, y: rect.top, at },
      { x: rect.left, y: rect.bottom, at },
      { x: right, y: rect.top, at: end },
      { x: right, y: rect.bottom, at: end },
    ]
  })
  if (glyphs.length === 0) return false

  const struckBy = (one: { x: number; y: number }): number =>
    (one.x - x) ** 2 + (one.y - y) ** 2
  const stops = (box.getAttribute('data-ccx-stops') ?? '')
    .split(',').map(Number).filter((one) => Number.isInteger(one))
  const nearest = glyphs.reduce((near, one) => (struckBy(one) < struckBy(near) ? one : near))
  const snapped = stops.length === 0
    ? nearest.at
    : stops.reduce((near, one) => (Math.abs(one - nearest.at) < Math.abs(near - nearest.at) ? one : near))
  const struck = Math.min(Math.max(snapped, from + 1), to - 1)
  if (!Number.isInteger(struck)) return false

  view.dispatch({ selection: { anchor: struck } })
  return true
}

/**
 * A horizontal arrow at a folded maths span's edge opens it, caret at its
 * LaTeX's near end. Links need no counterpart: their label is real text, so
 * the native arrow already steps into it.
 * @param entering - the edge the arrow moves in from (`from` for rightward).
 */
const arrowIntoMath = (entering: 'from' | 'to') => (view: EditorView): boolean => {
  const main = view.state.selection.main
  if (!main.empty) return false
  const one = mathsIn(view.state.doc.toString())
    .find((m) => (entering === 'from' ? m.from === main.head : m.to === main.head))
  if (one === undefined) return false
  view.dispatch({ selection: { anchor: entered(one)[entering === 'from' ? 'left' : 'right'] } })
  return true
}

/**
 * A group move (Ctrl/Mod+Arrow) treats a whole folded object as one group:
 * the default command walks the document's words and stops inside a link's
 * label; when the move ENTERED a fold from outside, the caret leaves at the
 * far edge instead, as it already does for maths spans.
 * @param forward - whether the gesture moves rightward.
 */
const groupPastFolds = (forward: boolean) => (view: EditorView): boolean => {
  const before = view.state.selection.main.head
  if (!(forward ? cursorGroupForward : cursorGroupBackward)(view)) return false
  const after = view.state.selection.main.head
  const text = view.state.doc.toString()
  const folds = [
    ...linksIn(text).map((link) => ({ from: link.from, to: link.to })),
    ...mathsIn(text),
  ]
  const crossed = folds.find((one) =>
    after > one.from && after < one.to && (forward ? before <= one.from : before >= one.to))
  if (crossed !== undefined) {
    view.dispatch({ selection: { anchor: forward ? crossed.to : crossed.from } })
  }
  return true
}

/**
 * A vertical move whose column strikes a drawing opens it at the drawing's
 * nearest corner.
 *
 * The default command makes the move first (goal column and wrapping are
 * its). Around an atomic span its landing is wherever the layout put it —
 * an edge, inside the replaced range, or a whole line beyond — so the
 * drawings that matter are every span on the lines the move touched whose
 * drawn box the column crosses: a column over a drawing belongs to the
 * drawing, and the caret goes to its nearest corner (see `openMathAt`);
 * a column over text belongs to the default landing.
 * @param up - whether the gesture moves upward.
 */
const verticalIntoMath = (up: boolean) => (view: EditorView): boolean => {
  const before = view.state.selection.main.head
  // Leaving an open maths span goes by the RENDER, not the source: the span's
  // line shows LaTeX while open, and LaTeX is more text-verbose than what it
  // draws, so the source column would land the caret far right of where the
  // eye sits.
  const inside = mathsIn(view.state.doc.toString()).find((m) => before > m.from && before < m.to)
  if (inside !== undefined) return verticalOutOfMath(up, inside, view)

  const coords = view.coordsAtPos(before)
  if (!(up ? cursorLineUp : cursorLineDown)(view)) return false
  const after = view.state.selection.main.head
  if (after === before || coords === null) return true

  const doc = view.state.doc
  const low = Math.min(doc.lineAt(before).number, doc.lineAt(after).number)
  const high = Math.max(doc.lineAt(before).number, doc.lineAt(after).number)
  // The departure corner: the caret's own near corner for the direction.
  const departY = up ? coords.top : coords.bottom

  for (const one of mathsIn(doc.toString())) {
    if (before > one.from && before < one.to) continue // leaving it, not entering
    const line = doc.lineAt(one.from).number
    if (line < low || line > high) continue
    const rect = view.dom.querySelector(`[data-ccx-atom="${one.from}"]`)?.getBoundingClientRect()
    if (rect === undefined || coords.left < rect.left || coords.left > rect.right) continue
    openMathAt(view, one.from, one.to, coords.left, departY)
    return true
  }
  return true
}

/**
 * Move the caret OUT of an open maths span by the RENDER it would draw.
 *
 * The machinery of entering, run backwards: the caret's source offset snaps
 * to the nearest caret stop (a mid-command position — `\La|TeX` — has no
 * glyph, so it goes to the command's nearer end), the render's glyph that
 * owns the snapped offset offers its corner for it, and the caret lands in
 * the adjacent line at that corner's column — `posAtCoords` answers for
 * whatever that line holds, text or folded atoms alike. Two equal spans
 * therefore mirror: the same source offset maps to the same render corner,
 * and the same corner to the same column in equal lines.
 *
 * The render is measured from a hidden copy of the drawing (the open span
 * shows source, so the drawing is absent from the DOM); the copy rides the
 * editor's own element, where the KaTeX stylesheet and the surface's font
 * apply, and its left edge anchors the corner into the line's coordinates.
 * @param up - whether the gesture moves upward.
 * @param one - the open maths span the caret sits in.
 * @param view - the view being edited.
 * @returns true when the move was made here; false leaves the default to run.
 */
function verticalOutOfMath(
  up: boolean,
  one: { from: number; to: number; at: number; latex: string; display: boolean },
  view: EditorView,
): boolean {
  const doc = view.state.doc
  const line = doc.lineAt(one.from)
  const target = up ? doc.line(line.number - 1) : doc.line(line.number + 1)
  if (target === undefined) return false

  // The caret's offset, snapped to where the glyphs live (a stop).
  const inside = Math.min(Math.max(view.state.selection.main.head - one.at, 0), one.latex.length)
  const snapped = caretStops(one.latex).reduce((near, stop) =>
    Math.abs(stop - inside) < Math.abs(near - inside) ? stop : near, 0)
  const offset = one.at + snapped

  // A hidden copy of the drawing, on the editor's own element, stamps and
  // all — measured, then gone.
  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  host.style.position = 'absolute'
  host.style.visibility = 'hidden'
  host.style.left = '0'
  host.style.top = '0'
  const drawn = drawWithAddress(one.latex, one.display, one.at)
  host.appendChild(drawn)
  view.dom.appendChild(host)
  const anchor = view.coordsAtPos(one.from)
  const landing = view.coordsAtPos(target.from)
  const made = (() => {
    if (anchor === null || landing === null) return false
    const home = host.getBoundingClientRect()
    if (home.width === 0) return false

    // The render's corner owning the snapped offset: every stamped glyph
    // offers the two edges of its source span, blanks carrying their margin;
    // the corner on the row nearest the caret's own line wins ties.
    const midY = (anchor.top + anchor.bottom) / 2
    let corner: { x: number; away: number; row: number } | null = null
    for (const glyph of [...drawn.querySelectorAll(`[${AT}]`)]) {
      const rect = glyph.getBoundingClientRect()
      const margin = parseFloat(getComputedStyle(glyph).marginRight)
      const right = rect.right + (Number.isFinite(margin) ? margin : 0)
      const at = Number(glyph.getAttribute(AT))
      const end = Number(glyph.getAttribute(END))
      if (!Number.isInteger(at) || !Number.isInteger(end)) continue
      for (const edge of [{ x: rect.left, at }, { x: right, at: end }]) {
        const away = Math.abs(edge.at - offset)
        const row = Math.abs((rect.top + rect.bottom) / 2 - midY)
        if (corner === null || away < corner.away || (away === corner.away && row < corner.row)) {
          corner = { x: edge.x, away, row }
        }
      }
    }
    if (corner === null) return false

    // The hidden copy's left edge is the drawing's origin; the span's own
    // start position anchors it into the line, and the adjacent line's
    // middle answers for the column.
    const x = anchor.left + (corner.x - home.left)
    const y = (landing.top + landing.bottom) / 2
    const placed = view.posAtCoords({ x, y }, false)
    if (placed === null) return false
    view.dispatch({ selection: { anchor: placed }, scrollIntoView: true })
    return true
  })()
  host.remove()
  return made
}

/**
 * Mount the rich editing surface into one host element.
 * @param options - the host, the initial text, and the surface callbacks.
 * @returns the control the component drives.
 */
export function createRichSurface(options: RichSurfaceOptions): RichSurface {
  // Stale-while-revalidate fence colours: a lazy grammar finishing loads
  // invalidates every fence rendered plain for it, and one off-schedule
  // rebuild repaints them.
  const colorFor: ColorFor = createColorFor(() => { requestColors(view) })

  // The send history: one serialized state per submission — text, selection,
  // and the WHOLE undo stack of composing it — plus the draft the writer is
  // on now. Every position keeps its own stack for the whole of its life:
  // recalling an entry restores its editor wholesale, so undo walks the
  // entry's own edits, and leaving it again saves whatever more was done.
  // `at` names the position: -1 the draft, otherwise an entry's index.
  interface Position { state: unknown; text: string | null }
  const entries: Position[] = []
  const draft: Position = { state: null, text: null }
  let at = -1
  const held = (): Position => (at === -1 ? draft : entries[at]!)

  // A position serializes with its undo stack: fields ride along only when
  // named, and the history field is the one an entry is.
  const FIELDS = { history: historyField }
  const serialize = (): unknown => view.state.toJSON(FIELDS)
  const arrive = (position: Position): void => {
    // A position never saved (a fresh draft) arrives as an empty editor with
    // an empty stack — there is nothing to restore.
    if (position.state === null) {
      view.setState(EditorState.create({ doc: '', selection: EditorSelection.single(0), extensions }))
      return
    }
    view.setState(EditorState.fromJSON(
      position.state as Parameters<typeof EditorState.fromJSON>[0],
      { extensions },
      FIELDS,
    ))
  }

  // The one extension set: the mounted state is built from it, and so is
  // every history arrival — the same editor, whole.
  const extensions: Extension[] = [
    history(),
        drawSelection(),
        dropCursor(),
        EditorView.lineWrapping,
        placeholder(options.placeholderText),
        richDecorations(colorFor),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        // Above the default keymap: whose Enter indents (this is a markdown
        // source buffer, and a newline is just a newline in it), and whose
        // arrows walk the document without ever opening a folded maths.
        Prec.high(keymap.of([
          // History first: at the buffer's edges the vertical arrows have no
          // line to cross, and there the recall walks — every position its
          // own undo stack riding in its serialized state.
          { key: 'ArrowUp', run: historyWalk(-1) },
          { key: 'ArrowDown', run: historyWalk(1) },
          { key: 'Enter', run: plainNewline },
          { key: 'ArrowRight', run: arrowIntoMath('from') },
          { key: 'ArrowLeft', run: arrowIntoMath('to') },
          { key: 'Mod-ArrowRight', run: groupPastFolds(true) },
          { key: 'Mod-ArrowLeft', run: groupPastFolds(false) },
          { key: 'ArrowUp', run: verticalIntoMath(true) },
          { key: 'ArrowDown', run: verticalIntoMath(false) },
        ])),
        EditorView.contentAttributes.of({
          'aria-label': options.ariaLabel,
          'aria-multiline': 'true',
          spellcheck: 'false',
          translate: 'no',
        }),
        Prec.highest(EditorView.domEventHandlers({
          keydown(event) {
            if (options.onKey(event)) {
              event.preventDefault()
              return true
            }
            return false
          },
          paste(event) {
            const files = [...event.clipboardData?.files ?? []]
            if (files.length === 0) return false
            options.onFiles(files)
            return true
          },
          drop(event) {
            const files = [...event.dataTransfer?.files ?? []]
            if (files.length === 0) return false
            options.onFiles(files)
            return true
          },
          mousedown(event, view) { return strikeMath(event, view) },
        })),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) options.onEdit(update.state.doc.toString())
      if (update.docChanged || update.selectionSet) {
        options.onCaret(update.state.doc.toString(), update.state.selection.main.head)
      }
    }),
  ]
  const view = new EditorView({
    parent: options.host,
    state: EditorState.create({
      doc: options.doc,
      selection: EditorSelection.single(options.doc.length),
      extensions,
    }),
  })

  // The initial feed: the trigger pipeline learns the mounted text and caret
  // the same way it learns every later one.
  options.onCaret(options.doc, view.state.selection.main.head)

  /**
   * Walk the history one position in a direction: only at the buffer's
   * extreme edge for that direction (where a vertical move has no line to
   * cross) and only when a position lies that way — the draft sits past the
   * newest entry, the oldest entry bounds the other end.
   */
  function historyWalk(step: number): (editor: EditorView) => boolean {
    return (editor) => {
      const main = editor.state.selection.main
      if (!main.empty) return false
      const atEdge = step < 0 ? main.head === 0 : main.head === editor.state.doc.length
      if (!atEdge) return false
      // Up always names an entry (the draft is the newest position there is
      // nothing newer than); down may name the draft past the newest entry.
      const target = at === -1
        ? step < 0 ? entries.length - 1 : undefined
        : step < 0 ? at - 1 : at + 1
      if (target === undefined || target < 0 || target > entries.length) return false
      held().state = serialize()
      at = target === entries.length ? -1 : target
      arrive(target === entries.length ? draft : entries[target]!)
      return true
    }
  }

  return {
    view,
    held: () => view.state.doc.toString(),
    adopt: (text) => {
      if (view.state.doc.toString() === text) return
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text },
        selection: { anchor: text.length },
      })
    },
    focus: () => { view.focus() },
    undo: () => { undo(view) },
    redo: () => { redo(view) },
    sent: () => {
      const text = view.state.doc.toString()
      held().state = serialize()
      held().text = text
      // The buffer becomes an entry; a consecutive duplicate of the newest
      // one is not two walks of the same message.
      if (text !== '' && entries[entries.length - 1]?.text !== text) {
        entries.push({ state: serialize(), text })
      }
      at = -1
      draft.state = null
      draft.text = null
      arrive(draft)
    },
    dispose: () => { view.destroy() },
  }
}

/**
 * A press on a folded expression opens it at the glyph under the pointer.
 *
 * A glyph is a filled outline, so it receives a pointer only where its strokes
 * are — the nearest stamped glyph by pointer x answers where the writer was
 * reaching. No two-phase caret: the document selection and its display are
 * different layers, and only the display was waiting on the fold.
 * @param event - the mousedown the surface saw.
 * @param view - the view the drawing lives in.
 * @returns true when a drawing was struck (the press is claimed).
 */
function strikeMath(event: Event, view: EditorView): boolean {
  const target = event.target
  if (target === null || typeof (target as Element).closest !== 'function') return false
  const box = (target as Element).closest('[data-ccx-draw]')
  if (box === null || !view.dom.contains(box)) return false
  const from = Number(box.getAttribute('data-ccx-atom'))
  const to = Number(box.getAttribute('data-ccx-to'))
  if (!Number.isInteger(from) || !Number.isInteger(to)) return false

  // The press is claimed, and its defaults with it: the browser's own
  // focus-on-click caret would land on the widget's edge and overwrite the
  // selection the stamp just placed.
  event.preventDefault()
  view.focus()
  const pointer = event as MouseEvent
  return openMathAt(view, from, to, pointer.clientX, pointer.clientY)
}

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

import { EditorSelection, EditorState, Prec } from '@codemirror/state'
import {
  EditorView, drawSelection, dropCursor, keymap, placeholder,
} from '@codemirror/view'
import {
  cursorGroupBackward, cursorGroupForward, cursorLineDown, cursorLineUp,
  defaultKeymap, history, historyKeymap, redo, undo,
} from '@codemirror/commands'
import { createColorFor, type ColorFor } from '../highlight.ts'
import { AT, END } from '../math.ts'
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
 * Open the folded maths spanning [from, to), caret at the source position a
 * horizontal position lands on — the one place three gestures meet (a press
 * on a drawing, a vertical move whose column fell inside one).
 *
 * The mapping is TOTAL: every position over the drawing lands somewhere in
 * the source. Each stamped glyph pins two exact boundaries — its left edge
 * where its source starts, its right edge where that source ends — and the
 * stretches no glyph covers (spacing commands like `\;`, the room around a
 * construct) interpolate between their neighbours, out to the drawing's own
 * edges at the interior's bounds. Atomicity falls out of monotonicity: the
 * boundaries are read in drawing order with their offsets clamped
 * non-decreasing, so a multi-glyph command (`\LaTeX`, a stacked delimiter)
 * whose glyphs all carry the same command span never maps a position inside
 * it outside it — while a command that draws several PAIRED glyphs (the
 * scripts of a big operator) keeps their individual positions. This is the
 * pseudo text layer the reference built MathJax for, derived from KaTeX's
 * own laid-out glyph rects instead.
 * @param view - the view the drawing lives in.
 * @param from - where the span begins in the document.
 * @param to - where the span ends in the document.
 * @param x - the horizontal position the gesture was aimed at.
 * @returns true when a drawing answered and the caret moved into it.
 */
function openMathAt(view: EditorView, from: number, to: number, x: number): boolean {
  const box = view.dom.querySelector(`[data-ccx-atom="${from}"]`)
  if (box === null) return false
  const drawn = box.getBoundingClientRect()

  const stamps = [...box.querySelectorAll(`[${AT}]`)].flatMap((one) => {
    const rect = one.getBoundingClientRect()
    const at = Number(one.getAttribute(AT))
    const end = Number(one.getAttribute(END))
    if (!Number.isInteger(at) || !Number.isInteger(end) || rect.width === 0) return []
    return [
      { x: rect.left, at },
      { x: rect.right, at: end },
    ]
  })
  if (stamps.length === 0) return false

  // Drawing order, offsets never running backwards: the clamp is what makes a
  // command's glyphs one unbreakable region carrying its whole source span.
  stamps.sort((one, other) => one.x - other.x)
  const marks = [{ x: drawn.left, at: from + 1 }]
  for (const stamp of stamps) {
    const previous = marks[marks.length - 1]!
    marks.push({ x: stamp.x, at: Math.max(stamp.at, previous.at) })
  }
  marks.push({ x: drawn.right, at: to - 1 })

  // Where x falls: on a mark, or between two, proportionally across the
  // stretch no glyph pinned — then SNAPPED to the nearest caret stop, so a
  // position inside a command (`\%;`) never exists: the caret stands before
  // the whole command or after it, whichever the column was nearer.
  const stops = (box.getAttribute('data-ccx-stops') ?? '')
    .split(',').map(Number).filter((one) => Number.isInteger(one))
  const snap = (at: number): number => {
    if (stops.length === 0) return at
    return stops.reduce((near, one) => (Math.abs(one - at) < Math.abs(near - at) ? one : near))
  }
  const place = (x: number): number => {
    if (x <= marks[0]!.x) return marks[0]!.at
    for (let i = 1; i < marks.length; i++) {
      const later = marks[i]!
      if (x <= later.x) {
        const earlier = marks[i - 1]!
        const across = later.x - earlier.x
        const along = across <= 0 ? 0 : (x - earlier.x) / across
        return Math.round(earlier.at + (later.at - earlier.at) * along)
      }
    }
    return marks[marks.length - 1]!.at
  }
  const struck = Math.min(Math.max(snap(place(x)), from + 1), to - 1)
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
 * A vertical move whose column falls inside a folded maths opens it at the
 * glyph that column struck. The default command makes the move (goal column
 * and wrapping are its); when the landing clamps to a span's edge — the atom
 * holds every column its line covers — the drawing's glyph map says which
 * source offset the column meant, exactly as a press does. This is what the
 * reference needed MathJax's pseudo text layer for: CodeMirror lets the
 * placement be dispatched rather than read out of the layout, so KaTeX plus
 * the stamp map answers it.
 * @param up - whether the gesture moves upward.
 */
const verticalIntoMath = (up: boolean) => (view: EditorView): boolean => {
  const main = view.state.selection.main
  const before = main.head
  const coords = view.coordsAtPos(before)
  if (!(up ? cursorLineUp : cursorLineDown)(view)) return false
  const after = view.state.selection.main.head
  if (after === before) return true
  // A vertical landing over a drawing is wherever the layout put it — an
  // edge, or inside the replaced range itself — so the trigger is the span
  // the landing fell into (or touched), not its edges alone.
  const one = mathsIn(view.state.doc.toString())
    .find((m) => after >= m.from && after <= m.to && (before < m.from || before > m.to))
  if (one === undefined || coords === null) return true
  openMathAt(view, one.from, one.to, coords.left)
  return true
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

  const view = new EditorView({
    parent: options.host,
    state: EditorState.create({
      doc: options.doc,
      selection: EditorSelection.single(options.doc.length),
      extensions: [
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
      ],
    }),
  })

  // The initial feed: the trigger pipeline learns the mounted text and caret
  // the same way it learns every later one.
  options.onCaret(options.doc, view.state.selection.main.head)

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
  return openMathAt(view, from, to, (event as MouseEvent).clientX)
}

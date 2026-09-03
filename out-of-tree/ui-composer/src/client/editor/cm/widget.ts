/**
 * The composer's inline widgets: what a folded object draws where it has
 * hidden all of its own text.
 *
 * A widget never edits the document — it is a DECORATION's stand-in. The
 * document keeps the source verbatim (the invariant the shell plane and every
 * send rest on), and what the widget draws stays out of it by construction:
 * there is no held-text walk to keep the drawing's glyphs out of the text,
 * because the text is the document, not the DOM.
 */

import { WidgetType } from '@codemirror/view'
import { drawWithAddress } from '../math.ts'

/**
 * A folded maths span drawn as the glyphs it means.
 *
 * The glyph map (`data-ccx-at` stamps) is written at draw time: a pointer on
 * the drawing is answered by reading an attribute rather than pairing the
 * expression again on every click.
 */
export class MathWidget extends WidgetType {
  /**
   * @param from - where the span begins in the document.
   * @param latex - the expression's source.
   * @param display - whether it asked to be display maths.
   * @param at - where the LaTeX begins in the document (the stamp base).
   */
  constructor(
    readonly from: number,
    readonly latex: string,
    readonly display: boolean,
    readonly at: number,
  ) {
    super()
  }

  override eq(other: MathWidget): boolean {
    return this.from === other.from && this.latex === other.latex
      && this.display === other.display && this.at === other.at
  }

  // The editor handles events inside the drawing: a press on a glyph is a
  // place in the source (the widget stamps carry it), not the widget's own.
  override ignoreEvent(): boolean {
    return false
  }

  override toDOM(): HTMLElement {
    const wrap = document.createElement('span')
    wrap.setAttribute('data-ccx-draw', '')
    wrap.setAttribute('data-ccx-atom', String(this.from))
    wrap.appendChild(drawWithAddress(this.latex, this.display, this.at))
    return wrap
  }
}

/**
 * What a folded link says beside itself: its title, drawn after its label.
 *
 * The title is unescaped at recognition (it was escaped to be written), so
 * this draws what it says, not what storing it took.
 */
export class NoteWidget extends WidgetType {
  /** @param text - the title the link carries. */
  constructor(readonly text: string) {
    super()
  }

  override eq(other: NoteWidget): boolean {
    return this.text === other.text
  }

  override ignoreEvent(): boolean {
    return false
  }

  override toDOM(): HTMLElement {
    const note = document.createElement('span')
    note.className = 'ccx-md-note'
    note.textContent = this.text
    return note
  }
}

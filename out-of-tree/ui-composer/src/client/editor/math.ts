/**
 * Maths in the composer: the engine that draws an expression, and the way back from what it drew
 * to what it says.
 *
 * A folded object is normally drawn out of its own source -- a link shows its label, which is text
 * the writer typed -- so the caret's place inside it needs no working out. Maths draws glyphs
 * nobody typed, and a click on one has to be answered with an offset into the LaTeX behind it.
 *
 * KaTeX records no source offsets, and its HTML output carries the glyph characters as ordinary
 * text -- which is exactly why the held-text walk (see `text.ts`) skips `data-ccx-draw` subtrees
 * rather than whole atoms: the hidden source stays in the held text, the drawing stays out of it.
 *
 * Order first, because the order a drawing offers is not the source's. Document order is a layout
 * order (`x_1^2` stacks both scripts on one base, and the vlist rows run top-to-bottom), and KaTeX
 * structures it per node kind in ways this port does not enumerate -- the reference wrote the
 * permutations for its engine's tree, and the honest adaptation of its error posture is to leave
 * the ordering unwritten: a glyph out of order matches nothing and falls back to its gap rather
 * than claiming somebody else's character. The alignment (below) still anchors every glyph the
 * source order and the layout order agree about.
 *
 * The two orders are ALIGNED on the characters they agree about -- the longest run of pairs neither
 * side has to go backwards for. Both sides hold things the other lacks: a `\pi` draws a `π` no
 * character stands for, and a command may write characters nothing draws. Taking each glyph in
 * turn and giving up on a mismatch answers the first and STALLS on the second; an alignment answers
 * both alike, and needs no rule about which characters a renderer swallows.
 *
 * A glyph left unpaired takes the start of the gap it sits in -- just past the last character
 * claimed, whitespace skipped -- which is where the command that drew it is written.
 *
 * Every glyph therefore has somewhere to send a caret, and where this can be wrong it is wrong by a
 * character or two inside the one expression. It fails by placing fewer anchors and never by
 * placing one where the expression does not say.
 */

import katex from 'katex'

/** Where an anchor is written, read back by whatever asks what the glyph under a pointer says. */
export const AT = 'data-ccx-at'

/**
 * Typeset one expression with KaTeX, over the same engine and stylesheet the message renderer
 * ships.
 *
 * `output: 'html'` drops the MathML arm (a second copy of the source, as text, that the layout
 * would show twice); errors render as the source in KaTeX's own error colouring, which is still a
 * run of glyph spans and still map-able.
 * @param latex - the expression's LaTeX source.
 * @param display - whether it asked to be display maths.
 */
export function typeset(latex: string, display: boolean): Element {
  const html = katex.renderToString(latex, {
    displayMode: display,
    output: 'html',
    throwOnError: false,
    strict: false,
  })
  const made = new DOMParser().parseFromString(html, 'text/html')
  const drawn = made.querySelector('.katex')
  if (drawn !== null) return drawn
  // KaTeX answered with no `.katex` root at all: fall back to the parsed body rather than drawing
  // nothing, since a folded object that draws nothing would take itself off the screen while
  // leaving itself in the message.
  return made.body
}

/**
 * Every character of a LaTeX source that stands for a glyph, and where it sits.
 *
 * An environment's name, a command, an escaped character, the structure that arranges glyphs
 * without being one, a run of space, or an ordinary character -- only the last alternative can
 * stand for a glyph, which is what keeps the `a` inside `\alpha` from being read as an `a` the
 * writer put there. `\begin{pmatrix}` needs its own alternative for the same reason, `\begin` and
 * `\end` being the two commands in LaTeX whose braced argument names something rather than saying
 * it.
 *
 * An escaped character is where its backslash is: the caret belongs at the start of what the writer
 * would edit, and `\{` is two characters holding one glyph.
 */
const TOKEN = /\\(?:begin|end)\s*\{[^{}]*\}|\\[a-zA-Z]+|\\(.)|([{}^_&~])|(\s)|([\s\S])/g

/** One source character that stands for a glyph, and where it sits. */
interface Printing { ch: string; at: number; width: number }

/** The glyph characters a LaTeX source writes, in the order and at the places it writes them. */
export function printing(latex: string): Printing[] {
  const found: Printing[] = []
  TOKEN.lastIndex = 0
  for (let read = TOKEN.exec(latex); read !== null; read = TOKEN.exec(latex)) {
    const ch = read[1] ?? read[4]
    if (ch !== undefined) found.push({ ch, at: read.index, width: read[0].length })
  }
  return found
}

/**
 * The character a KaTeX leaf span draws, in the alphabet the source is written in.
 *
 * A glyph's character is the text it carries, and for a letter KaTeX draws its mathematical form
 * (`1D44E`, the mathematical italic `a`) where the writer typed the ASCII one. Compatibility
 * decomposition is exactly the relation between the two, so the whole Mathematical Alphanumeric
 * block folds back with no table to keep, while `+`, `π` and `√` are left as themselves. A value
 * that folds to more than one character is left unmatched, since no single place in the source
 * stands for it.
 */
const draws = (text: string): string | null => {
  const folded = text.normalize('NFKD')
  return [...folded].length === 1 ? folded : null
}

/** One glyph as drawn: the element carrying it and the single character it says. */
export interface Glyph { el: Element; ch: string }

/**
 * Every glyph a drawn expression draws as a single character in one element, in document order.
 *
 * A span carrying several characters (a run the layout kept together) is skipped whole: an anchor
 * for a run has no single place to send a caret, and this fails by placing fewer anchors, never by
 * placing one the expression does not say.
 */
export function glyphs(drawn: Element): Glyph[] {
  const found: Glyph[] = []
  const walker = drawn.ownerDocument.createTreeWalker(drawn, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const value = node.nodeValue ?? ''
    const parent = node.parentElement
    if (parent !== null && value.length === 1) found.push({ el: parent, ch: value })
  }
  return found
}

/**
 * Which offset of the source each glyph draws, given the characters the layout drew in its own
 * order.
 * @param latex - the expression's source.
 * @param chars - one character per glyph, in the layout's order.
 * @returns one source offset per glyph; unpaired glyphs take the gap they sit in.
 */
export const anchored = (latex: string, chars: readonly string[]): number[] => {
  const tokens = printing(latex)
  const drawn = chars.map(draws)

  const glyphCount = drawn.length
  const tokenCount = tokens.length

  // Whether a glyph and a character are the same one, which is all a pair is ever made of.
  const same = (nth: number, kth: number): boolean =>
    drawn[nth] !== null && drawn[nth] === tokens[kth]?.ch

  // How long a run of pairs is still reachable from each position of the two orders, filled from
  // the far end so the walk after it can take the pair that keeps the most.
  const reach: number[][] = Array.from({ length: glyphCount + 1 }, () => new Array(tokenCount + 1).fill(0))
  for (let nth = glyphCount - 1; nth >= 0; nth--) {
    for (let kth = tokenCount - 1; kth >= 0; kth--) {
      reach[nth]![kth] = same(nth, kth)
        ? reach[nth + 1]![kth + 1]! + 1
        : Math.max(reach[nth + 1]![kth]!, reach[nth]![kth + 1]!)
    }
  }

  // Which character each glyph was paired with, or -1 where the source holds none for it.
  const paired: number[] = new Array(glyphCount).fill(-1)
  for (let nth = 0, kth = 0; nth < glyphCount && kth < tokenCount;) {
    if (same(nth, kth) && reach[nth]![kth] === reach[nth + 1]![kth + 1]! + 1) paired[nth++] = kth++
    else if (reach[nth + 1]![kth]! >= reach[nth]![kth + 1]!) nth++
    else kth++
  }

  let gap = 0
  return paired.map((kth) => {
    if (kth >= 0) {
      const token = tokens[kth]!
      gap = token.at + token.width
      return token.at
    }
    while (gap < latex.length && /\s/.test(latex[gap] ?? '')) gap++
    return gap
  })
}

/**
 * Write onto each glyph of a drawn expression the offset of the source it draws.
 *
 * Done once, where the expression is built, so that answering a pointer later is reading an
 * attribute rather than pairing an expression again on every click.
 *
 * What is written is an offset into the text the composer holds, not into the LaTeX -- whoever
 * reads it off a glyph has a pointer and no idea which expression it landed in, so an offset it
 * would have to be told the origin of answers a question nobody there can ask.
 * @param latex - the expression's source.
 * @param drawn - what the typesetter returned.
 * @param base - where the LaTeX begins in the text the composer holds.
 */
export const address = (latex: string, drawn: Element, base: number): void => {
  const written = glyphs(drawn)
  const at = anchored(latex, written.map((one) => one.ch))

  for (const [nth, glyph] of written.entries()) glyph.el.setAttribute(AT, String(base + (at[nth] ?? 0)))
}

/**
 * How to typeset an expression for a foldable's `draws`, with its glyph map written at build time.
 * @param latex - the expression's source.
 * @param display - whether it asked to be display maths.
 * @param at - where the expression's LaTeX begins in the text the composer holds.
 */
export const drawWithAddress = (latex: string, display: boolean, at: number): Element => {
  const drawn = typeset(latex, display)
  address(latex, drawn, at)
  return drawn
}

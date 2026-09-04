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

/** Where the glyph's source ends. A caret column between two glyphs lands at the nearer
 * BOUNDARY — a glyph's left edge is where its source starts, its right edge where that source
 * ends — so both edges carry their offset into the text the composer holds. */
export const END = 'data-ccx-end'

/** The caret stops of a LaTeX source, as one unit per command: `\\cmd` is one
 * giant character, so a position inside it never exists — the caret stands
 * before the whole command or after it. Whitespace and ordinary characters
 * stop everywhere they occur; the units are the grammar's own tokens, never
 * font metrics. */
const STOP_UNIT = /\\(?:begin|end)\s*\{[^{}]*\}|\\[a-zA-Z]+|\\.|[\s\S]/gy

/**
 * Every offset of a LaTeX source a caret may stand at, ascending: all of them
 * except the interiors of multi-character units (commands, `\begin{…}`
 * groups), which offer only their two edges.
 * @param latex - the expression's source.
 */
export function caretStops(latex: string): number[] {
  const inner = new Set<number>()
  STOP_UNIT.lastIndex = 0
  for (let read = STOP_UNIT.exec(latex); read !== null; read = STOP_UNIT.exec(latex)) {
    for (let i = read.index + 1; i < read.index + read[0].length; i++) inner.add(i)
  }
  const stops: number[] = []
  for (let i = 0; i <= latex.length; i++) if (!inner.has(i)) stops.push(i)
  return stops
}

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
  // KaTeX answered with no `.katex` root at all (some error renderings): wrap the
  // parsed body's CHILDREN in a span rather than returning the body element itself —
  // a body in the middle of an editable lays out as a block and shatters the line.
  // A folded object that draws nothing would take itself off the screen while
  // leaving itself in the message, so something is always drawn.
  const span = made.createElement('span')
  span.append(...made.body.childNodes)
  return span
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
 * order, and where that glyph's source run ENDS.
 * @param latex - the expression's source.
 * @param chars - one character per glyph, in the layout's order.
 * @param groups - the atom each glyph was drawn by (same index = one KaTeX
 *   atom, one source command), in the layout's order; omitted when unknown.
 * @returns one source start/end pair per glyph; unpaired glyphs take the gap they sit in.
 */
export const anchoredPairs = (
  latex: string,
  chars: readonly string[],
  groups?: readonly number[],
): { at: number; end: number }[] => {
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

  // The source positions a drawn character claimed: a gap is the stretch
  // between claims, closed only by what actually paired.
  const claimed: number[] = [...new Set(paired.filter((kth) => kth >= 0).map((kth) => tokens[kth]!.at))].sort((one, other) => one - other)
  let gap = 0
  interface Placed { at: number; end: number; gapFrom?: number; commands?: { start: number; end: number }[] }
  const placed = paired.map((kth): Placed => {
    if (kth >= 0) {
      const token = tokens[kth]!
      gap = token.at + token.width
      return { at: token.at, end: token.at + token.width }
    }
    while (gap < latex.length && /\s/.test(latex[gap] ?? '')) gap++
    // The glyph takes the gap it sits in: the stretch no CLAIMED character
    // owns, so a token nobody drew (the `;` of `\;` — its glyph is the blank
    // the engine renders as an mspace element) does not cut it. The final
    // span is settled below, once every glyph of the gap is known — commands
    // pair with the atoms that drew in order when they can.
    const next = claimed.find((at) => at >= gap)
    const from = gap
    const closes = next !== undefined ? next : latex.length
    const run = latex.slice(from, closes)
    const commands: { start: number; end: number }[] = []
    STOP_UNIT.lastIndex = 0
    for (let read = STOP_UNIT.exec(run); read !== null; read = STOP_UNIT.exec(run)) {
      if (read[0].startsWith('\\')) {
        commands.push({ start: from + read.index, end: from + read.index + read[0].length })
      }
    }
    return { at: commands.length > 0 ? commands[0]!.start : from, end: closes, gapFrom: from, commands }
  })

  // The gap each unpaired glyph fell in, by its start: its commands pair
  // with the distinct atoms that drew there, in order (the logo's letters own
  // `\LaTeX`, a `\;`'s blank owns itself, the operator's glyph owns `\sum`).
  // The engine inserts spacing atoms no source drew (an operator's surround);
  // these pair past the commands and own a zero-width span at the run's end,
  // where they visually sit.
  const gaps = new Map<number, { commands: { start: number; end: number }[]; atoms: number[][] }>()
  placed.forEach((one, nth) => {
    if (paired[nth]! >= 0 || one.commands === undefined) return
    const held = gaps.get(one.gapFrom!) ?? { commands: one.commands, atoms: [] }
    const atom = groups?.[nth] ?? 0
    if (!held.atoms.some((row) => row[0] === atom)) held.atoms.push([atom, nth])
    else held.atoms.find((row) => row[0] === atom)!.push(nth)
    gaps.set(one.gapFrom!, held)
  })
  for (const held of gaps.values()) {
    const owner = (nth: number): { at: number; end: number } => {
      const index = held.atoms.findIndex((row) => row.includes(nth))
      const command = index >= 0 ? held.commands[index] : undefined
      if (command !== undefined) return { at: command.start, end: command.end }
      const last = held.commands[held.commands.length - 1]
      if (last !== undefined) return { at: last.end, end: last.end }
      return { at: placed[nth]!.at, end: placed[nth]!.end }
    }
    for (const row of held.atoms) {
      // The row is [atom id, …glyph indices]: the id is a key, never a glyph.
      for (const nth of row.slice(1)) placed[nth] = owner(nth)
    }
  }
  return placed.map(({ at, end }) => ({ at, end }))
}

/**
 * Which offset of the source each glyph draws, given the characters the layout drew in its own
 * order.
 * @param latex - the expression's source.
 * @param chars - one character per glyph, in the layout's order.
 * @returns one source offset per glyph; unpaired glyphs take the gap they sit in.
 */
export const anchored = (latex: string, chars: readonly string[]): number[] =>
  anchoredPairs(latex, chars).map((pair) => pair.at)

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
  // The glyphs: the text the drawing carries, plus the BLANK ones — the
  // elements with no text but a bounding rect the engine renders directly
  // under the base (a `\;` is an `mspace`, a character of space exactly as
  // any other character is of ink). No kind is enumerated: whatever the
  // engine puts there with a box is a glyph.
  const written: Glyph[] = []
  const walk = drawn.ownerDocument.createTreeWalker(drawn, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT)
  for (let node = walk.nextNode(); node !== null; node = walk.nextNode()) {
    if (node.nodeType === 3 /* text */) {
      const value = node.nodeValue ?? ''
      if (value.length === 1) written.push({ el: node.parentElement as Element, ch: value })
    } else if (
      (node as Element).classList.contains('mspace')
      && (node as Element).parentElement?.classList.contains('base')
    ) {
      written.push({ el: node as Element, ch: ' ' })
    }
  }
  // The atom each glyph was drawn by: KaTeX renders one source atom per
  // direct child of `.base`, and glyphs may nest several atoms deep inside
  // it (a logo's kerned letters ride vlists), so the grouping climbs to the
  // OUTERMOST atom below the base — all of one atom's glyphs were drawn by
  // one command, which is the pairing the gap assignment rests on. A blank
  // glyph already IS that child.
  const ATOM = '.mord, .mop, .mbin, .mrel, .mopen, .mclose, .mpunct, .minner'
  const atomRoot = (from: Element): Element | null => {
    let atom = from.closest(ATOM)
    while (atom !== null) {
      const parent = atom.parentElement
      if (parent === null || parent.classList.contains('base')) break
      const up = parent.closest(ATOM)
      if (up === null) break
      atom = up
    }
    return atom
  }
  const atomOf = new Map<Element, number>()
  const groups = written.map((one) => {
    const atom = one.el.classList.contains('mspace') ? one.el : atomRoot(one.el) ?? one.el
    if (!atomOf.has(atom)) atomOf.set(atom, atomOf.size)
    return atomOf.get(atom)!
  })
  const at = anchoredPairs(latex, written.map((one) => one.ch), groups)

  for (const [nth, glyph] of written.entries()) {
    glyph.el.setAttribute(AT, String(base + (at[nth]?.at ?? 0)))
    glyph.el.setAttribute(END, String(base + (at[nth]?.end ?? 0)))
  }
}

/**
 * Split every multi-character text node of a drawing into one span per
 * character. KaTeX groups kerned neighbours into shared text runs, and an
 * anchor needs a single place: a run's characters offer no boundary of their
 * own, so the tail of `rulez` (`ez`) draws with no way in. Splitting changes
 * nothing about the layout — the kerns KaTeX expresses live on spans, not
 * inside text nodes — while every glyph becomes a node of its own, carrying
 * its own two edges.
 * @param drawn - the typesetter's output, modified in place.
 */
function splitGlyphRuns(drawn: Element): void {
  const walker = drawn.ownerDocument.createTreeWalker(drawn, NodeFilter.SHOW_TEXT)
  const runs: Text[] = []
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if ((node.nodeValue ?? '').length > 1) runs.push(node as Text)
  }
  for (const run of runs) {
    for (const ch of Array.from(run.nodeValue ?? '')) {
      const one = run.ownerDocument.createElement('span')
      one.textContent = ch
      run.parentNode?.insertBefore(one, run)
    }
    run.remove()
  }
}

/**
 * How to typeset an expression for a foldable's `draws`, with its glyph map written at build time.
 * @param latex - the expression's source.
 * @param display - whether it asked to be display maths.
 * @param at - where the expression's LaTeX begins in the text the composer holds.
 */
export const drawWithAddress = (latex: string, display: boolean, at: number): Element => {
  const drawn = typeset(latex, display)
  splitGlyphRuns(drawn)
  address(latex, drawn, at)
  return drawn
}

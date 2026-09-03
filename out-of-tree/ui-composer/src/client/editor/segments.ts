/**
 * The recognizers: the foldable objects a text holds, as the decoration
 * builder and the math engine consume them (see `Foldable` for the shape
 * every downstream thing works from).
 */

import { composerParser } from './lezer.ts'

/** A cursor into the parse tree, as much of one as anything here walks. */
export interface LezerNode {
  name: string
  from: number
  to: number
  firstChild: LezerNode | null
  nextSibling: LezerNode | null
}

/**
 * A foldable object: the ranges of it that are not drawn, what it draws where none of it is, and
 * what it says beside itself.
 *
 * What folding knows about a construct is only this shape -- where it begins and ends, which
 * stretches of it are syntax rather than reading, and what it has to say beside itself. Everything
 * downstream works from that: the drawing, the caret, the keys that enter and leave. A second kind
 * of foldable object is therefore a recogniser and nothing else, with no path of its own through
 * any of it.
 */
export interface Foldable {
  from: number
  to: number
  /** The stretches of the object that are syntax rather than reading. */
  hide: readonly (readonly [number, number])[]
  /** What the object says beside itself, shown outside the text it lives in. */
  note: string | null
  /** What the object draws where it has hidden all of its own text, held unbuilt until drawn. */
  draws: ((doc: Document) => Element) | null
}

/**
 * The links a text holds that folding understands, with the label each draws when folded.
 *
 * A label between the first two marks and a target after them is the shape this knows. Anything
 * else -- a reference-style link, one with nothing between its brackets, one still being written --
 * is not a thing to fold, and is left as the text it is.
 *
 * The title comes back unescaped, since it was escaped to be written: a title is quoted, so a quote
 * inside one is stored with a backslash in front of it that was never part of what anybody wrote.
 */
export function linksIn(src: string): { from: number; to: number; label: { from: number; to: number }; title: string | null }[] {
  const found: { from: number; to: number; label: { from: number; to: number }; title: string | null }[] = []

  const walk = (node: LezerNode): void => {
    for (let ch = node.firstChild; ch !== null; ch = ch.nextSibling) {
      if (ch.name === 'Link') {
        const marks: LezerNode[] = []
        let target = false
        let title: string | null = null
        for (let part = ch.firstChild; part !== null; part = part.nextSibling) {
          if (part.name === 'LinkMark') marks.push(part)
          else if (part.name === 'URL') target = true
          else if (part.name === 'LinkTitle') title = src.slice(part.from + 1, part.to - 1).replace(/\\(.)/g, '$1')
        }
        const opens = marks[0]
        const closes = marks[1]
        if (target && opens !== undefined && closes !== undefined && closes.from > opens.to) {
          found.push({ from: ch.from, to: ch.to, label: { from: opens.to, to: closes.from }, title })
        }
      }
      if (ch.firstChild !== null) walk(ch)
    }
  }

  walk(composerParser.parse(src).topNode as unknown as LezerNode)
  return found
}

/** Whether a span has nothing but whitespace either side of it on the line it sits on. */
export const alone = (src: string, from: number, to: number): boolean => {
  const opens = src.lastIndexOf('\n', from - 1) + 1
  const closes = src.indexOf('\n', to)
  return src.slice(opens, from).trim() === '' && src.slice(to, closes < 0 ? src.length : closes).trim() === ''
}

/**
 * Every maths span in a text, with the LaTeX it holds and how it wants to be laid out.
 *
 * A span whose content is blank is left alone. `$ $` is maths to the grammar and draws nothing, so
 * folding it would erase two characters from the screen that the message still carries.
 */
export function mathsIn(src: string): { from: number; to: number; at: number; latex: string; display: boolean }[] {
  const found: { from: number; to: number; at: number; latex: string; display: boolean }[] = []

  const walk = (node: LezerNode): void => {
    for (let ch = node.firstChild; ch !== null; ch = ch.nextSibling) {
      if (ch.name === 'InlineMath') {
        const width = (ch.firstChild?.to ?? ch.from + 1) - ch.from
        const at = ch.from + width
        const latex = src.slice(at, ch.to - width)
        if (latex.trim() !== '') {
          found.push({ from: ch.from, to: ch.to, at, latex, display: width > 1 && alone(src, ch.from, ch.to) })
        }
      }
      if (ch.firstChild !== null) walk(ch)
    }
  }

  walk(composerParser.parse(src).topNode as unknown as LezerNode)
  return found
}

/**
 * A link folds to its label: the brackets, the target and the title are syntax, the label is what
 * it says, and the title is what it says beside itself.
 */
const linksAsFoldables = (src: string): Foldable[] =>
  linksIn(src).map((link) => ({
    from: link.from,
    to: link.to,
    hide: [[link.from, link.label.from], [link.label.to, link.to]],
    note: link.title,
    draws: null,
  }))

/**
 * Maths folds to the glyphs it means: every character of it is syntax, so hiding the syntax hides
 * the whole span and there is no label left to stand as its face. What it draws comes from the
 * typesetter instead -- which is the one thing folding could not already express, and the reason
 * `Foldable` carries a surface rather than only a set of ranges.
 *
 * Nothing folds where there is no typesetter to draw with. Hiding an expression with nothing put in
 * its place would take it off the screen while leaving it in the message.
 */
const mathsAsFoldables = (src: string, draw: ((latex: string, display: boolean, at: number) => Element) | null): Foldable[] => {
  if (draw === null) return []
  return mathsIn(src).map((one) => ({
    from: one.from,
    to: one.to,
    hide: [[one.from, one.to]],
    note: null,
    draws: (doc: Document) => {
      const made = draw(one.latex, one.display, one.at)
      return made.ownerDocument === doc ? made : doc.importNode(made, true)
    },
  }))
}

/**
 * Every object in a text that folds, in the order they sit.
 * @param src - the full source text.
 * @param drawMath - how to typeset an expression, or null where KaTeX is not ready.
 */
export function foldablesIn(
  src: string,
  drawMath: ((latex: string, display: boolean, at: number) => Element) | null = null,
): Foldable[] {
  return [linksAsFoldables(src), mathsAsFoldables(src, drawMath)]
    .flat()
    .sort((a, b) => a.from - b.from)
}

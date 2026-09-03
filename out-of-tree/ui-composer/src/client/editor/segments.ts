/**
 * The tokenizer: source → styled runs, with `concat(segments.map(s => s.text)) === source` as the
 * invariant everything downstream rests on.
 *
 * Segmentation is computed PER CHARACTER so classes STACK: Lezer paints the closed/nested
 * constructs, then every dangling opener (one Lezer left unmarked) layers its class over the rest
 * of its line -- so a still-open `_**` italic-bolds a `` `code` `` that closed underneath it.
 *
 * A fenced block's body is coloured by `colorFor(lang, code)` -- a per-character colour array from
 * the syntax highlighter, or null when it is not (yet) available.
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
 * The text with the browser's own extra newline taken back.
 *
 * A line break the browser will not draw a line for is answered with TWO newlines, the second
 * standing in for that line -- at the end of the text, where nothing follows the break, and before
 * a folded object, which it will not draw one for either. Holding both means holding a line the
 * writer never made, and the composer draws the line itself.
 *
 * Which break was answered that way is not readable from the result: a break typed onto an empty
 * line leaves two newlines around the caret and means both of them. The caller measures it as it
 * happens and says where the stand-in is; this takes that one character back.
 * @param text - the raw held text.
 * @param at - the stand-in newline's offset, or -1 when the break was answered with one.
 */
export const uncompensated = (text: string, at: number): string =>
  at < 0 ? text : text.slice(0, at) + text.slice(at + 1)

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

const NODE_CLASS: Record<string, string | undefined> = {
  Emphasis: 'em',
  StrongEmphasis: 'strong',
  Strikethrough: 'strike',
  InlineCode: 'code',
  FencedCode: 'fence',
  Link: 'link',
  URL: 'url',
  LinkLabel: 'url',
  ATXHeading1: 'heading',
  ATXHeading2: 'heading',
  ATXHeading3: 'heading',
  ATXHeading4: 'heading',
  ATXHeading5: 'heading',
  ATXHeading6: 'heading',
}

const DELIMS: readonly (readonly [string, string])[] = [
  ['**', 'strong'],
  ['__', 'strong'],
  ['~~', 'strike'],
  ['*', 'em'],
  ['_', 'em'],
]

/** A run of source text and how it should look. */
export interface Segment {
  text: string
  classes: string[]
  /** Per-character highlight colour of a fenced body's characters. */
  color: string | null
  /** What an object says beside itself, rendered outside the text it lives in. */
  note: string | null
  /** The `from` of the folded object a character belongs to, so one object builds as one thing. */
  atom: number | null
  draws: ((doc: Document) => Element) | null
}

/**
 * Segment the source into styled runs.
 * @param src - the full source text.
 * @param drawMath - how to typeset an expression, or null where KaTeX is not ready.
 * @param colorFor - per-character colours for a fenced block's body, or null when unavailable.
 * @param open - where the one object shown as markdown begins, or -1 for none.
 */
export function segments(
  src: string,
  drawMath: ((latex: string, display: boolean, at: number) => Element) | null = null,
  colorFor: ((lang: string, code: string) => (string | null)[] | null) | null = null,
  open = -1,
): Segment[] {
  const n = src.length
  const cls: string[][] = Array.from({ length: n }, () => [])
  const mark: boolean[] = new Array(n).fill(false)
  const color: (string | null)[] = new Array(n).fill(null)
  const note: (string | null)[] = new Array(n).fill(null)
  // Hidden rides beside the marker flag rather than among the classes: a marker keeps no classes,
  // and a link's brackets are markers, so a class would be dropped from exactly the characters
  // folding exists to hide.
  const hide: boolean[] = new Array(n).fill(false)
  // Which folded object a character belongs to, so what is drawn as one thing is BUILT as one thing.
  const atom: (number | null)[] = new Array(n).fill(null)
  // How to draw an object that has hidden all of itself, held unbuilt: a redecoration asks for the
  // segments on every keystroke, where an object is drawn only when its run is actually rebuilt.
  const draws: (((doc: Document) => Element) | null)[] = new Array(n).fill(null)
  const fences: LezerNode[] = []
  const add = (i: number, c: string): void => {
    if (!cls[i]!.includes(c)) cls[i]!.push(c)
  }

  // Pass 1 -- Lezer: closed & nested constructs, with delimiter runs as markers.
  const walk = (node: LezerNode, stack: readonly string[]): void => {
    let pos = node.from
    for (let ch = node.firstChild; ch !== null; ch = ch.nextSibling) {
      for (let i = pos; i < ch.from; i++) for (const c of stack) add(i, c)
      if (ch.name.endsWith('Mark')) {
        for (let i = ch.from; i < ch.to; i++) mark[i] = true
      } else {
        if (ch.name === 'FencedCode') fences.push(ch)
        const c = NODE_CLASS[ch.name]
        const inner = c !== undefined ? [...stack, c] : stack
        if (ch.firstChild !== null) walk(ch, inner)
        else for (let i = ch.from; i < ch.to; i++) for (const cc of inner) add(i, cc)
      }
      pos = ch.to
    }
    for (let i = pos; i < node.to; i++) for (const c of stack) add(i, c)
  }
  walk(composerParser.parse(src).topNode as unknown as LezerNode, [])

  // Pass 1.7 -- foldable objects, drawn as themselves or opened as their markdown.
  //
  // An object is FOLDED unless it is the one being edited: the stretches of it that are syntax are
  // hidden, and what it says is what is left. Being open is STATE rather than a matter of where the
  // caret happens to be -- decided by the caret, the way OUT of an open object runs through the
  // whole of its syntax, which is a long walk to leave something by accident.
  for (const object of foldablesIn(src, drawMath)) {
    const folded = object.from !== open
    if (folded) {
      for (let i = object.from; i < object.to; i++) atom[i] = object.from
      for (const [from, to] of object.hide) for (let i = from; i < to; i++) hide[i] = true
      if (object.draws !== null) for (let i = object.from; i < object.to; i++) draws[i] = object.draws
    }

    if (object.note === null) continue
    let besideNote = object.to - 1
    if (folded) for (let i = object.from; i < object.to; i++) if (!hide[i]) besideNote = i
    note[besideNote] = object.note
  }

  // Pass 2 -- online: a dangling opener (Lezer left it unmarked) styles its tail to the end of its
  // line, on top of whatever is there. An emphasis opener must be LEFT-FLANKING: it starts a word
  // (whitespace, line-start, or an adjacent marker before it) and hugs the text after it -- which
  // rejects `2*3` and `snake_case` yet allows `**` right after the `_` in `_**x`. Code fences have
  // no flanking rule; there is no inline Markdown inside code.
  let base = 0
  for (const line of src.split('\n')) {
    const L = line.length
    for (let i = 0; i < L; i++) {
      const g = base + i
      if (mark[g] || ['code', 'fence', 'url', 'math', 'link'].some((c) => cls[g]!.includes(c))) continue
      // A `(` or `[` Lezer left plain right after a completed `[label]` (its `]` is a marked
      // LinkMark) can only open a link target -- a URL or a reference id -- so style its tail as a
      // path even before the closing `)`/`]`. A bare `[Z` (no completed label) is not here.
      if ((line[i] === '(' || line[i] === '[') && i > 0 && line[i - 1] === ']' && mark[base + i - 1]) {
        mark[g] = true
        for (let k = i + 1; k < L; k++) add(base + k, 'url')
        continue
      }
      const bt = /^`+/.exec(line.slice(i))
      if (bt !== null) {
        const ticks = bt[0]
        for (let k = 0; k < ticks.length; k++) mark[base + i + k] = true
        for (let k = i + ticks.length; k < L; k++) add(base + k, 'code')
        i += ticks.length - 1
        continue
      }
      for (const [d, c] of DELIMS) {
        if (!line.startsWith(d, i)) continue
        const boundary = i === 0 || /\s/.test(line[i - 1] ?? '') || mark[base + i - 1]
        const after = line[i + d.length]
        if (boundary && after !== undefined && !/\s/.test(after)) {
          for (let k = 0; k < d.length; k++) mark[base + i + k] = true
          for (let k = i + d.length; k < L; k++) add(base + k, c)
        }
        i += d.length - 1
        break
      }
    }
    base += L + 1
  }

  // Pass 3 -- fenced-code colours: hand each block's language and body to the highlighter and
  // paint the returned per-character colours onto the body.
  if (colorFor !== null) {
    for (const fc of fences) {
      let lang = ''
      let body: LezerNode | null = null
      for (let ch = fc.firstChild; ch !== null; ch = ch.nextSibling) {
        if (ch.name === 'CodeInfo') lang = src.slice(ch.from, ch.to)
        else if (ch.name === 'CodeText') body = ch
      }
      if (body === null) continue
      const colors = colorFor(lang, src.slice(body.from, body.to))
      if (colors !== null) {
        for (let j = 0; j < colors.length && body.from + j < n; j++) color[body.from + j] = colors[j] ?? null
      }
    }
  }

  // Coalesce runs of identical (marker | sorted class-set + colour) into segments.
  const out: Segment[] = []
  // A marker carries no classes and no colour, but it may still carry a name: a link's closing
  // bracket is a marker, and is where what the link points at is drawn.
  const key = (i: number): string =>
    (mark[i] ? '\x00' : cls[i]!.slice().sort().join(',') + '\x01' + (color[i] ?? '')) +
    '\x02' + (note[i] ?? '') +
    '\x03' + (hide[i] ? '1' : '') +
    '\x04' + (atom[i] ?? '')
  // A line break that an object follows is a run of its own. A line led by something the browser
  // will not edit into has no caret position at its start unless the break that opened it ends a
  // run there: left inside the run before it, an `ArrowUp` from that line passes over the line
  // above and lands at the start of the text.
  const opening = (i: number): boolean => src[i] === '\n' && i + 1 < n && atom[i + 1] !== null

  for (let i = 0; i < n;) {
    const k = key(i)
    let j = i + 1
    if (!opening(i)) while (j < n && key(j) === k && !opening(j)) j++
    const worn = mark[i] ? ['marker'] : cls[i]!.slice().sort()
    if (hide[i]) worn.push('folded')
    out.push({
      text: src.slice(i, j),
      classes: worn,
      color: mark[i] ? null : color[i] ?? null,
      note: note[i] ?? null,
      atom: atom[i] ?? null,
      draws: draws[i] ?? null,
    })
    i = j
  }
  return out
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

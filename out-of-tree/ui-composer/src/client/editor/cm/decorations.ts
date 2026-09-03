/**
 * The live decoration builder: source text → CodeMirror decoration ranges.
 *
 * The document is the source — every character the writer typed, in order,
 * always. Decorations are a VIEW of it, never a storage format: there is no
 * held-text walk, no stand-in compensation, no caret-affinity mapping, because
 * nothing but CodeMirror itself ever writes the buffer. Segmenting is computed
 * PER CHARACTER so classes STACK: the Lezer pass paints closed and nested
 * constructs, the online pass layers every dangling opener over the rest of
 * its line, and a fence's body is coloured by the shared highlighter.
 *
 * A foldable object the caret sits inside is drawn as its markdown source —
 * open is DERIVED from the selection on every rebuild, so an object that forms
 * around the caret is never folded to begin with, and one whose caret left it
 * folds again. What hides a folded object is a replace decoration; what it
 * draws instead is a widget.
 */

import { StateEffect, type Extension } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, ViewUpdate, type DecorationSet } from '@codemirror/view'
import type { Range } from '@codemirror/state'
import { composerParser } from '../lezer.ts'
import { linksIn, mathsIn, type LezerNode } from '../segments.ts'
import type { ColorFor } from '../highlight.ts'
import { MathWidget, NoteWidget } from './widget.ts'

/** Rebuild the decorations without a document or selection change — the
 * fence colours arriving after a lazy grammar loaded. */
const refreshEffect = StateEffect.define<void>()

/**
 * Ask a view for one off-schedule decoration rebuild.
 * @param view - the view whose fences rendered plain while a grammar loaded.
 */
export function requestColors(view: EditorView): void {
  view.dispatch({ effects: refreshEffect.of() })
}

/** What the builder needs besides the source. */
export interface DecorationInputs {
  /** Per-character colours for a fenced block's body, or null when unavailable. */
  colorFor: ColorFor | null
  /** The selection head: a foldable it sits inside (edges included) is drawn as its source. */
  head: number
}

/** The built ranges: what to draw, and which spans are atomic to the caret. */
export interface BuiltDecorations {
  decorations: DecorationSet
  /** The replace spans (folded objects), for `EditorView.atomicRanges`. */
  atoms: DecorationSet
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

/**
 * Build the live decorations for one source text.
 * @param src - the full source text (the document, verbatim).
 * @param inputs - the caret position and the fence-colour source.
 * @returns the decoration set to draw and the atomic spans the caret crosses whole.
 */
export function buildDecorations(src: string, inputs: DecorationInputs): BuiltDecorations {
  const n = src.length
  const cls: string[][] = Array.from({ length: n }, () => [])
  const mark: boolean[] = new Array(n).fill(false)
  const color: (string | null)[] = new Array(n).fill(null)
  // Replaced characters are skipped as RUN SOURCES (nothing of them is drawn as
  // text) but still take classes: a dangling opener's mark wraps the widget a
  // folded object draws, so its glyphs stack the modifier like the text would.
  const hidden: boolean[] = new Array(n).fill(false)
  const ranges: Range<Decoration>[] = []
  const atoms: Range<Decoration>[] = []
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

  // Pass 1.7 -- foldable objects. One the caret sits STRICTLY inside is
  // OPEN: its source stays the text, its delimiters dim as markers, nothing
  // is hidden. The edges are not inside -- a caret resting at one reads the
  // object as the folded thing it is, so a delete at an edge takes it whole.
  // Every other one folds: its syntax is replaced away, a maths span draws
  // its glyphs, a link keeps its label and says its title beside it.
  for (const link of linksIn(src)) {
    if (inputs.head > link.from && inputs.head < link.to) continue
    for (let i = link.from; i < link.label.from; i++) hidden[i] = true
    for (let i = link.label.to; i < link.to; i++) hidden[i] = true
    for (let i = link.label.from; i < link.label.to; i++) add(i, 'link')
    const bracket = Decoration.replace({})
    ranges.push(bracket.range(link.from, link.label.from))
    ranges.push(bracket.range(link.label.to, link.to))
    atoms.push(bracket.range(link.from, link.label.from))
    atoms.push(bracket.range(link.label.to, link.to))
    if (link.title !== null) {
      ranges.push(Decoration.widget({ widget: new NoteWidget(link.title), side: 1 }).range(link.label.to))
    }
  }
  for (const one of mathsIn(src)) {
    if (inputs.head > one.from && inputs.head < one.to) continue
    for (let i = one.from; i < one.to; i++) hidden[i] = true
    const widget = Decoration.replace({ widget: new MathWidget(one.from, one.latex, one.display, one.at) })
    ranges.push(widget.range(one.from, one.to))
    atoms.push(widget.range(one.from, one.to))
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
      if (mark[g] || ['code', 'fence', 'url', 'link'].some((c) => cls[g]!.includes(c))) continue
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
  if (inputs.colorFor !== null) {
    for (const fc of fences) {
      let lang = ''
      let body: LezerNode | null = null
      for (let ch = fc.firstChild; ch !== null; ch = ch.nextSibling) {
        if (ch.name === 'CodeInfo') lang = src.slice(ch.from, ch.to)
        else if (ch.name === 'CodeText') body = ch
      }
      if (body === null) continue
      const colors = inputs.colorFor(lang, src.slice(body.from, body.to))
      if (colors !== null) {
        for (let j = 0; j < colors.length && body.from + j < n; j++) color[body.from + j] = colors[j] ?? null
      }
    }
  }

  // Coalesce runs of identical (marker | sorted class-set + colour) into mark
  // decorations. Hidden characters keep their marks (a widget wraps in them);
  // a marker carries no classes and no colour.
  const key = (i: number): string =>
    (mark[i] ? '\x00' : cls[i]!.slice().sort().join(',') + '\x01' + (color[i] ?? ''))
  for (let i = 0; i < n;) {
    const k = key(i)
    let j = i + 1
    while (j < n && key(j) === k) j++
    const worn = mark[i] ? ['ccx-md-marker'] : cls[i]!.slice().sort().map((c) => `ccx-md-${c}`)
    const hue = mark[i] ? null : color[i] ?? null
    // A plain run wears nothing: no mark decoration, no empty class to query past.
    if (worn.length > 0 || hue !== null) {
      ranges.push(Decoration.mark({
        class: worn.join(' '),
        ...(hue !== null ? { attributes: { style: `color:${hue}` } } : {}),
      }).range(i, j))
    }
    i = j
  }

  return { decorations: Decoration.set(ranges, true), atoms: Decoration.set(atoms, true) }
}

/**
 * The decoration engine as an extension: rebuilds on document change, caret
 * move, or a colour arrival, and offers the folded spans as atomic ranges.
 * @param colorFor - the fence-colour source, or null while none is wanted.
 * @returns the extension.
 */
export function richDecorations(colorFor: ColorFor | null): Extension {
  return ViewPlugin.fromClass(
    class RichDecorations {
      decorations: DecorationSet = Decoration.none
      atoms: DecorationSet = Decoration.none
      constructor(view: EditorView) {
        this.build(view)
      }

      update(update: ViewUpdate): void {
        const refreshed = update.transactions.some((tr) => tr.effects.some((e) => e.is(refreshEffect)))
        if (!refreshed && !update.docChanged && !update.selectionSet) return
        this.build(update.view)
      }

      private build(view: EditorView): void {
        const built = buildDecorations(view.state.doc.toString(), {
          colorFor,
          head: view.state.selection.main.head,
        })
        this.decorations = built.decorations
        this.atoms = built.atoms
      }
    },
    {
      decorations: (plugin) => plugin.decorations,
      provide: (plugin) => EditorView.atomicRanges.of(
        (view) => view.plugin(plugin)?.atoms ?? Decoration.none,
      ),
    },
  )
}

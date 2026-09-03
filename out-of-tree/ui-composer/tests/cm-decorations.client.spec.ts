// @vitest-environment jsdom
/**
 * The decoration builder's rules: closed and nested constructs paint from the
 * parse tree, dangling openers style their line's tail (stacking — including
 * over a folded object's widget), the code contexts suppress every modifier
 * because the grammar (not a scan) says what is code, and a foldable the caret
 * sits inside is drawn as its markdown source.
 */

import { describe, expect, it } from 'vitest'
import type { Decoration, DecorationSet } from '@codemirror/view'
import { buildDecorations } from '../src/client/editor/cm/decorations.ts'
import { MathWidget, NoteWidget } from '../src/client/editor/cm/widget.ts'
import { linksIn, mathsIn } from '../src/client/editor/segments.ts'
import type { ColorFor } from '../src/client/editor/highlight.ts'

/** Build with no caret and no colours — the plain decoration of a text. */
const build = (src: string, head = -1, colorFor: ColorFor | null = null) =>
  buildDecorations(src, { head, colorFor })

/** One decoration range covering a position, flattened with its spec. */
interface At {
  from: number
  to: number
  spec: { class?: string; attributes?: { style?: string }; widget?: unknown }
}

/** Every decoration covering one position (a range ending there covers nothing past it). */
const at = (set: DecorationSet, pos: number): At[] => {
  const found: At[] = []
  for (let cursor = set.iter(pos); cursor.value !== null && cursor.from <= pos; cursor.next()) {
    if (cursor.to > pos) {
      found.push({ from: cursor.from, to: cursor.to, spec: (cursor.value as Decoration).spec as At['spec'] })
    }
  }
  return found
}

/** Every decoration class covering one position, split into names. */
const classesAt = (set: DecorationSet, pos: number): string[] =>
  at(set, pos).flatMap((one) => (one.spec.class !== undefined ? one.spec.class.split(' ') : []))
    .filter((name) => name !== '')

/** The style attribute covering one position, if any. */
const colorAt = (set: DecorationSet, pos: number): string | null =>
  at(set, pos).map((one) => one.spec.attributes?.style ?? null).find((one) => one !== null) ?? null

/** The replace (fold) covering one position, if any. */
const foldAt = (set: DecorationSet, pos: number): At | null =>
  at(set, pos).find((one) => one.spec.class === undefined) ?? null

/** The specs of every point decoration sitting exactly at one position. */
function* pointsAt(set: DecorationSet, pos: number): Generator<At['spec']> {
  for (let cursor = set.iter(pos); cursor.value !== null && cursor.from <= pos; cursor.next()) {
    if (cursor.from === pos && cursor.to === pos) {
      yield (cursor.value as Decoration).spec as At['spec']
    }
  }
}

describe('the decoration builder: marks', () => {
  it('paints a closed emphasis from the parse tree with its markers dimmed', () => {
    const { decorations } = build('a *em* b')
    expect(classesAt(decorations, 3)).toContain('ccx-md-em')
    expect(classesAt(decorations, 2)).toEqual(['ccx-md-marker'])
  })

  it('paints a dangling opener without the closer, live', () => {
    const { decorations } = build('start _open tail')
    expect(classesAt(decorations, 7)).toContain('ccx-md-em')
  })

  it('stacks modifiers: `_**x` is both italic and bold', () => {
    const { decorations } = build('_**x')
    expect(classesAt(decorations, 3)).toEqual(expect.arrayContaining(['ccx-md-em', 'ccx-md-strong']))
  })

  it('keeps modifier interpretation out of code, per the grammar', () => {
    const closed = build('a `code _span` b')
    expect(classesAt(closed.decorations, 3)).toContain('ccx-md-code')
    expect(classesAt(closed.decorations, 3)).not.toContain('ccx-md-em')
    // A dangling opener still styles a code span that closed underneath it.
    const stacked = build('_**x `code`')
    expect(classesAt(stacked.decorations, 6)).toEqual(expect.arrayContaining(['ccx-md-code', 'ccx-md-em', 'ccx-md-strong']))
  })

  it('rejects intra-word emphasis flanking: `2*3` and `snake_case` stay plain', () => {
    for (const src of ['2*3', 'snake_case']) {
      const { decorations } = build(src)
      for (let i = 0; i < src.length; i++) {
        expect(classesAt(decorations, i)).not.toContain('ccx-md-em')
      }
    }
  })

  it('leaves plain text undecorated over a deliberately messy document', () => {
    const src = '# Head\n\n_start **bold `tick` tail\n\n$\\frac{a}{b}$ and [link](/x "t")\n```\nfence\n```'
    const { decorations } = build(src)
    // The `#` is a dimmed marker; the heading text wears the heading class.
    expect(classesAt(decorations, 0)).toEqual(['ccx-md-marker'])
    expect(classesAt(decorations, 2)).toContain('ccx-md-heading')
    // It computes over the whole document without throwing.
    expect(build(src)).toBeDefined()
  })

  it('paints fence bodies per character from the highlighter, coalescing runs', () => {
    const colorFor: ColorFor = (_lang, code) => code.split('').map((one) => (one === 'x' ? '#f00' : null))
    const { decorations } = build('```js\nx = 1\n```', -1, colorFor)
    expect(colorAt(decorations, 6)).toBe('color:#f00')
    expect(colorAt(decorations, 8)).toBeNull()
  })
})

describe('the decoration builder: folds', () => {
  it('folds maths into a widget that carries its source and stamp base', () => {
    const { decorations, atoms } = build('a $x^2$ b')
    const fold = foldAt(decorations, 3)
    expect(fold).not.toBeNull()
    expect(fold?.from).toBe(2)
    expect(fold?.to).toBe(7)
    expect(fold?.spec.widget).toBeInstanceOf(MathWidget)
    expect((fold?.spec.widget as MathWidget).latex).toBe('x^2')
    expect((fold?.spec.widget as MathWidget).at).toBe(3)
    // The same span is atomic: the caret crosses it whole.
    const atom = atoms.iter(2)
    expect(atom.from).toBe(2)
    expect(atom.to).toBe(7)
  })

  it('stacks a dangling opener\'s mark over a folded maths span', () => {
    const { decorations } = build('a _$x$ b')
    expect(foldAt(decorations, 4)).not.toBeNull()
    expect(classesAt(decorations, 4)).toContain('ccx-md-em')
  })

  it('draws the object the caret sits inside as its markdown source', () => {
    const open = build('a $x^2$ b', 4)
    expect(foldAt(open.decorations, 3)).toBeNull()
    expect(classesAt(open.decorations, 2)).toEqual(['ccx-md-marker'])
    expect(classesAt(open.decorations, 3)).toEqual([])
    // The same text with no caret folds.
    expect(foldAt(build('a $x^2$ b').decorations, 3)).not.toBeNull()
  })

  it('folds a link to its label, hiding its syntax and saying its title beside it', () => {
    const src = '[label](/target "the title")'
    const { decorations } = build(src)
    expect(foldAt(decorations, 0)?.from).toBe(0) // the `[`
    expect(foldAt(decorations, 7)?.to).toBe(src.length) // the `](/target "the title")`
    expect(classesAt(decorations, 1)).toContain('ccx-md-link')
    // The note is a point decoration at the label's end.
    const note = [...pointsAt(decorations, 6)].map((spec) => spec)
      .find((spec) => spec.widget instanceof NoteWidget)
    expect((note?.widget as NoteWidget | undefined)?.text).toBe('the title')
  })
})

describe('the recognizers', () => {
  it('reads remark-math dollar runs: wrong-width runs close nothing', () => {
    const maths = mathsIn('$$x$$ text $y$')
    expect(maths.map((one) => one.latex)).toEqual(['x', 'y'])
    expect(maths[0]?.from).toBe(0)
    expect(maths[0]?.to).toBe(5)
  })

  it('degrades backslash-delimited maths to plain text where the escape rule wins', () => {
    expect(mathsIn('inline \\(a+b\\) here')).toEqual([])
  })

  it('leaves blank maths unfolded: `$ $` draws nothing and erasing it would hide the text', () => {
    expect(mathsIn('$ $')).toEqual([])
    expect(mathsIn('$$  $$')).toEqual([])
  })

  it('tells display maths from an inline span by its own line', () => {
    expect(mathsIn('$$x$$')[0]?.display).toBe(true)
    expect(mathsIn('say $$x$$ now')[0]?.display).toBe(false)
  })

  it('leaves a `$` inside a code span or fence alone, because the grammar consumed the span', () => {
    expect(mathsIn('a `$x$` b')).toEqual([])
    expect(mathsIn('```\n$x$\n```')).toEqual([])
  })

  it('leaves an escaped dollar alone', () => {
    expect(mathsIn('price \\$5 and \\$6')).toEqual([])
  })

  it('reads a link\'s label and unescapes its title', () => {
    const links = linksIn('[label](/target "the \\"title")')
    expect(links[0]?.label).toEqual({ from: 1, to: 6 })
    expect(links[0]?.title).toBe('the "title')
  })
})

// @vitest-environment jsdom
/**
 * The tokenizer's rules: the source comes back verbatim out of any segmentation, closed and nested
 * constructs paint from the parse tree, dangling openers style their line's tail (stacking), and
 * the code contexts suppress every modifier -- because the grammar, not a scan, says what is code.
 */

import { describe, expect, it } from 'vitest'
import { segments, foldablesIn, mathsIn, linksIn, uncompensated } from '../src/client/editor/segments.ts'

/** The text all segments join back into. */
const joined = (src: string, drawMath: Parameters<typeof segments>[1] = null): string =>
  segments(src, drawMath).map((seg) => seg.text).join('')

describe('segments', () => {
  it('returns the source verbatim out of any segmentation', () => {
    const sources = [
      '',
      'plain text',
      '_open italic',
      '**bold open',
      '_**stacked open and `code` too',
      'closed *em* and **strong** and ~~strike~~',
      'a `code span` with _ignored_ markers',
      '```ts\nconst x = 1\n```\nafter',
      'math $x^2 + 1$ and display $$\\sqrt{2}$$ inline',
      '[a link](https://example.com "the title") mid-text',
      '$$alone$$\n$not_alone$ x $$also_not$$',
      'multi\nline\ndraft',
      '$$x$$ text $$y$$',
    ]
    for (const src of sources) expect(joined(src)).toBe(src)
  })

  it('keeps the invariant over a deliberately messy document', () => {
    const src = '# Head\n\n_start **bold `tick` tail\n\n$\\frac{a}{b}$ and [link](/x "t")\n```\nfence\n```'
    expect(joined(src)).toBe(src)
  })

  it('paints a closed emphasis from the parse tree with its markers dimmed', () => {
    const segs = segments('a *em* b')
    const em = segs.find((seg) => seg.classes.includes('em'))
    expect(em?.text).toBe('em')
    const marker = segs.find((seg) => seg.classes.includes('marker'))
    expect(marker?.text).toBe('*')
  })

  it('paints a dangling opener without the closer, live', () => {
    const segs = segments('start _open tail')
    const em = segs.find((seg) => seg.classes.includes('em'))
    expect(em?.text).toBe('open tail')
  })

  it('stacks modifiers: `_**x` is both italic and bold', () => {
    const segs = segments('_**x')
    const stacked = segs.find((seg) => seg.classes.includes('em'))
    expect(stacked?.classes).toContain('strong')
    expect(stacked?.text).toBe('x')
  })

  it('keeps modifier interpretation out of code, per the grammar', () => {
    // A completed code span: the underscore inside is not an opener.
    const closed = segments('a `code _span` b')
    expect(closed.find((seg) => seg.text === 'code _span')?.classes).toContain('code')
    expect(closed.find((seg) => seg.text === 'code _span')?.classes).not.toContain('em')
    // A dangling opener still styles a code span that closed underneath it.
    const stacked = segments('_**x `code`')
    const code = stacked.find((seg) => seg.classes.includes('code'))
    expect(code?.text).toBe('code')
    expect(code?.classes).toContain('em')
    expect(code?.classes).toContain('strong')
    // Inline maths inside the stack: the `$` is a marked construct, not an opener's tail.
    const math = joined('_**$x$')
    expect(math).toBe('_**$x$')
  })

  it('rejects intra-word emphasis flanking: `2*3` and `snake_case` stay plain', () => {
    for (const src of ['2*3', 'snake_case']) {
      const segs = segments(src)
      expect(segs.find((seg) => seg.classes.includes('em'))).toBeUndefined()
    }
  })

  it('reads remark-math dollar runs: wrong-width runs close nothing', () => {
    const maths = mathsIn('$$x$$ text $y$')
    expect(maths.map((one) => one.latex)).toEqual(['x', 'y'])
    // The outer dollars of `$$x$$` are one span, not `$` around `$x$`.
    expect(maths[0]?.from).toBe(0)
    expect(maths[0]?.to).toBe(5)
  })

  it('degrades backslash-delimited maths to plain text where the escape rule wins', () => {
    // Wherever the built-in escape rule takes `\\(` before the math parser is asked, the
    // characters stay the escaped punctuation they are to CommonMark -- degraded to plain text,
    // never lost. The dollar rule is the delimiter the composer relies on.
    const src = 'inline \\(a+b\\) here'
    expect(mathsIn(src)).toEqual([])
    expect(joined(src)).toBe(src)
  })

  it('leaves blank maths unfolded: `$ $` draws nothing and erasing it would hide the text', () => {
    expect(mathsIn('$ $')).toEqual([])
    expect(mathsIn('$$  $$')).toEqual([])
  })

  it('tells display maths from an inline span by its own line', () => {
    const alone = mathsIn('$$x$$')
    expect(alone[0]?.display).toBe(true)
    const inline = mathsIn('say $$x$$ now')
    expect(inline[0]?.display).toBe(false)
  })

  it('leaves a `$` inside a code span or fence alone, because the grammar consumed the span', () => {
    expect(mathsIn('a `$x$` b')).toEqual([])
    expect(mathsIn('```\n$x$\n```')).toEqual([])
  })

  it('leaves an escaped dollar alone', () => {
    expect(mathsIn('price \\$5 and \\$6')).toEqual([])
  })

  it('draws folded maths through the typesetter and marks the fold', () => {
    const draw = (latex: string, display: boolean, at: number): Element => {
      const span = document.createElement('span')
      span.setAttribute('data-drawn', `${latex}@${display}@${at}`)
      return span
    }
    const objects = foldablesIn('a $x^2$ b', draw)
    const math = objects.find((object) => object.from === 2)
    expect(math?.hide).toEqual([[2, 7]])
    expect(math?.draws?.(document).getAttribute('data-drawn')).toBe('x^2@false@3')
    // No typesetter, no fold: hiding with nothing in its place takes the text off the screen.
    expect(foldablesIn('a $x^2$ b', null).find((object) => object.from === 2)).toBeUndefined()
  })

  it('folds a link to its label and says its title beside itself', () => {
    const links = linksIn('[label](/target "the title")')
    expect(links[0]?.label).toEqual({ from: 1, to: 6 })
    const objects = foldablesIn('[label](/target "the title")')
    const link = objects[0]
    expect(link?.hide).toEqual([[0, 1], [6, 28]])
    expect(link?.note).toBe('the title')
  })

  it('uncompensates exactly the one stand-in newline', () => {
    expect(uncompensated('a\n\nb', 1)).toBe('a\nb')
    expect(uncompensated('a\nb', -1)).toBe('a\nb')
  })

  it('ends a run of segments where a folded object leads the next line', () => {
    // The line break before a line-led object must end its own run, or a vertical move from that
    // line has nowhere to start.
    const src = 'up\n$x$'
    const draw = (latex: string, display: boolean, at: number): Element => {
      void display; void at
      const span = document.createElement('span')
      span.textContent = latex
      return span
    }
    const segs = segments(src, draw)
    const br = segs.find((seg) => seg.text === '\n')
    expect(br).toBeDefined()
  })
})

// @vitest-environment jsdom
/**
 * The way back from what maths draws to what it says: the source tokenizer's token rules, the LCS
 * alignment's pairing tables, and the anchors written onto real KaTeX output.
 *
 * The error posture under test: the alignment fails by placing fewer anchors, never by placing one
 * where the expression does not say.
 */

import { describe, expect, it } from 'vitest'
import { anchored, anchoredPairs, address, caretStops, printing, typeset, glyphs, drawWithAddress } from '../src/client/editor/math.ts'
import { foldablesIn } from '../src/client/editor/segments.ts'

describe('printing', () => {
  it('keeps command names from standing for their letters', () => {
    const tokens = printing('\\alpha')
    expect(tokens).toEqual([])
  })

  it('anchors an escaped character at its backslash', () => {
    const tokens = printing('\\{')
    expect(tokens).toEqual([{ ch: '{', at: 0, width: 2 }])
  })

  it('treats an environment name as one named thing, not its letters', () => {
    expect(printing('\\begin{pmatrix}')).toEqual([])
  })

  it('reads ordinary characters at their own places', () => {
    const tokens = printing('x_1^2')
    expect(tokens).toEqual([
      { ch: 'x', at: 0, width: 1 },
      { ch: '1', at: 2, width: 1 },
      { ch: '2', at: 4, width: 1 },
    ])
  })
})

describe('anchored', () => {
  it('pairs in order when both sides agree', () => {
    expect(anchored('x+1', ['x', '+', '1'])).toEqual([0, 1, 2])
  })

  it('answers a drawn glyph no character stands for with its gap', () => {
    // `\pi` draws `π`; the pair lands where the command is written.
    expect(anchored('\\pi', ['π'])).toEqual([0])
  })

  it('answers a written character nothing draws by not stalling', () => {
    // `\sqrt[3]{x}`: the `[` and `]` are written, nothing draws them, and the alignment still
    // reaches the x -- the greedy walk this replaces stalled on exactly this case.
    const at = anchored('\\sqrt[3]{x}', ['3', 'x', '√'])
    expect(at).toHaveLength(3)
    // The x is paired at its own place; every glyph lands somewhere inside the expression.
    for (const one of at) {
      expect(one).toBeGreaterThanOrEqual(0)
      expect(one).toBeLessThanOrEqual('\\sqrt[3]{x}'.length)
    }
  })

  it('pairs source-order glyphs at their own characters', () => {
    const at = anchored('x_1^2', ['x', '1', '2'])
    expect(at).toEqual([0, 2, 4])
  })

  it('never claims a second occurrence the source does not point at', () => {
    // `aa` with one glyph drawn `a`: the glyph takes the first, and nothing else is placed.
    expect(anchored('aa', ['a'])).toEqual([0])
  })

  it('answers an empty drawing with nothing', () => {
    expect(anchored('x', [])).toEqual([])
  })
})

describe('address over real KaTeX', () => {
  it('stamps every mapped glyph with an offset into the held text', () => {
    const latex = 'e^{i\\pi} + 1 = 0'
    const drawn = typeset(latex, false)
    address(latex, drawn, 10)
    const written = glyphs(drawn)
    expect(written.length).toBeGreaterThan(0)
    for (const glyph of written) {
      const at = Number(glyph.el.getAttribute('data-ccx-at'))
      expect(Number.isInteger(at)).toBe(true)
      expect(at).toBeGreaterThanOrEqual(10)
      expect(at).toBeLessThanOrEqual(10 + latex.length)
    }
    // The base is baked in: whoever reads it off a glyph has a pointer into the composer text.
    const baseOffsets = written.map((glyph) => Number(glyph.el.getAttribute('data-ccx-at')))
    expect(Math.min(...baseOffsets)).toBeGreaterThanOrEqual(10)
  })

  it('anchors the e of e^{i\\pi} at its own source character through a foldable draw', () => {
    const src = 'a $e^{i\\pi}$ b'
    const objects = foldablesIn(src, drawWithAddress)
    const math = objects[0]
    const drawn = math?.draws?.(document)
    expect(drawn).not.toBeNull()
    const written = glyphs(drawn!)
    const eGlyph = written.find((glyph) => glyph.ch === 'e')
    expect(eGlyph?.el.getAttribute('data-ccx-at')).toBe('3')
  })

  it('keeps the drawing importable into the consuming document', () => {
    const objects = foldablesIn('$x$', drawWithAddress)
    const imported = objects[0]?.draws?.(document)
    expect(imported?.ownerDocument).toBe(document)
    expect(glyphs(imported!).length).toBeGreaterThan(0)
  })
})

describe('anchoredPairs', () => {
  it('answers a command glyph with the whole command as its span', () => {
    expect(anchoredPairs('\\pi', ['π'])).toEqual([{ at: 0, end: 3 }])
  })

  it('owns only the command in its gap, never the structure around it', () => {
    // `}^{` and `{` are nobody's ink: the glyph `\infty` draws carries the
    // command's own characters, so its edges land inside the gap.
    expect(anchoredPairs('}^{\\infty}{', ['∞'])).toEqual([{ at: 3, end: 9 }])
  })

  it('pairs a gap\'s atoms with its drawing commands: each glyph owns the command that drew it', () => {
    // One gap holds `\LaTeX`, `\;`, and `\sum` (the `x` pairs, closing the
    // gap); the logo's letters form one atom, the `\;`'s blank another, the
    // operator's glyph a third — three atoms, three commands, pairwise.
    expect(anchoredPairs(' \\LaTeX \\; \\sum_{x', ['L', 'A', 'T', 'E', 'X', ' ', '∑', 'x'], [0, 0, 0, 0, 0, 1, 2, 3])).toEqual([
      { at: 1, end: 7 }, { at: 1, end: 7 }, { at: 1, end: 7 }, { at: 1, end: 7 }, { at: 1, end: 7 },
      { at: 8, end: 10 },
      { at: 11, end: 15 },
      { at: 17, end: 18 },
    ])
  })

  it('answers an ordinary glyph with the one character it draws', () => {
    expect(anchoredPairs('x+1', ['x', '+', '1'])).toEqual([
      { at: 0, end: 1 },
      { at: 1, end: 2 },
      { at: 2, end: 3 },
    ])
  })
})

describe('caretStops', () => {
  it('treats a command as one giant character: only its two edges exist', () => {
    expect(caretStops('\\;')).toEqual([0, 2])
    expect(caretStops('\\LaTeX')).toEqual([0, 6])
  })

  it('stops everywhere whitespace and ordinary characters occur', () => {
    expect(caretStops('a b')).toEqual([0, 1, 2, 3])
    expect(caretStops(' \\LaTeX \\; rulez \\;\\;\\; ')).toEqual([
      0, 1, 7, 8, 10, 11, 12, 13, 14, 15, 16, 17, 19, 21, 23, 24,
    ])
  })
})

describe('the error rendering', () => {
  it('never returns a body: the drawing stays inline', () => {
    // Error-mode KaTeX output has no `.katex` root, taking the fallback path.
    const drawn = typeset('](#test2 "', false)
    expect(drawn.tagName).toBe('SPAN')
    expect(drawn.querySelector('.katex-error')).not.toBeNull()
  })

  it('stamps both boundaries of every glyph: where its source starts and ends', () => {
    const latex = 'x+1'
    const drawn = typeset(latex, false)
    address(latex, drawn, 10)
    const written = glyphs(drawn)
    expect(written.length).toBeGreaterThan(0)
    for (const glyph of written) {
      expect(Number(glyph.el.getAttribute('data-ccx-at'))).toBeLessThan(Number(glyph.el.getAttribute('data-ccx-end')))
    }
  })
})

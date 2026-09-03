/**
 * The composer's live markdown grammar: @lezer/markdown with a math extension and a
 * strikethrough extension.
 *
 * Lezer only recognises COMPLETE constructs, so a thin partial pass over the runs it leaves plain
 * styles the unclosed opener being typed (see `segments`' online pass) -- but the exclusions this
 * file implements live in the GRAMMAR, not in any scan: a `$` inside a code span or a fence is
 * never reached, because the construct holding it consumes the whole span before this is asked, and
 * a `\$` is taken by the escape rule for the same reason. Neither appears below, and neither can be
 * forgotten there.
 *
 * The math delimiter rule is remark-math's, where the message is rendered -- a run of dollars opens
 * and a run of the same width closes it -- so what folds here and what is drawn there are the same
 * spans, rather than two readings that agree most of the time.
 *
 * GFM tables and task lists are deliberately absent (the `@lezer/gfm` package being unreachable
 * from this deployment's registry mirror): a typed table decorates as plain text, which is a
 * rendering mismatch and not a loss -- the source is untouched either way.
 */

import { parser, type MarkdownConfig } from '@lezer/markdown'

const DOLLAR = 36

/**
 * Maths, as a construct the parser recognises rather than a scan over the text.
 *
 * A run of dollars opens and a run of the same width closes it; skipping a wrong-width run whole is
 * what stops `$$x$$` from being read as `$` around `$x$`. The backslash-delimited `\(…\)` and
 * `\[…\]` forms are answered here too: wherever this parser is asked about the backslash before the
 * escape rule takes it, the span reads as math, and wherever it is not, the characters stay the
 * escaped punctuation they are to CommonMark -- degraded to plain text, never lost.
 */
const MATH: MarkdownConfig = {
  defineNodes: [
    { name: 'InlineMath' },
    { name: 'InlineMathMark' },
  ],
  parseInline: [{
    name: 'InlineMath',

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- @lezer/markdown's InlineParser hands untyped contexts
    parse(cx: any, next: number, pos: number): number {
      if (next === DOLLAR) return dollarSpan(cx, pos)
      if (next === 92 /* '\\' */) return backslashSpan(cx, pos)
      return -1
    },
  }],
}

/** The remark-math dollar rule: a run of width `w` closes against a run of the same width. */
function dollarSpan(cx: any, pos: number): number {
  let open = pos
  while (cx.char(open) === DOLLAR) open++
  const width = open - pos

  for (let at = open; at < cx.end; at++) {
    if (cx.char(at) !== DOLLAR) continue
    let close = at
    while (cx.char(close) === DOLLAR) close++
    // A run of the wrong width closes nothing, and skipping past the whole of it is what stops
    // `$$x$$` from being read as `$` around `$x$`.
    if (close - at !== width) {
      at = close - 1
      continue
    }
    return cx.addElement(cx.elt('InlineMath', pos, close, [
      cx.elt('InlineMathMark', pos, open),
      cx.elt('InlineMathMark', at, close),
    ]))
  }
  return -1
}

/** The `\(`/`\[` rule: a two-character opener closes at the matching two-character closer. */
function backslashSpan(cx: any, pos: number): number {
  const opener = cx.char(pos + 1)
  if (opener !== 40 /* '(' */ && opener !== 91 /* '[' */) return -1
  const closer = opener === 40 ? 41 /* ')' */ : 93 /* ']'' */

  for (let at = pos + 2; at + 1 < cx.end; at++) {
    if (cx.char(at) !== 92 || cx.char(at + 1) !== closer) continue
    return cx.addElement(cx.elt('InlineMath', pos, at + 2, [
      cx.elt('InlineMathMark', pos, pos + 2),
      cx.elt('InlineMathMark', at, at + 2),
    ]))
  }
  return -1
}

const TILDE = 126

/**
 * GFM strikethrough: a `~~` run opens and closes, as the reference grammar defines it.
 *
 * `after: 'Escape'` keeps `x~~y` from reading as a span when the escape rule wanted the tildes;
 * the ordering is the same deference the math extension's backslash form lacks.
 */
const STRIKETHROUGH: MarkdownConfig = {
  defineNodes: [
    { name: 'Strikethrough' },
    { name: 'StrikethroughMark' },
  ],
  parseInline: [{
    name: 'Strikethrough',
    after: 'Escape',

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- @lezer/markdown's InlineParser hands untyped contexts
    parse(cx: any, next: number, pos: number): number {
      if (next !== TILDE || cx.char(pos + 1) !== TILDE) return -1
      return cx.addDelimiter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the delimiter type is unexported
        { resolve: 'StrikethroughMark' } as any, pos, pos + 2, true, true,
      )
    },
  }],
}

/**
 * The composer's parse function: CommonMark plus GFM strikethrough plus math.
 * @returns the configured parser; `parse(src).topNode` is the positioned tree everything here walks.
 */
export const composerParser = parser.configure([MATH, STRIKETHROUGH])

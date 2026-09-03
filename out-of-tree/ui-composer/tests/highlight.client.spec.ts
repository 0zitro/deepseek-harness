// @vitest-environment jsdom
/**
 * The fence-colour adapter: the per-line runs the shared highlighter answers
 * become one colour per character, each run starting where the one before it
 * ended — never all from the line's start, where a long run's colour would
 * swallow every shorter one before it.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  supportsHighlighting: () => true,
  subscribeGrammarLoaded: () => () => {},
  // Two lines of runs with distinct lengths and colours, shaped exactly as
  // the css-variables theme answers (every run carries a --shiki-* colour).
  highlightLines: () => [
    [
      { text: 'const', style: { color: 'var(--kw)' } },
      { text: ' x = ', style: { color: 'var(--fg)' } },
      { text: '1', style: { color: 'var(--num)' } },
    ],
    [
      { text: '// done', style: { color: 'var(--cmt)' } },
    ],
  ],
}))

import { createColorFor } from '../src/client/editor/highlight.ts'

describe('the fence-colour adapter', () => {
  it('paints each run at its own offset, left to right', () => {
    const colors = createColorFor()('ts', 'const x = 1\n// done\n')
    expect(colors).toEqual([
      // 'const' then ' x = ' then '1', each at its place.
      'var(--kw)', 'var(--kw)', 'var(--kw)', 'var(--kw)', 'var(--kw)',
      'var(--fg)', 'var(--fg)', 'var(--fg)', 'var(--fg)', 'var(--fg)',
      'var(--num)',
      null, // the newline the runs did not cover
      'var(--cmt)', 'var(--cmt)', 'var(--cmt)', 'var(--cmt)', 'var(--cmt)', 'var(--cmt)', 'var(--cmt)',
      null, // the trailing newline
    ])
  })
})

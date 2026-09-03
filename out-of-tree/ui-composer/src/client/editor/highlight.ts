/**
 * Fenced-code colours from the shared Shiki singleton, as the per-character colour array the
 * segmenter paints onto a fence's body.
 *
 * The reference asked a host VSCode for TM grammars over a message bus; here the client ships its
 * own synchronously-initialized Shiki core with an explicit grammar allowlist (the message
 * renderer's singleton -- one highlighter, one grammar set, one theme), so a miss is a lazy
 * grammar load rather than a round-trip. Stale-while-revalidate keeps an edited fence from
 * blanking between the keystroke and the fresh highlight.
 */

import {
  highlightLines, subscribeGrammarLoaded, supportsHighlighting,
  type HighlightSpan,
} from '@deepseek-ai/dsh-client-ui-primitives'

/** Per-character colours aligned to `code`, one entry per character, newlines included. */
export type ColorFor = (lang: string, code: string) => (string | null)[] | null

/** The colour adapter, cache included, handed to the decoration as its `colorFor`.
 * @param onInvalidate - called when a lazy grammar finished loading and every fence rendered plain
 *   for it must re-paint. */
export function createColorFor(onInvalidate?: () => void): ColorFor {
  const cache = new Map<string, (string | null)[]>()
  const lastByLang = new Map<string, (string | null)[]>()
  let subscribed = false

  const ensureSubscription = (): void => {
    if (subscribed) return
    subscribed = true
    // A lazy grammar finished loading: everything rendered plain for that language re-paints.
    subscribeGrammarLoaded(() => {
      cache.clear()
      onInvalidate?.()
    })
  }

  return (lang, code) => {
    if (lang === '' || code.length === 0 || !supportsHighlighting(lang)) return null
    ensureSubscription()

    const key = `${lang}\x00${code}`
    const cached = cache.get(key)
    if (cached !== undefined) {
      lastByLang.set(lang, cached)
      return cached
    }

    const colors = colorsOf(lang, code)
    cache.set(key, colors)
    if (colors.some((one) => one !== null)) lastByLang.set(lang, colors)
    return colors
  }
}

/** Flatten the per-line run answer into one colour per character of `code`. */
function colorsOf(lang: string, code: string): (string | null)[] {
  const lines = highlightLines(code, lang)
  if (lines === undefined) return new Array(code.length).fill(null)

  const colors: (string | null)[] = new Array(code.length).fill(null)
  let at = 0
  for (const spans of lines) {
    // Runs are laid left to right within their line: each starts where the
    // one before it ended. Painting them all from the line's start would let
    // the last long run's colour swallow every shorter one before it.
    let column = at
    for (const span of spans) {
      colorsOfRun(colors, column, span)
      column += span.text.length
    }
    // Runs never span a line break, so the newline separating one source line from the next is
    // the characters the line's runs did not cover: advance past them.
    const covered = column - at
    const lineEnd = code.indexOf('\n', at)
    const lineLength = lineEnd === -1 ? code.length - at : lineEnd - at + 1
    at += Math.max(covered, lineLength)
  }
  return colors
}

/** Paint one run's colour onto its characters. */
function colorsOfRun(colors: (string | null)[], base: number, span: HighlightSpan): void {
  const color = typeof span.style.color === 'string' ? span.style.color : null
  for (let i = 0; i < span.text.length && base + i < colors.length; i++) colors[base + i] = color
}

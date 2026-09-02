import { describe, expect, it } from 'vitest'
import { advanceChord, ChordMatcher, isChord, matchStart } from '../src/chord.ts'
import type { Keybinding, KeyStroke } from '../src/keybinding.ts'

const ENTER: KeyStroke = { key: 'Enter', modifiers: [] }
const CTRL_K: KeyStroke = { key: 'k', modifiers: ['ctrl'] }
const CTRL_S: KeyStroke = { key: 's', modifiers: ['ctrl'] }

function gesture(
  key: string,
  modifiers: Partial<Record<'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey', boolean>> = {},
) {
  return { key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...modifiers }
}

const SIMPLE_SEND: Keybinding = { strokes: [ENTER] }
const CHORD_SAVE: Keybinding = { strokes: [CTRL_K, CTRL_S] }
const ALWAYS = () => true

describe('advanceChord', () => {
  it('advances on a matching stroke', () => {
    expect(advanceChord({ binding: CHORD_SAVE, next: 0 }, gesture('k', { ctrlKey: true })))
      .toEqual({ kind: 'advance', progress: { binding: CHORD_SAVE, next: 1 } })
  })

  it('completes on the final stroke', () => {
    expect(advanceChord({ binding: CHORD_SAVE, next: 1 }, gesture('s', { ctrlKey: true })))
      .toEqual({ kind: 'complete', binding: CHORD_SAVE })
  })

  it('resets on a mismatching stroke', () => {
    expect(advanceChord({ binding: CHORD_SAVE, next: 1 }, gesture('x', { ctrlKey: true })))
      .toEqual({ kind: 'reset' })
  })
})

describe('matchStart', () => {
  it('fires a simple binding immediately', () => {
    expect(matchStart([SIMPLE_SEND], gesture('Enter'), ALWAYS))
      .toEqual({ kind: 'simple', binding: SIMPLE_SEND })
  })

  it('starts a chord on its first stroke', () => {
    expect(matchStart([CHORD_SAVE], gesture('k', { ctrlKey: true }), ALWAYS))
      .toEqual({ kind: 'chord', progress: { binding: CHORD_SAVE, next: 1 } })
  })

  it('skips inactive bindings', () => {
    expect(matchStart([CHORD_SAVE], gesture('k', { ctrlKey: true }), () => false))
      .toEqual({ kind: 'none' })
  })
})

describe('ChordMatcher', () => {
  it('completes a chord across two feeds', () => {
    const matcher = new ChordMatcher([SIMPLE_SEND, CHORD_SAVE], ALWAYS)
    expect(matcher.feed(gesture('k', { ctrlKey: true }))).toBeNull()
    expect(matcher.progress).toEqual({ binding: CHORD_SAVE, next: 1 })
    expect(matcher.feed(gesture('s', { ctrlKey: true }))).toBe(CHORD_SAVE)
    expect(matcher.progress).toBeNull()
  })

  it('fires a simple binding without pending state', () => {
    const matcher = new ChordMatcher([SIMPLE_SEND], ALWAYS)
    expect(matcher.feed(gesture('Enter'))).toBe(SIMPLE_SEND)
    expect(matcher.progress).toBeNull()
  })

  it('resets and restarts on a mismatching stroke', () => {
    const matcher = new ChordMatcher([SIMPLE_SEND, CHORD_SAVE], ALWAYS)
    matcher.feed(gesture('k', { ctrlKey: true }))
    expect(matcher.feed(gesture('Enter'))).toBe(SIMPLE_SEND)
    expect(matcher.progress).toBeNull()
  })

  it('cancel drops a pending chord', () => {
    const matcher = new ChordMatcher([CHORD_SAVE], ALWAYS)
    matcher.feed(gesture('k', { ctrlKey: true }))
    matcher.cancel()
    expect(matcher.progress).toBeNull()
  })

  it('advances through a three-stroke chord', () => {
    const binding: Keybinding = { strokes: [CTRL_K, CTRL_S, CTRL_K] }
    const matcher = new ChordMatcher([binding], ALWAYS)
    expect(matcher.feed(gesture('k', { ctrlKey: true }))).toBeNull()
    expect(matcher.feed(gesture('s', { ctrlKey: true }))).toBeNull()
    expect(matcher.progress).toEqual({ binding, next: 2 })
    expect(matcher.feed(gesture('k', { ctrlKey: true }))).toBe(binding)
  })

  it('returns null when no binding matches', () => {
    const matcher = new ChordMatcher([SIMPLE_SEND], ALWAYS)
    expect(matcher.feed(gesture('z'))).toBeNull()
    expect(matcher.progress).toBeNull()
  })
})

describe('isChord', () => {
  it('is false for one stroke and true for two', () => {
    expect(isChord([ENTER])).toBe(false)
    expect(isChord([CTRL_K, CTRL_S])).toBe(true)
  })
})

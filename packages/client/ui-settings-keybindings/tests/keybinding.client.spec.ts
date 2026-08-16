import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SEND_KEYBINDING, KEYBINDING_MODIFIER_LABELS, KEYBINDING_MODIFIERS,
  KeybindingSchema, KeyStrokeSchema, isRecordableKey, keybindingKeyLabel,
  keybindingLabels, modifiersOf, normalizeEventKey, strokeFromEvent, strokeLabels,
  strokeMatches,
} from '../src/keybinding.ts'
import type { KeyGesture } from '../src/keybinding.ts'

function gesture(
  key: string,
  modifiers: Partial<Record<'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey', boolean>> = {},
): KeyGesture {
  return { key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...modifiers }
}

describe('modifiersOf', () => {
  it('returns held modifiers in canonical order', () => {
    expect(modifiersOf(gesture('a', { shiftKey: true, ctrlKey: true }))).toEqual(['ctrl', 'shift'])
    expect(modifiersOf(gesture('a', { metaKey: true, altKey: true }))).toEqual(['meta', 'alt'])
    expect(modifiersOf(gesture('a'))).toEqual([])
  })

  it('reads a modifier via getModifierState when the boolean flag is false', () => {
    expect(modifiersOf({
      key: 'k', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false,
      getModifierState: modifier => modifier === 'Alt',
    })).toEqual(['alt'])
  })
})

describe('normalizeEventKey', () => {
  it('lowercases single printable characters', () => {
    expect(normalizeEventKey('A')).toBe('a')
    expect(normalizeEventKey('a')).toBe('a')
  })

  it('keeps named keys and space verbatim', () => {
    expect(normalizeEventKey('Enter')).toBe('Enter')
    expect(normalizeEventKey(' ')).toBe(' ')
    expect(normalizeEventKey('ArrowUp')).toBe('ArrowUp')
  })
})

describe('isRecordableKey', () => {
  it('rejects lone modifiers and lock keys', () => {
    for (const key of ['Control', 'Shift', 'Alt', 'Meta', 'CapsLock', 'Fn', 'Dead', 'Unidentified']) {
      expect(isRecordableKey(key)).toBe(false)
    }
  })

  it('accepts real keys', () => {
    expect(isRecordableKey('a')).toBe(true)
    expect(isRecordableKey('Enter')).toBe(true)
    expect(isRecordableKey(' ')).toBe(true)
  })
})

describe('strokeFromEvent', () => {
  it('records a key with its modifiers, normalizing case', () => {
    expect(strokeFromEvent(gesture('A', { ctrlKey: true }))).toEqual({ key: 'a', modifiers: ['ctrl'] })
  })

  it('returns null for a lone modifier', () => {
    expect(strokeFromEvent(gesture('Control', { ctrlKey: true }))).toBeNull()
  })
})

describe('strokeMatches', () => {
  it('matches the exact stroke', () => {
    expect(strokeMatches(gesture('Enter'), { key: 'Enter', modifiers: [] })).toBe(true)
    expect(strokeMatches(gesture('k', { ctrlKey: true }), { key: 'k', modifiers: ['ctrl'] })).toBe(true)
  })

  it('is case-insensitive on the key', () => {
    expect(strokeMatches(gesture('A'), { key: 'a', modifiers: [] })).toBe(true)
  })

  it('rejects a different key', () => {
    expect(strokeMatches(gesture('x'), { key: 'Enter', modifiers: [] })).toBe(false)
  })

  it('rejects an extra held modifier', () => {
    expect(strokeMatches(gesture('Enter', { altKey: true }), { key: 'Enter', modifiers: [] })).toBe(false)
  })

  it('rejects a missing modifier', () => {
    expect(strokeMatches(gesture('Enter'), { key: 'Enter', modifiers: ['ctrl'] })).toBe(false)
  })
})

describe('labels', () => {
  it('formats space, letters, and named keys', () => {
    expect(keybindingKeyLabel(' ')).toBe('Space')
    expect(keybindingKeyLabel('a')).toBe('A')
    expect(keybindingKeyLabel('Enter')).toBe('Enter')
  })

  it('orders modifiers before the key per stroke', () => {
    expect(strokeLabels({ key: 'Enter', modifiers: ['ctrl', 'shift'] })).toEqual(['Ctrl', 'Shift', 'Enter'])
  })

  it('returns one chip row per stroke', () => {
    expect(keybindingLabels({ strokes: [{ key: 'k', modifiers: ['ctrl'] }, { key: 's', modifiers: ['ctrl'] }] }))
      .toEqual([['Ctrl', 'K'], ['Ctrl', 'S']])
  })
})

describe('constants and schema', () => {
  it('has four canonical modifiers with labels', () => {
    expect(KEYBINDING_MODIFIERS).toEqual(['ctrl', 'meta', 'alt', 'shift'])
    expect(KEYBINDING_MODIFIER_LABELS).toEqual({ ctrl: 'Ctrl', meta: 'Meta', alt: 'Alt', shift: 'Shift' })
  })

  it('defaults the send binding to a single Enter stroke', () => {
    expect(DEFAULT_SEND_KEYBINDING).toEqual({ strokes: [{ key: 'Enter', modifiers: [] }] })
  })

  it('parses a stroke and a binding', () => {
    expect(KeyStrokeSchema({ key: 'a', modifiers: ['ctrl'] })).toEqual({ key: 'a', modifiers: ['ctrl'] })
    expect(KeybindingSchema({ strokes: [{ key: 'a', modifiers: ['ctrl'] }], when: 'agentBusy' }))
      .toEqual({ strokes: [{ key: 'a', modifiers: ['ctrl'] }], when: 'agentBusy' })
  })
})

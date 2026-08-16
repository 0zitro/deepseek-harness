import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SEND_KEYBINDING, KEYBINDING_MODIFIER_LABELS, KEYBINDING_MODIFIERS,
  KeybindingSchema, isRecordableKey, keybindingFromEvent, keybindingKeyLabel,
  keybindingLabels, keybindingMatches, modifiersOf, normalizeEventKey,
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

describe('keybindingFromEvent', () => {
  it('records a key with its modifiers, normalizing case', () => {
    expect(keybindingFromEvent(gesture('A', { ctrlKey: true }))).toEqual({ key: 'a', modifiers: ['ctrl'] })
  })

  it('returns null for a lone modifier', () => {
    expect(keybindingFromEvent(gesture('Control', { ctrlKey: true }))).toBeNull()
  })
})

describe('keybindingMatches', () => {
  it('matches the exact binding', () => {
    expect(keybindingMatches(gesture('Enter'), { key: 'Enter', modifiers: [] })).toBe(true)
    expect(keybindingMatches(gesture('k', { ctrlKey: true }), { key: 'k', modifiers: ['ctrl'] })).toBe(true)
  })

  it('is case-insensitive on the key', () => {
    expect(keybindingMatches(gesture('A'), { key: 'a', modifiers: [] })).toBe(true)
  })

  it('rejects a different key', () => {
    expect(keybindingMatches(gesture('x'), { key: 'Enter', modifiers: [] })).toBe(false)
  })

  it('rejects an extra held modifier', () => {
    expect(keybindingMatches(gesture('Enter', { altKey: true }), { key: 'Enter', modifiers: [] })).toBe(false)
  })

  it('rejects a missing modifier', () => {
    expect(keybindingMatches(gesture('Enter'), { key: 'Enter', modifiers: ['ctrl'] })).toBe(false)
  })
})

describe('labels', () => {
  it('formats space, letters, and named keys for kbd chips', () => {
    expect(keybindingKeyLabel(' ')).toBe('Space')
    expect(keybindingKeyLabel('a')).toBe('A')
    expect(keybindingKeyLabel('Enter')).toBe('Enter')
  })

  it('orders modifiers before the key', () => {
    expect(keybindingLabels({ key: 'Enter', modifiers: ['ctrl', 'shift'] })).toEqual(['Ctrl', 'Shift', 'Enter'])
  })
})

describe('constants and schema', () => {
  it('has four canonical modifiers with labels', () => {
    expect(KEYBINDING_MODIFIERS).toEqual(['ctrl', 'meta', 'alt', 'shift'])
    expect(KEYBINDING_MODIFIER_LABELS).toEqual({ ctrl: 'Ctrl', meta: 'Meta', alt: 'Alt', shift: 'Shift' })
  })

  it('defaults the send binding to Enter', () => {
    expect(DEFAULT_SEND_KEYBINDING).toEqual({ key: 'Enter', modifiers: [] })
  })

  it('parses a valid binding', () => {
    expect(KeybindingSchema({ key: 'a', modifiers: ['ctrl'] })).toEqual({ key: 'a', modifiers: ['ctrl'] })
  })
})

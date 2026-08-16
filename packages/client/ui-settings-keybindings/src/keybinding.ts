/**
 * Simple keybindings: one non-modifier key plus an optional modifier set.
 *
 * Deliberately narrower than an editor binding system — no chords, no context
 * predicates, no `when` clauses. A binding either matches a single physical
 * key gesture exactly, or it does not. Keeping the persisted form, the
 * recorder, and the matcher one shared model makes every layer trivially
 * auditable: the settings document stores what the recorder captured, and the
 * consumer matches what was stored.
 */
import z from '@deepseek-ai/schemastery'

/** Modifier keys a binding may hold, in canonical (sorted) order. */
export const KEYBINDING_MODIFIERS = ['ctrl', 'meta', 'alt', 'shift'] as const

/** One modifier key name. */
export type KeybindingModifier = (typeof KEYBINDING_MODIFIERS)[number]

/**
 * KeyboardEvent.key values that never form a binding of their own — lone
 * modifiers, lock keys, and values the platform could not resolve.
 */
const IGNORED_KEYS = new Set([
  'Control', 'Meta', 'Alt', 'Shift', 'AltGraph', 'CapsLock', 'NumLock',
  'ScrollLock', 'Fn', 'FnLock', 'Hyper', 'Super', 'Unidentified', 'Dead',
])

/** A single simple keybinding: exactly one key plus an optional modifier set. */
export interface Keybinding {
  /** Normalized key value as reported by `KeyboardEvent.key`. */
  key: string
  /** Held modifiers in canonical order, no duplicates. */
  modifiers: KeybindingModifier[]
}

/** The structural shape a live keyboard event must satisfy to be matched. */
export interface KeyGesture {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
}

/** Held modifiers of a live keyboard event, in canonical order. */
export function modifiersOf(event: KeyGesture): KeybindingModifier[] {
  const result: KeybindingModifier[] = []
  if (event.ctrlKey) result.push('ctrl')
  if (event.metaKey) result.push('meta')
  if (event.altKey) result.push('alt')
  if (event.shiftKey) result.push('shift')
  return result
}

/** Whether a keydown is a recording target (a single real key, not a lone modifier). */
export function isRecordableKey(key: string): boolean {
  return !IGNORED_KEYS.has(key)
}

/**
 * Canonical persisted key value. Single printable characters normalize to
 * lowercase so a letter records the same way whether Shift was held during
 * capture; named keys ('Enter', 'Escape', ' ', 'ArrowUp', …) keep their
 * `KeyboardEvent.key` spelling verbatim.
 */
export function normalizeEventKey(key: string): string {
  return key.length === 1 ? key.toLowerCase() : key
}

/** Build a binding from a live keyboard event, or null when it is not recordable. */
export function keybindingFromEvent(event: KeyGesture): Keybinding | null {
  if (!isRecordableKey(event.key)) return null
  return { key: normalizeEventKey(event.key), modifiers: modifiersOf(event) }
}

/**
 * Whether a live keyboard event matches a binding exactly. Matching is
 * modifier-exact: holding an extra, unbound modifier (Alt on a Ctrl+Enter
 * binding) does not fire the binding — a simple binding means one gesture,
 * not a prefix.
 */
export function keybindingMatches(event: KeyGesture, binding: Keybinding): boolean {
  if (event.key.toLowerCase() !== binding.key.toLowerCase()) return false
  const held = modifiersOf(event)
  return held.length === binding.modifiers.length
    && binding.modifiers.every(modifier => held.includes(modifier))
}

/** Human label for one modifier key (platform-neutral text). */
export const KEYBINDING_MODIFIER_LABELS: Record<KeybindingModifier, string> = {
  ctrl: 'Ctrl',
  meta: 'Meta',
  alt: 'Alt',
  shift: 'Shift',
}

/** Human label for the binding's key chip. */
export function keybindingKeyLabel(key: string): string {
  if (key === ' ') return 'Space'
  if (key.length === 1) return key.toUpperCase()
  return key
}

/** Ordered chip labels for rendering a binding as `<kbd>` elements. */
export function keybindingLabels(binding: Keybinding): string[] {
  return [
    ...binding.modifiers.map(modifier => KEYBINDING_MODIFIER_LABELS[modifier]),
    keybindingKeyLabel(binding.key),
  ]
}

/** Schemastery schema for one binding, persisted verbatim in the settings document. */
export const KeybindingSchema: z<Keybinding> = z.object({
  key: z.string(),
  modifiers: z.array(z.union([...KEYBINDING_MODIFIERS])),
})

/** The composer's default send gesture. */
export const DEFAULT_SEND_KEYBINDING: Keybinding = { key: 'Enter', modifiers: [] }

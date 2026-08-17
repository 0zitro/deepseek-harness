/**
 * Keybindings: ordered key strokes plus an optional activation predicate.
 *
 * A binding is a sequence of one or more strokes — one stroke is a simple
 * binding, two or more form a chord such as `Ctrl+K Ctrl+S`. Each stroke is
 * one non-modifier key plus an optional modifier set; matching is
 * modifier-exact, so a bound `Ctrl+Enter` does not fire while `Alt` is also
 * held. An optional `when` clause (see when-clause.ts) gates activation
 * against UI state.
 */
import z from '@deepseek-ai/schemastery'
import type { Branded } from '@deepseek-ai/dsh-brand'
import { UiActionIdSchema, type UiActionId } from './ui-action.ts'

/** Modifier keys a stroke may hold, in canonical (sorted) order. */
export const KEYBINDING_MODIFIERS = ['ctrl', 'meta', 'alt', 'shift'] as const

/** One modifier key name. */
export type KeybindingModifier = (typeof KEYBINDING_MODIFIERS)[number]

/**
 * KeyboardEvent.key values that never form a stroke of their own — lone
 * modifiers, lock keys, and values the platform could not resolve.
 */
const IGNORED_KEYS = new Set([
  'Control', 'Meta', 'Alt', 'Shift', 'AltGraph', 'CapsLock', 'NumLock',
  'ScrollLock', 'Fn', 'FnLock', 'Hyper', 'Super', 'Unidentified', 'Dead',
])

/** One physical key press: a key plus its held modifiers. */
export interface KeyStroke {
  /** Normalized key value as reported by `KeyboardEvent.key`. */
  key: string
  /** Held modifiers in canonical order, no duplicates. */
  modifiers: KeybindingModifier[]
}

/** A keybinding: an ordered stroke sequence plus an optional activation predicate. */
export interface Keybinding {
  /** Ordered strokes; one stroke is a simple binding, two or more is a chord. */
  strokes: KeyStroke[]
  /** Optional `when` clause; absence means the binding is always active. */
  when?: string
}

/** A plugin's stable identifier. */
export type PluginId = Branded<'PluginId'>

/** Cast a plugin's stable identifier to the branded PluginId. */
export function pluginId(id: string): PluginId {
  return id as PluginId
}

/** Where a keybinding came from: the shipped default, the user, or a plugin id. */
export type KeybindingSource = 'system' | 'user' | PluginId

/** A persisted keybinding entry: one binding gesture bound to one UI action. */
export interface KeybindingEntry extends Keybinding {
  /** The action this binding invokes. */
  action: UiActionId
  /** Collision-ordering; 0 is highest. Absent = seeded by registration order within its (stroke, source). */
  prio?: number
  /** Where this binding came from. */
  source: KeybindingSource
}

/** A default binding's stable identity, independent of its mutable gesture. */
export type KeybindingKey = Branded<'KeybindingKey'>

/** Cast a stable identifier to the branded KeybindingKey. */
export function keybindingKey(id: string): KeybindingKey {
  return id as KeybindingKey
}

/** A shipped default binding: the gesture plus the stable key an override merges into. */
export type KeybindingDefault = Keybinding & { readonly key: KeybindingKey }

/**
 * A partial override of one default binding. `action`, `source`, and `key`
 * identify the default it merges into; `base` snapshots that default's gesture
 * so the override still resolves when the origin is unavailable; `strokes`,
 * `when`, and `prio` are the overridden fields — absent ones fall back to the
 * base at merge time.
 */
export interface KeybindingOverride {
  action: UiActionId
  source: KeybindingSource
  key: KeybindingKey
  base: Keybinding
  strokes?: KeyStroke[]
  when?: string
  prio?: number
}

/** Identifies the override an edit addresses, independently of what it carries. */
export type KeybindingOverrideRef = Pick<KeybindingOverride, 'action' | 'source' | 'key'>

/**
 * One edit of an override: the fields the user just changed, and nothing else.
 * A field absent here stays absent from the override and keeps inheriting from
 * the base, so a later change to the default still reaches the merged binding.
 */
export type KeybindingEdit = Partial<Pick<KeybindingOverride, 'strokes' | 'when' | 'prio'>>

/** Whether two stroke sequences are the same gesture, modifier order aside. */
export function sameStrokes(left: readonly KeyStroke[], right: readonly KeyStroke[]): boolean {
  if (left.length !== right.length) return false

  return left.every((stroke, index) => {
    const other = right[index]
    return other !== undefined
      && stroke.key === other.key
      && stroke.modifiers.length === other.modifiers.length
      && stroke.modifiers.every(modifier => other.modifiers.includes(modifier))
  })
}

/** The gesture (strokes and when) of an entry, without its action. */
export function keybindingOfEntry(entry: KeybindingEntry): Keybinding {
  return { strokes: entry.strokes, ...(entry.when === undefined ? {} : { when: entry.when }) }
}

/** The structural shape a live keyboard event must satisfy to be matched. */
export interface KeyGesture {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
  /** Optional reliable modifier probe; Firefox on Linux can report the flags false. */
  getModifierState?: (modifierArg: string) => boolean
}

/** Whether a modifier is active, preferring the reliable probe over the flag. */
function modifierActive(event: KeyGesture, modifier: string, flag: boolean): boolean {
  if (flag) return true
  return event.getModifierState?.(modifier) ?? false
}

/** Held modifiers of a live keyboard event, in canonical order. */
export function modifiersOf(event: KeyGesture): KeybindingModifier[] {
  const result: KeybindingModifier[] = []
  if (modifierActive(event, 'Control', event.ctrlKey)) result.push('ctrl')
  if (modifierActive(event, 'Meta', event.metaKey)) result.push('meta')
  if (modifierActive(event, 'Alt', event.altKey)) result.push('alt')
  if (modifierActive(event, 'Shift', event.shiftKey)) result.push('shift')
  return result
}

/** Whether a keydown is a recording target (a single real key, not a lone modifier). */
export function isRecordableKey(key: string): boolean {
  return !IGNORED_KEYS.has(key)
}

/**
 * Canonical persisted key value. Single printable characters normalize to
 * lowercase so a letter records the same way whether Shift was held during
 * capture; named keys keep their `KeyboardEvent.key` spelling verbatim.
 */
export function normalizeEventKey(key: string): string {
  return key.length === 1 ? key.toLowerCase() : key
}

/** Build a stroke from a live keyboard event, or null when it is not recordable. */
export function strokeFromEvent(event: KeyGesture): KeyStroke | null {
  if (!isRecordableKey(event.key)) return null
  return { key: normalizeEventKey(event.key), modifiers: modifiersOf(event) }
}

/** Whether a live keyboard event matches a stroke exactly (modifier-exact, no chords). */
export function strokeMatches(event: KeyGesture, stroke: KeyStroke): boolean {
  if (event.key.toLowerCase() !== stroke.key.toLowerCase()) return false
  const held = modifiersOf(event)
  return held.length === stroke.modifiers.length
    && stroke.modifiers.every(modifier => held.includes(modifier))
}

/** Human label for one modifier key (platform-neutral text). */
export const KEYBINDING_MODIFIER_LABELS: Record<KeybindingModifier, string> = {
  ctrl: 'Ctrl',
  meta: 'Meta',
  alt: 'Alt',
  shift: 'Shift',
}

/** Human label for a stroke's key chip. */
export function keybindingKeyLabel(key: string): string {
  if (key === ' ') return 'Space'
  if (key.length === 1) return key.toUpperCase()
  return key
}

/** Ordered chip labels for one stroke. */
export function strokeLabels(stroke: KeyStroke): string[] {
  return [
    ...stroke.modifiers.map(modifier => KEYBINDING_MODIFIER_LABELS[modifier]),
    keybindingKeyLabel(stroke.key),
  ]
}

/** Chip-label rows for a binding: one row per stroke. */
export function keybindingLabels(binding: Keybinding): string[][] {
  return binding.strokes.map(strokeLabels)
}

/** Schemastery schema for one stroke, persisted verbatim in the settings document. */
export const KeyStrokeSchema: z<KeyStroke> = z.object({
  key: z.string(),
  modifiers: z.array(z.union([...KEYBINDING_MODIFIERS])),
})

/** Schemastery schema for one persisted override: identity, base snapshot, plus the partial fields. */
export const KeybindingOverrideSchema: z<KeybindingOverride> = z.object({
  action: UiActionIdSchema,
  source: z.transform(z.string(), value => value as KeybindingSource),
  key: z.transform(z.string(), value => value as KeybindingKey),
  base: z.object({
    strokes: z.array(KeyStrokeSchema),
    when: z.string(),
  }),
  strokes: z.array(KeyStrokeSchema),
  when: z.string(),
  prio: z.number(),
})

/** Keybinding preferences stored in the Host user-settings document. */

import z from '@deepseek-ai/schemastery'
import { KeybindingEntrySchema, type KeybindingEntry } from './keybinding.ts'

/** Settings namespace owned by the keybindings plugin. */
export const KEYBINDINGS_SETTINGS_NAMESPACE = 'ui-keybindings'

/** Durable keybindings section shared by the Host schema and the browser scope. */
export interface KeybindingsSettings {
  /** One entry per overridden action; defaults come from registered actions. */
  bindings: KeybindingEntry[]
}

/** The persisted list starts empty; each action's default lives in its definition. */
export const DEFAULT_KEYBINDING_ENTRIES: KeybindingEntry[] = []

/** Durable keybindings schema; also the wire envelope the browser scope validates against. */
export const KeybindingsSettingsSchema: z<KeybindingsSettings> = z.object({
  bindings: z.array(KeybindingEntrySchema).default(DEFAULT_KEYBINDING_ENTRIES),
})

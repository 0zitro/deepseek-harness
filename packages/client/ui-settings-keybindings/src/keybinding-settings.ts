/** Keybinding preferences stored in the Host user-settings document. */

import z from '@deepseek-ai/schemastery'
import {
  DEFAULT_SEND_KEYBINDING, KeybindingEntrySchema, type KeybindingEntry,
} from './keybinding.ts'
import { COMPOSER_SEND_ACTION } from './ui-action.ts'

/** Settings namespace owned by the keybindings plugin. */
export const KEYBINDINGS_SETTINGS_NAMESPACE = 'ui-keybindings'

/** Durable keybindings section shared by the Host schema and the browser scope. */
export interface KeybindingsSettings {
  /** One entry per bound action; entries reference actions by id. */
  bindings: KeybindingEntry[]
}

/** The default keybindings: the composer send action bound to Enter. */
export const DEFAULT_KEYBINDING_ENTRIES: KeybindingEntry[] = [
  { ...DEFAULT_SEND_KEYBINDING, action: COMPOSER_SEND_ACTION },
]

/** Durable keybindings schema; also the wire envelope the browser scope validates against. */
export const KeybindingsSettingsSchema: z<KeybindingsSettings> = z.object({
  bindings: z.array(KeybindingEntrySchema).default(DEFAULT_KEYBINDING_ENTRIES),
})

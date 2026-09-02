/** Keybinding preferences stored in the Host user-settings document. */

import z from '@deepseek-ai/schemastery'
import { KeybindingOverrideSchema, type KeybindingOverride } from './keybinding.ts'

/** Settings namespace owned by the keybindings plugin. */
export const KEYBINDINGS_SETTINGS_NAMESPACE = 'ui-keybindings'

/** Durable keybindings section shared by the Host schema and the browser scope. */
export interface KeybindingsSettings {
  /** One partial override per adjusted default; defaults come from registered actions. */
  bindings: KeybindingOverride[]
}

/** The persisted list starts empty; each action's default lives in its definition. */
export const DEFAULT_KEYBINDING_ENTRIES: KeybindingOverride[] = []

/** Durable keybindings schema; also the wire envelope the browser scope validates against. */
export const KeybindingsSettingsSchema: z<KeybindingsSettings> = z.object({
  bindings: z.array(KeybindingOverrideSchema).default(DEFAULT_KEYBINDING_ENTRIES),
})

/** Keybinding preferences stored in the Host user-settings document. */

import z from '@deepseek-ai/schemastery'
import {
  DEFAULT_SEND_KEYBINDING, KeybindingSchema, type Keybinding,
} from './keybinding.ts'

/** Settings namespace owned by the keybindings plugin. */
export const KEYBINDINGS_SETTINGS_NAMESPACE = 'ui-keybindings'

/** Durable keybindings section shared by the Host schema and the browser scope. */
export interface KeybindingsSettings {
  /** The composer send action binding. */
  sendMessage: Keybinding
}

/** Durable keybindings schema; also the wire envelope the browser scope validates against. */
export const KeybindingsSettingsSchema: z<KeybindingsSettings> = z.object({
  sendMessage: KeybindingSchema.default(DEFAULT_SEND_KEYBINDING),
})

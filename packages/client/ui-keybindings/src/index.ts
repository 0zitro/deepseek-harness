/** Host registration for browser keybinding preferences. */

import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import type { Context } from '@deepseek-ai/cordis'
import {
  KEYBINDINGS_SETTINGS_NAMESPACE, KeybindingsSettingsSchema,
} from './keybinding-settings.ts'

/**
 * Register the durable keybindings section when a settings provider exists.
 * @param ctx - Host context whose optional settings service owns the section.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(
      settingsNamespace(KEYBINDINGS_SETTINGS_NAMESPACE),
      KeybindingsSettingsSchema,
    )
  })
}

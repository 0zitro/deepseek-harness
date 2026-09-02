/** Host registration for browser keybinding preferences. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-settings'
import { KEYBINDINGS_SETTINGS_NAMESPACE, KeybindingsSettingsSchema } from './keybinding-settings.ts'

/**
 * Register the durable keybindings section when a settings provider exists.
 * The gateway serves every registered namespace, so no allowlist entry is
 * needed beside this registration.
 * @param ctx - Host context whose optional settings service owns the section.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(
      KEYBINDINGS_SETTINGS_NAMESPACE,
      KeybindingsSettingsSchema,
    )
  })
}

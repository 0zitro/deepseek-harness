/** Host registration for the rich composer's browser preferences. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'

/** Settings namespace owned by the rich composer plugin. */
export const RICH_COMPOSER_SETTINGS_NAMESPACE = 'rich-composer'

/** Durable rich composer section shared by the Host schema and the browser scope. */
export interface RichComposerSettings {
  /** Whether the rich composer takes the `conversation.composer` chain over the stock bar. */
  enabled: boolean
}

/** The takeover defaults on; the toggle is the escape hatch back to the stock bar. */
export const RichComposerSettingsSchema: z<RichComposerSettings> = z.object({
  enabled: z.boolean().default(true),
})

/**
 * Register the durable rich composer section when a settings provider exists.
 * @param ctx - Host context whose optional settings service owns the section.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(
      RICH_COMPOSER_SETTINGS_NAMESPACE,
      RichComposerSettingsSchema,
    )
  })
}

/** Registers the overlay manager, which closes the topmost overlay on demand. */
import type { Context } from '@deepseek-ai/cordis'
// Type-only: pulls the keybindings Context merge (ctx.uiWhenContext).
import type {} from '@deepseek-ai/dsh-client-ui-keybindings/client'
import { OverlayManager } from './overlay-manager.ts'

/** Services required by the overlay plugin. */
export const inject = ['uiWhenContext']

/**
 * Register the overlay manager. Overlays contribute themselves via the
 * `OverlayScope` DOM events, and the manager publishes `overlayOpen` for the
 * `overlay.close` action's `when` clause.
 * @param ctx - Client root context.
 */
export function apply(ctx: Context): void {
  ctx.plugin(OverlayManager)
}

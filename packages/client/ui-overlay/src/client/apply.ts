/** Registers the overlay manager, which closes the topmost overlay on demand. */
import type { Context } from '@deepseek-ai/cordis'
// Type-only: pulls the keybindings Context merge (ctx.uiWhenContext).
import type {} from '@deepseek-ai/dsh-client-ui-keybindings/client'
import { OverlayManager } from './overlay-manager.ts'

/**
 * Services required by the overlay plugin: none.
 *
 * `uiWhenContext` is read where it is used and not declared here. The manager
 * publishes `overlayOpen` *into* keybindings rather than depending on them, so
 * a composition with overlays and no keybindings is whole — and declaring the
 * service required would make the manager's own optional read unreachable.
 */
export const inject: readonly string[] = []

/**
 * Register the overlay manager. Overlays contribute themselves via the
 * `OverlayScope` DOM events, and the manager publishes `overlayOpen` for the
 * `overlay.close` action's `when` clause.
 * @param ctx - Client root context.
 */
export function apply(ctx: Context): void {
  ctx.plugin(OverlayManager)
}

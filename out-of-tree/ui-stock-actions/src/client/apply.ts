/**
 * Registers the built-in overlay actions and their default keybindings.
 *
 * This package is the central stock layer for surfaces OUTSIDE the fork's own
 * components: the overlay close gesture addresses the shared overlay manager.
 * The rich composer registers its own actions in its own plugin (a component
 * owns its gestures); its registrations used to live here and were moved when
 * the composer takeover shipped.
 */
import type { Context } from '@deepseek-ai/cordis'
// Type-only: pulls the keybindings Context merge (ctx.uiActions) and its brands.
import type { KeybindingKey, UiActionId } from '@zitro/dsh-oot-ui-actions/client'
// Type-only: pulls the overlay Context merge (ctx.overlays).
import type {} from '@zitro/dsh-oot-ui-overlay/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { en, NS, zh } from './locales.ts'

/** Built-in action ids. */
const OVERLAY_CLOSE_ACTION = 'overlay.close' as UiActionId

/**
 * The stable key of an action's sole default binding, which is the action id
 * it belongs to. The two identities are separate types over one string, so an
 * action contributing several defaults spells each key literally instead.
 * @param action - the action the default belongs to.
 * @returns the default's stable key.
 */
function defaultKey(action: UiActionId): KeybindingKey {
  return action as unknown as KeybindingKey
}

/** Services required by the stock-actions plugin. */
export const inject = ['uiActions', 'locale', 'overlays']

/**
 * Register the overlay actions. Each action is registered through the
 * keybindings orchestrator, which persists its binding and renders its row.
 * @param ctx - Client root context.
 */
export function apply(ctx: Context): void {
  const t = ctx.locale.bind(NS)

  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-stock-actions: dictionaries')

  ctx.effect(() => ctx.uiActions.register({
    id: OVERLAY_CLOSE_ACTION,
    label: t('overlayClose.label'),
    description: t('overlayClose.description'),
    defaultKeybindings: [{ key: defaultKey(OVERLAY_CLOSE_ACTION), strokes: [{ key: 'Escape', modifiers: [] }], when: 'overlayOpen' }],
    run: () => { ctx.overlays.closeTop() },
  }), 'ui-stock-actions: overlay close action')
}

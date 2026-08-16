/** Registers the built-in UI actions and their default keybindings. */
import type { Context } from '@deepseek-ai/cordis'
// Type-only: pulls the keybindings Context merge (ctx.uiActions) and its id type.
import type { UiActionId } from '@deepseek-ai/dsh-client-ui-keybindings/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { en, NS, zh } from './locales.ts'

/** The composer's send action id. */
const COMPOSER_SEND_ACTION = 'composer.send' as UiActionId

/** Services required by the stock-actions plugin. */
export const inject = ['uiActions', 'locale']

/**
 * Register the built-in actions. Each action is registered through the
 * keybindings orchestrator, which persists its binding and renders its row.
 * @param ctx - Client root context.
 */
export function apply(ctx: Context): void {
  const t = ctx.locale.bind(NS)

  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-stock-actions: dictionaries')

  ctx.effect(() => ctx.uiActions.register({
    id: COMPOSER_SEND_ACTION,
    label: t('composerSend.label'),
    description: t('composerSend.description'),
    defaultKeybinding: { strokes: [{ key: 'Enter', modifiers: [] }] },
    // The composer wires the submit once the InputBar consumes its binding.
    run: () => {},
  }), 'ui-stock-actions: composer send action')
}

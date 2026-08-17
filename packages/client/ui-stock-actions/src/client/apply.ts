/** Registers the built-in UI actions and their default keybindings. */
import type { Context } from '@deepseek-ai/cordis'
// Type-only: pulls the keybindings Context merge (ctx.uiActions) and its id type.
import type { UiActionId } from '@deepseek-ai/dsh-client-ui-keybindings/client'
// Type-only: pulls the composer Context merge (ctx.composer).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { en, NS, zh } from './locales.ts'

/** Built-in action ids. */
const COMPOSER_SEND_ACTION = 'composer.send' as UiActionId
const COMPOSER_QUEUE_ACTION = 'composer.queue' as UiActionId
const COMPOSER_STEER_ACTION = 'composer.steer' as UiActionId
const COMPOSER_UNDO_ACTION = 'composer.undo' as UiActionId
const COMPOSER_REDO_ACTION = 'composer.redo' as UiActionId

/** Services required by the stock-actions plugin. */
export const inject = ['uiActions', 'locale', 'composer']

/**
 * Register the built-in actions. Each action is registered through the
 * keybindings orchestrator, which persists its binding and renders its row.
 * `composer.send` is the aggregate (the busy-Enter preference resolves queue
 * versus steer); `composer.queue` and `composer.steer` are raw opt-outs and
 * stay unbound by default.
 * @param ctx - Client root context.
 */
export function apply(ctx: Context): void {
  const t = ctx.locale.bind(NS)

  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-stock-actions: dictionaries')

  ctx.effect(() => ctx.uiActions.register({
    id: COMPOSER_SEND_ACTION,
    label: t('composerSend.label'),
    description: t('composerSend.description'),
    defaultKeybinding: { strokes: [{ key: 'Enter', modifiers: [] }], when: 'composerActive && !commandMenuOpen' },
    run: () => { ctx.composer.send() },
  }), 'ui-stock-actions: composer send action')

  ctx.effect(() => ctx.uiActions.register({
    id: COMPOSER_QUEUE_ACTION,
    label: t('composerQueue.label'),
    description: t('composerQueue.description'),
    run: () => { ctx.composer.queue() },
  }), 'ui-stock-actions: composer queue action')

  ctx.effect(() => ctx.uiActions.register({
    id: COMPOSER_STEER_ACTION,
    label: t('composerSteer.label'),
    description: t('composerSteer.description'),
    run: () => { ctx.composer.steer() },
  }), 'ui-stock-actions: composer steer action')

  ctx.effect(() => ctx.uiActions.register({
    id: COMPOSER_UNDO_ACTION,
    label: t('composerUndo.label'),
    description: t('composerUndo.description'),
    defaultKeybinding: { strokes: [{ key: 'z', modifiers: ['ctrl'] }], when: 'composerActive' },
    run: () => { ctx.composer.undo() },
  }), 'ui-stock-actions: composer undo action')

  ctx.effect(() => ctx.uiActions.register({
    id: COMPOSER_REDO_ACTION,
    label: t('composerRedo.label'),
    description: t('composerRedo.description'),
    defaultKeybinding: { strokes: [{ key: 'z', modifiers: ['ctrl', 'shift'] }], when: 'composerActive' },
    run: () => { ctx.composer.redo() },
  }), 'ui-stock-actions: composer redo action')
}

/** Registers the built-in UI actions and their default keybindings. */
import type { Context } from '@deepseek-ai/cordis'
// Type-only: pulls the keybindings Context merge (ctx.uiActions) and its id type.
import { keybindingKey, type UiActionId } from '@deepseek-ai/dsh-client-ui-keybindings/client'
// Type-only: pulls the composer Context merge (ctx.composer).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the overlay Context merge (ctx.overlays).
import type {} from '@deepseek-ai/dsh-client-ui-overlay/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { en, NS, zh } from './locales.ts'

/** Built-in action ids. */
const COMPOSER_SEND_ACTION = 'composer.send' as UiActionId
const COMPOSER_QUEUE_ACTION = 'composer.queue' as UiActionId
const COMPOSER_STEER_ACTION = 'composer.steer' as UiActionId
const COMPOSER_UNDO_ACTION = 'composer.undo' as UiActionId
const COMPOSER_REDO_ACTION = 'composer.redo' as UiActionId
const COMPOSER_DISMISS_POPUP_ACTION = 'composer.dismissPopup' as UiActionId
const COMPOSER_CLAIM_TOKEN_ACTION = 'composer.claimToken' as UiActionId
const COMMAND_PALETTE_FOCUS_NEXT_ACTION = 'commandPalette.focusNext' as UiActionId
const COMMAND_PALETTE_FOCUS_PREVIOUS_ACTION = 'commandPalette.focusPrevious' as UiActionId
const COMMAND_PALETTE_SELECT_ACTION = 'commandPalette.select' as UiActionId
const OVERLAY_CLOSE_ACTION = 'overlay.close' as UiActionId

/** Services required by the stock-actions plugin. */
export const inject = ['uiActions', 'locale', 'composer', 'overlays']

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
    defaultKeybindings: [{ key: keybindingKey(COMPOSER_SEND_ACTION), strokes: [{ key: 'Enter', modifiers: [] }], when: 'composerActive && !commandMenuOpen' }],
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
    defaultKeybindings: [{ key: keybindingKey(COMPOSER_UNDO_ACTION), strokes: [{ key: 'z', modifiers: ['ctrl'] }], when: 'composerActive' }],
    run: () => { ctx.composer.undo() },
  }), 'ui-stock-actions: composer undo action')

  ctx.effect(() => ctx.uiActions.register({
    id: COMPOSER_REDO_ACTION,
    label: t('composerRedo.label'),
    description: t('composerRedo.description'),
    defaultKeybindings: [{ key: keybindingKey(COMPOSER_REDO_ACTION), strokes: [{ key: 'z', modifiers: ['ctrl', 'shift'] }], when: 'composerActive' }],
    run: () => { ctx.composer.redo() },
  }), 'ui-stock-actions: composer redo action')

  ctx.effect(() => ctx.uiActions.register({
    id: COMPOSER_DISMISS_POPUP_ACTION,
    label: t('composerDismissPopup.label'),
    description: t('composerDismissPopup.description'),
    defaultKeybindings: [{ key: keybindingKey(COMPOSER_DISMISS_POPUP_ACTION), strokes: [{ key: 'Escape', modifiers: [] }], when: 'composerActive' }],
    run: () => { ctx.composer.dismissPopup() },
  }), 'ui-stock-actions: composer dismiss popup action')

  ctx.effect(() => ctx.uiActions.register({
    id: COMPOSER_CLAIM_TOKEN_ACTION,
    label: t('composerClaimToken.label'),
    description: t('composerClaimToken.description'),
    defaultKeybindings: [{ key: keybindingKey(COMPOSER_CLAIM_TOKEN_ACTION), strokes: [{ key: ' ', modifiers: [] }], when: 'composerActive && tokenLeading' }],
    run: () => { ctx.composer.space() },
  }), 'ui-stock-actions: composer claim token action')

  ctx.effect(() => ctx.uiActions.register({
    id: COMMAND_PALETTE_FOCUS_NEXT_ACTION,
    label: t('commandPaletteFocusNext.label'),
    description: t('commandPaletteFocusNext.description'),
    defaultKeybindings: [{ key: keybindingKey(COMMAND_PALETTE_FOCUS_NEXT_ACTION), strokes: [{ key: 'ArrowDown', modifiers: [] }], when: 'commandMenuOpen' }],
    run: () => { ctx.composer.arbitrate('down') },
  }), 'ui-stock-actions: command palette focus next action')

  ctx.effect(() => ctx.uiActions.register({
    id: COMMAND_PALETTE_FOCUS_PREVIOUS_ACTION,
    label: t('commandPaletteFocusPrevious.label'),
    description: t('commandPaletteFocusPrevious.description'),
    defaultKeybindings: [{ key: keybindingKey(COMMAND_PALETTE_FOCUS_PREVIOUS_ACTION), strokes: [{ key: 'ArrowUp', modifiers: [] }], when: 'commandMenuOpen' }],
    run: () => { ctx.composer.arbitrate('up') },
  }), 'ui-stock-actions: command palette focus previous action')

  ctx.effect(() => ctx.uiActions.register({
    id: COMMAND_PALETTE_SELECT_ACTION,
    label: t('commandPaletteSelect.label'),
    description: t('commandPaletteSelect.description'),
    defaultKeybindings: [{ key: keybindingKey(COMMAND_PALETTE_SELECT_ACTION), strokes: [{ key: 'Enter', modifiers: [] }], when: 'commandMenuOpen' }],
    run: () => { ctx.composer.arbitrate('enter') },
  }), 'ui-stock-actions: command palette select action')

  ctx.effect(() => ctx.uiActions.register({
    id: OVERLAY_CLOSE_ACTION,
    label: t('overlayClose.label'),
    description: t('overlayClose.description'),
    defaultKeybindings: [{ key: keybindingKey(OVERLAY_CLOSE_ACTION), strokes: [{ key: 'Escape', modifiers: [] }], when: 'overlayOpen' }],
    run: () => { ctx.overlays.closeTop() },
  }), 'ui-stock-actions: overlay close action')
}

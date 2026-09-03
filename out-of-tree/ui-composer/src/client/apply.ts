/**
 * The rich composer plugin: one chain entry on `conversation.composer` that
 * takes the session's composer seat over the stock bar (the stock bar stays
 * mounted-hidden behind the chain's overlay contract, so its state survives),
 * an editing surface that owns live markdown decoration, and the session
 * shell as the session plane.
 *
 * The composer registers its OWN actions and default keybindings — a
 * component owns its gestures. The runs route through the `ctx.composer`
 * service, which addresses the current session's mounted surface, so a
 * binding fires where the user is looking and every gesture is
 * user-rebindable through the keybindings settings.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { IConversation } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { InputTriggerController } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { KeybindingKey, UiActionId } from '@zitro/dsh-oot-ui-actions/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
// Type-only: pulls the settings-scope Context merge (ctx.settingsScope).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the slot-registry Context merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the locale Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the keybindings Context merge (ctx.uiActions).
import type {} from '@zitro/dsh-oot-ui-actions/client'
import { RICH_COMPOSER_SETTINGS_NAMESPACE, type RichComposerSettings } from '../index.ts'
import { bindPolicy } from './policy.ts'
import { RichEditorSurface, type RichEditorInjected } from './EditorSurface.tsx'
import { RichComposerService } from './service.ts'
import { en, NS, zh } from './locales.ts'

/** Services required by the rich composer plugin. */
export const inject = ['slots', 'settingsScope', 'locale', 'conversation', 'sessions', 'uiActions', 'remote', 'remote.commands']

/** Built-in action ids, owned by this plugin. */
const COMPOSER_SEND = 'composer.send' as UiActionId
const COMPOSER_QUEUE = 'composer.queue' as UiActionId
const COMPOSER_STEER = 'composer.steer' as UiActionId
const COMPOSER_UNDO = 'composer.undo' as UiActionId
const COMPOSER_REDO = 'composer.redo' as UiActionId
const COMPOSER_DISMISS_POPUP = 'composer.dismissPopup' as UiActionId
const COMMAND_PALETTE_NEXT = 'commandPalette.focusNext' as UiActionId
const COMMAND_PALETTE_PREVIOUS = 'commandPalette.focusPrevious' as UiActionId
const COMMAND_PALETTE_SELECT = 'commandPalette.select' as UiActionId

/**
 * The stable key of an action's sole default binding, which is the action id
 * it belongs to.
 * @param action - the action the default belongs to.
 * @returns the default's stable key.
 */
function defaultKey(action: UiActionId): KeybindingKey {
  return action as unknown as KeybindingKey
}

/**
 * Mount the rich composer plugin.
 * @param ctx - Client root context.
 */
export function apply(ctx: Context): void {
  const slots = ctx.slots
  const conversation = ctx.conversation as IConversation
  const sessions = ctx.sessions as ISessions

  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'rich-composer: dictionaries')

  // The takeover toggle: a bound scope over the plugin's own settings
  // namespace. The chain entry stays registered either way — the selector
  // reads the live value, so flipping the setting elects the stock bar on the
  // next dispatch without a registration cycle.
  const host = ctx.settingsScope.bind<RichComposerSettings>({ namespace: RICH_COMPOSER_SETTINGS_NAMESPACE })
  const enabled = createSnapshotStore<boolean>(host.getSnapshot().value?.enabled ?? true)
  ctx.effect(() => host.subscribe(() => {
    const value = host.getSnapshot().value?.enabled ?? true
    if (value !== enabled.getSnapshot()) enabled.set(value)
  }), 'rich-composer: adopt the takeover toggle')

  const policy = bindPolicy(ctx)
  ctx.effect(() => policy.dispose, 'rich-composer: release the preference bind')

  // The action face: current-session routing for this plugin's registrations.
  const composer = new RichComposerService(ctx, sessions)
  // The menu-open context key the when-clauses gate on (a contribution read
  // optionally, never an inject — publishing a key must not make keybindings
  // a condition of composing).
  const publishMenuOpen = (open: boolean): void => {
    const when = ctx.get('uiWhenContext') as { set(key: string, value: boolean): () => void } | undefined
    when?.set('commandMenuOpen', open)
  }

  // The composer's own actions. Defaults ship the stock gestures; every seat
  // is user-rebindable, and an unbound gesture falls to the browser (Enter
  // breaks the line) — gestures are data, not hardcoded behavior.
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.uiActions.register({
    id: COMPOSER_SEND,
    label: t('composerSend.label'),
    description: t('composerSend.description'),
    defaultKeybindings: [{ key: defaultKey(COMPOSER_SEND), strokes: [{ key: 'Enter', modifiers: [] }], when: 'composerActive && !commandMenuOpen' }],
    run: () => { composer.send('enter') },
  }), 'rich-composer: send action')
  ctx.effect(() => ctx.uiActions.register({
    id: COMPOSER_QUEUE,
    label: t('composerQueue.label'),
    description: t('composerQueue.description'),
    run: () => { composer.queue() },
  }), 'rich-composer: queue action')
  ctx.effect(() => ctx.uiActions.register({
    id: COMPOSER_STEER,
    label: t('composerSteer.label'),
    description: t('composerSteer.description'),
    run: () => { composer.steer() },
  }), 'rich-composer: steer action')
  ctx.effect(() => ctx.uiActions.register({
    id: COMPOSER_UNDO,
    label: t('composerUndo.label'),
    description: t('composerUndo.description'),
    defaultKeybindings: [{ key: defaultKey(COMPOSER_UNDO), strokes: [{ key: 'z', modifiers: ['ctrl'] }], when: 'composerActive' }],
    run: () => { composer.undo() },
  }), 'rich-composer: undo action')
  ctx.effect(() => ctx.uiActions.register({
    id: COMPOSER_REDO,
    label: t('composerRedo.label'),
    description: t('composerRedo.description'),
    defaultKeybindings: [
      { key: defaultKey(COMPOSER_REDO), strokes: [{ key: 'z', modifiers: ['ctrl', 'shift'] }], when: 'composerActive' },
      { key: defaultKey(COMPOSER_REDO), strokes: [{ key: 'y', modifiers: ['ctrl'] }], when: 'composerActive' },
    ],
    run: () => { composer.redo() },
  }), 'rich-composer: redo action')
  ctx.effect(() => ctx.uiActions.register({
    id: COMPOSER_DISMISS_POPUP,
    label: t('composerDismissPopup.label'),
    description: t('composerDismissPopup.description'),
    defaultKeybindings: [{ key: defaultKey(COMPOSER_DISMISS_POPUP), strokes: [{ key: 'Escape', modifiers: [] }], when: 'composerActive && commandMenuOpen' }],
    run: () => { composer.dismissPopup() },
  }), 'rich-composer: dismiss popup action')
  ctx.effect(() => ctx.uiActions.register({
    id: COMMAND_PALETTE_NEXT,
    label: t('commandPaletteFocusNext.label'),
    description: t('commandPaletteFocusNext.description'),
    defaultKeybindings: [{ key: defaultKey(COMMAND_PALETTE_NEXT), strokes: [{ key: 'ArrowDown', modifiers: [] }], when: 'commandMenuOpen' }],
    run: () => { composer.arbitrate('down') },
  }), 'rich-composer: palette next action')
  ctx.effect(() => ctx.uiActions.register({
    id: COMMAND_PALETTE_PREVIOUS,
    label: t('commandPaletteFocusPrevious.label'),
    description: t('commandPaletteFocusPrevious.description'),
    defaultKeybindings: [{ key: defaultKey(COMMAND_PALETTE_PREVIOUS), strokes: [{ key: 'ArrowUp', modifiers: [] }], when: 'commandMenuOpen' }],
    run: () => { composer.arbitrate('up') },
  }), 'rich-composer: palette previous action')
  ctx.effect(() => ctx.uiActions.register({
    id: COMMAND_PALETTE_SELECT,
    label: t('commandPaletteSelect.label'),
    description: t('commandPaletteSelect.description'),
    defaultKeybindings: [{ key: defaultKey(COMMAND_PALETTE_SELECT), strokes: [{ key: 'Enter', modifiers: [] }], when: 'commandMenuOpen' }],
    run: () => { composer.arbitrate('enter') },
  }), 'rich-composer: palette select action')

  // The editor seat: shadows the stock Lexical surface (lowest priority
  // renders on a single slot). The bar keeps its whole chrome — this entry
  // replaces ONLY the text-editing surface. The `enabled` settings toggle
  // switches the surface itself between the decorated editor and a plain
  // binding of the stock shell editor, without touching registrations.
  slots.inject('conversation.composer.editor', () => slots.register({
    name: 'conversation.composer.editor',
    priority: -5,
    locale: NS,
    inject: (sessionId: SessionId): RichEditorInjected => ({
      rich: richFaces(sessionId, enabled),
    }),
  }, RichEditorSurface))

  /** The per-session faces, resolved lazily so boot order stays free. */
  function richFaces(sessionId: SessionId, enabled: ReturnType<typeof createSnapshotStore<boolean>>): RichEditorInjected['rich'] {
    return {
      shell: conversation.input.shell(sessionId),
      conversation: {
        createDraftImages: files => conversation.createDraftImages(files),
        draftImages: ids => conversation.draftImages(ids),
        releaseDraftImage: id => conversation.releaseDraftImage(id),
      },
      triggers: triggersOf(sessionId),
      publishMenuOpen,
      service: composer,
      resolveMode: (running, gesture, steeringAvailable) =>
        policy.resolve(running, gesture, steeringAvailable),
      enabled,
    }
  }


  /** The session's trigger controller, or undefined where no provider is installed. */
  function triggersOf(sessionId: SessionId): InputTriggerController | undefined {
    const actx = sessions.scope(sessionId)
    if (actx === undefined) return undefined
    const service = ctx.get('inputTriggers') as
      | { sessionOf(actx: Context): InputTriggerController | undefined }
      | undefined
    return service?.sessionOf(actx)
  }
}

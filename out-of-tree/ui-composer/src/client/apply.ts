/**
 * The rich composer plugin: one chain entry on `conversation.composer` that
 * takes the session's composer seat over the stock bar (the stock bar stays
 * mounted-hidden behind the chain's overlay contract, so its state survives),
 * an editing surface that owns live markdown decoration, and the session
 * shell as the session plane.
 */
import type { Context } from '@deepseek-ai/cordis'
import type {
  ComposerChainProps, IConversation,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { InputTriggerController } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
// Type-only: pulls the settings-scope Context merge (ctx.settingsScope).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the slot-registry Context merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the locale Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { RICH_COMPOSER_SETTINGS_NAMESPACE, type RichComposerSettings } from '../index.ts'
import { bindPolicy } from './policy.ts'
import { RichComposer, type RichComposerInjected } from './RichComposer.tsx'
import { RichComposerService } from './service.ts'
import { en, NS, zh } from './locales.ts'

/** Services required by the rich composer plugin. */
export const inject = ['slots', 'settingsScope', 'locale', 'conversation', 'sessions']

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

  // The action face stock keybindings reach, and the menu-open context key
  // their when-clauses gate on (a contribution read optionally, never an
  // inject — publishing a key must not make keybindings a condition of
  // composing).
  const composer = new RichComposerService(ctx, sessions)
  const publishMenuOpen = (open: boolean): void => {
    const when = ctx.get('uiWhenContext') as { set(key: string, value: boolean): () => void } | undefined
    when?.set('commandMenuOpen', open)
  }

  slots.inject('conversation.composer', () => slots.register({
    name: 'conversation.composer',
    priority: -5,
    locale: NS,
    // Business-owned interactions keep the composers that render them: the
    // question and approval entries tried after this one elect on the pending
    // carrier, and this selector declining is what lets them.
    select: ({ pendingInteraction }: ComposerChainProps): true | null =>
      pendingInteraction === undefined && enabled.getSnapshot() ? true : null,
    inject: (sessionId: SessionId): RichComposerInjected => ({
      hooks: { notices: conversation.input.shell(sessionId).notices },
      rich: richFaces(sessionId),
    }),
  }, RichComposer))

  /** The per-session faces, resolved lazily so boot order stays free. */
  function richFaces(sessionId: SessionId): RichComposerInjected['rich'] {
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
      stop: () => {
        sessions.binding(sessionId)?.session.cancel().catch(() => {
          // Stop failure is published through Session promptError.
        })
      },
      resolveMode: (running, gesture, steeringAvailable) =>
        policy.resolve(running, gesture, steeringAvailable),
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

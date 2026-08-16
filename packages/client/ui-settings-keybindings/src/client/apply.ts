/** Registers the Keybindings settings section and binds the send-message binding. */
import type { Context } from '@deepseek-ai/cordis'
import {
  createSnapshotStore, shallowEqual, type SettingsScope, type SnapshotStore,
} from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the settings-scope Context merge (ctx.settingsScope).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import {
  DEFAULT_SEND_KEYBINDING, type Keybinding, type KeybindingEntry,
} from '../keybinding.ts'
import {
  DEFAULT_KEYBINDING_ENTRIES, KEYBINDINGS_SETTINGS_NAMESPACE, type KeybindingsSettings,
} from '../keybinding-settings.ts'
import { COMPOSER_SEND_ACTION } from '../ui-action.ts'
import { KeybindingsSection, type KeybindingsSectionInjected } from './KeybindingsSection.tsx'
import { en, NS, zh } from './locales.ts'

/** Services required by the keybindings plugin. */
export const inject = ['slots', 'settingsScope', 'locale']

/** One action binding bound to the durable keybindings list. */
interface BindingScope {
  value: SnapshotStore<Keybinding>
  set: (next: Keybinding) => void
}

/** The strokes-and-when gesture of an entry, without its action. */
function gestureOf(entry: KeybindingEntry): Keybinding {
  return { strokes: entry.strokes, ...(entry.when === undefined ? {} : { when: entry.when }) }
}

/**
 * Bind the composer send action to the durable keybindings list. The persisted
 * entry keeps its action id; only the gesture (strokes and when) is exposed
 * and edited here, so the section stays action-agnostic until the action
 * registry drives one row per action.
 */
function bindSendBinding(host: SettingsScope<KeybindingsSettings>): BindingScope {
  const value = createSnapshotStore<Keybinding>(DEFAULT_SEND_KEYBINDING)

  const adopt = () => {
    const entry = host.getSnapshot().value?.bindings.find(binding => binding.action === COMPOSER_SEND_ACTION)
    if (entry === undefined) return
    const next = gestureOf(entry)
    if (shallowEqual(value.getSnapshot(), next)) return
    value.set(next)
  }
  host.subscribe(adopt)
  adopt()

  const set = (next: Keybinding) => {
    if (value.getSnapshot() === next) return
    value.set(next)
    const previous = host.getSnapshot().value?.bindings ?? DEFAULT_KEYBINDING_ENTRIES
    const bindings = previous.map(entry => entry.action === COMPOSER_SEND_ACTION
      ? {
        strokes: next.strokes,
        action: COMPOSER_SEND_ACTION,
        ...(next.when === undefined ? {} : { when: next.when }),
      }
      : entry)
    void host.set('bindings', bindings)
  }
  return { value, set }
}

/** Mounts the keybindings plugin.
 * @param ctx - Client root context.
 */
export function apply(ctx: Context): void {
  const slots = ctx.slots
  const t = ctx.locale.bind(NS)

  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-keybindings: dictionaries')

  const host = ctx.settingsScope.bind<KeybindingsSettings>({ namespace: KEYBINDINGS_SETTINGS_NAMESPACE })
  const sendMessage = bindSendBinding(host)

  // `slots.inject` awaits the `settings.section` declaration (owned by
  // ui-settings-general), whose activation order is not constrained.
  slots.inject('settings.section', () => slots.register({
    name: 'settings.section',
    id: 'keybindings',
    order: 25,
    label: () => t('title'),
    locale: NS,
    inject: (): KeybindingsSectionInjected => ({
      hooks: { sendMessage: sendMessage.value },
      setSendMessage: sendMessage.set,
    }),
  }, KeybindingsSection))
}

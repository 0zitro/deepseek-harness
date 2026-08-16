/** Registers the Keybindings settings section and binds the send-message binding. */
import type { Context } from '@deepseek-ai/cordis'
import {
  createSnapshotStore, type SettingsScope, type SnapshotStore,
} from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the settings-scope Context merge (ctx.settingsScope).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { DEFAULT_SEND_KEYBINDING, type Keybinding } from '../keybinding.ts'
import {
  KEYBINDINGS_SETTINGS_NAMESPACE, type KeybindingsSettings,
} from '../keybinding-settings.ts'
import { KeybindingsSection, type KeybindingsSectionInjected } from './KeybindingsSection.tsx'
import { en, NS, zh } from './locales.ts'

/** Services required by the keybindings plugin. */
export const inject = ['slots', 'settingsScope', 'locale']

/** One action binding bound to the durable settings document. */
interface BindingScope {
  value: SnapshotStore<Keybinding>
  set: (next: Keybinding) => void
}

/**
 * Bind one action's persisted value to the settings document. Adoption mirrors
 * the busy-Enter policy: the live value publishes before the durable write
 * starts, and an external document edit is adopted back without being written
 * out again.
 */
function bindBinding(
  field: keyof KeybindingsSettings,
  host: SettingsScope<KeybindingsSettings>,
  fallback: Keybinding,
): BindingScope {
  const value = createSnapshotStore<Keybinding>(fallback)
  const adopt = () => {
    const section = host.getSnapshot().value
    if (section === undefined || value.getSnapshot() === section[field]) return
    value.set(section[field])
  }
  host.subscribe(adopt)
  adopt()
  const set = (next: Keybinding) => {
    if (value.getSnapshot() === next) return
    value.set(next)
    void host.set(field, next)
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
  const sendMessage = bindBinding('sendMessage', host, DEFAULT_SEND_KEYBINDING)

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

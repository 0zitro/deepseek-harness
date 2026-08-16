/** Registers the keybindings orchestrator: action registry, durable list, and the settings section. */
import type { Context } from '@deepseek-ai/cordis'
import {
  createSnapshotStore, shallowEqual, type SettingsScope, type SnapshotStore,
} from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the settings-scope Context merge (ctx.settingsScope).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { keybindingOfEntry, type Keybinding, type KeybindingEntry } from '../keybinding.ts'
import {
  DEFAULT_KEYBINDING_ENTRIES, KEYBINDINGS_SETTINGS_NAMESPACE, type KeybindingsSettings,
} from '../keybinding-settings.ts'
import type { UiActionId } from '../ui-action.ts'
import { UiActionRegistry } from './action-registry.ts'
import { createKeybindingDispatcher } from './dispatch.ts'
import { KeybindingsSection, type KeybindingsSectionInjected } from './KeybindingsSection.tsx'
import { en, NS, zh } from './locales.ts'

/** Services required by the keybindings plugin. */
export const inject = ['slots', 'settingsScope', 'locale']

/** The durable keybindings list bound to the settings scope, plus a write-back. */
interface BindingsScope {
  value: SnapshotStore<readonly KeybindingEntry[]>
  set: (action: UiActionId, next: Keybinding) => void
}

/**
 * Bind the persisted list to the settings scope. External edits are adopted
 * back without being written out again; `set` replaces one action's entry,
 * leaving every other action untouched.
 */
function bindBindings(host: SettingsScope<KeybindingsSettings>): BindingsScope {
  const value = createSnapshotStore<readonly KeybindingEntry[]>(DEFAULT_KEYBINDING_ENTRIES)

  const adopt = () => {
    const next = host.getSnapshot().value?.bindings ?? DEFAULT_KEYBINDING_ENTRIES
    if (shallowEqual(value.getSnapshot(), next)) return
    value.set(next)
  }
  host.subscribe(adopt)
  adopt()

  const set = (action: UiActionId, next: Keybinding) => {
    const existing = value.getSnapshot().find(entry => entry.action === action)
    if (existing !== undefined && shallowEqual(keybindingOfEntry(existing), next)) return
    const entry: KeybindingEntry = {
      strokes: next.strokes,
      action,
      ...(next.when === undefined ? {} : { when: next.when }),
    }
    const previous = host.getSnapshot().value?.bindings ?? DEFAULT_KEYBINDING_ENTRIES
    const bindings = previous.some(current => current.action === action)
      ? previous.map(current => current.action === action ? entry : current)
      : [...previous, entry]
    value.set(bindings)
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

  new UiActionRegistry(ctx)

  const host = ctx.settingsScope.bind<KeybindingsSettings>({ namespace: KEYBINDINGS_SETTINGS_NAMESPACE })
  const bindings = bindBindings(host)

  // Dispatch keystrokes to the persisted bindings.
  ctx.effect(
    () => createKeybindingDispatcher(bindings.value, ctx.uiActions.actions),
    'ui-keybindings: dispatch',
  )

  // `slots.inject` awaits the `settings.section` declaration (owned by
  // ui-settings-general), whose activation order is not constrained.
  slots.inject('settings.section', () => slots.register({
    name: 'settings.section',
    id: 'keybindings',
    order: 25,
    label: () => t('title'),
    locale: NS,
    inject: (): KeybindingsSectionInjected => ({
      hooks: {
        actions: ctx.uiActions.actions,
        bindings: bindings.value,
      },
      setBinding: bindings.set,
    }),
  }, KeybindingsSection))
}

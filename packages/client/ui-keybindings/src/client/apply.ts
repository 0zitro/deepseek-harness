/** Registers the keybindings orchestrator: action registry, durable list, and the settings section. */
import type { Context } from '@deepseek-ai/cordis'
import {
  createSnapshotStore, shallowEqual, type SettingsScope, type SnapshotStore,
} from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the settings-scope Context merge (ctx.settingsScope).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import {
  sameStrokes,
  type Keybinding, type KeybindingEdit, type KeybindingOverride, type KeybindingOverrideRef,
} from '../keybinding.ts'
import {
  DEFAULT_KEYBINDING_ENTRIES, KEYBINDINGS_SETTINGS_NAMESPACE, type KeybindingsSettings,
} from '../keybinding-settings.ts'
import { UiActionRegistry } from './action-registry.ts'
import { createKeybindingDispatcher } from './dispatch.ts'
import { KeybindingsSection, type KeybindingsSectionInjected } from './KeybindingsSection.tsx'
import { UiWhenContext } from './when-context.ts'
import { en, NS, zh } from './locales.ts'

/** Services required by the keybindings plugin. */
export const inject = ['slots', 'settingsScope', 'locale']

/** The durable keybindings list bound to the settings scope, plus a write-back. */
interface BindingsScope {
  value: SnapshotStore<readonly KeybindingOverride[]>
  set: (ref: KeybindingOverrideRef, base: Keybinding, edit: KeybindingEdit) => void
}

/** Whether an edit would leave the override's own fields as they already stand. */
function alreadyStored(override: KeybindingOverride, edit: KeybindingEdit): boolean {
  if (edit.when !== undefined && edit.when !== override.when) return false
  if (edit.prio !== undefined && edit.prio !== override.prio) return false

  return edit.strokes === undefined
    || (override.strokes !== undefined && sameStrokes(edit.strokes, override.strokes))
}

/**
 * Bind the persisted list to the settings scope. The store projects the
 * durable list and nothing else, so an edit becomes visible only once it is
 * stored: `set` derives the next list from the durable one, replaces the
 * addressed override, and leaves every other override untouched. Absent a
 * stored list — unread, unserved, or undecodable — there is nothing to derive
 * from, and the write is refused rather than allowed to replace overrides it
 * never saw.
 */
function bindBindings(host: SettingsScope<KeybindingsSettings>, ctx: Context): BindingsScope {
  const value = createSnapshotStore<readonly KeybindingOverride[]>(DEFAULT_KEYBINDING_ENTRIES)

  const adopt = () => {
    const next = host.getSnapshot().value?.bindings ?? DEFAULT_KEYBINDING_ENTRIES
    if (shallowEqual(value.getSnapshot(), next)) return
    value.set(next)
  }
  host.subscribe(adopt)
  adopt()

  const set = (ref: KeybindingOverrideRef, base: Keybinding, edit: KeybindingEdit) => {
    const previous = host.getSnapshot().value?.bindings
    if (previous === undefined) {
      ctx.logger.error('ui-keybindings: the stored keybindings are unavailable; the change was not saved')
      return
    }

    const at = previous.findIndex(current =>
      current.action === ref.action && current.key === ref.key && current.source === ref.source)
    const stored = previous[at]
    if (stored !== undefined && alreadyStored(stored, edit)) return

    const override: KeybindingOverride = { ...(stored ?? { ...ref, base }), ...edit }
    const bindings = stored === undefined
      ? [...previous, override]
      : previous.map((current, index) => index === at ? override : current)
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
  new UiWhenContext(ctx)

  const host = ctx.settingsScope.bind<KeybindingsSettings>({ namespace: KEYBINDINGS_SETTINGS_NAMESPACE })
  const bindings = bindBindings(host, ctx)

  // Dispatch keystrokes to the persisted bindings, gated by the when context.
  ctx.effect(
    () => createKeybindingDispatcher(bindings.value, ctx.uiActions.actions, ctx.uiWhenContext.context),
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

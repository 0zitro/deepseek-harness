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
  type KeybindingSource, type SourcedOverride,
} from '../keybinding.ts'
import {
  DEFAULT_KEYBINDING_ENTRIES, KEYBINDINGS_SETTINGS_NAMESPACE, type KeybindingsSettings,
} from '../keybinding-settings.ts'
import { UiActionRegistry, type UiActionDefinition } from './action-registry.ts'
import { createKeybindingDispatcher, reconcileBases } from './dispatch.ts'
import { KeybindingsSection, type KeybindingsSectionInjected } from './KeybindingsSection.tsx'
import { UiWhenContext } from './when-context.ts'
import { en, NS, zh } from './locales.ts'

/** Services required by the keybindings plugin. */
export const inject = ['slots', 'settingsScope', 'locale']

/** The source the settings document gives every override it holds. */
const USER_SOURCE: KeybindingSource = 'user'

/** The durable keybindings list bound to the settings scope, plus its write-backs. */
interface BindingsScope {
  value: SnapshotStore<readonly SourcedOverride[]>
  set: (ref: KeybindingOverrideRef, base: Keybinding, edit: KeybindingEdit) => void
  reconcile: (actions: readonly UiActionDefinition[]) => void
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
  const value = createSnapshotStore<readonly SourcedOverride[]>([])
  // The document is what changes; the published view is it, stamped. Comparing
  // the documents keeps a fresh stamping from reading as a change every time.
  let document: readonly KeybindingOverride[] = DEFAULT_KEYBINDING_ENTRIES

  const adopt = () => {
    const next = host.getSnapshot().value?.bindings ?? DEFAULT_KEYBINDING_ENTRIES
    if (shallowEqual(document, next)) return
    document = next
    value.set(next.map(override => ({ ...override, source: USER_SOURCE })))
  }
  ctx.effect(() => host.subscribe(adopt), 'ui-keybindings: adopt the stored list')
  adopt()

  const set = (ref: KeybindingOverrideRef, base: Keybinding, edit: KeybindingEdit) => {
    const previous = host.getSnapshot().value?.bindings
    if (previous === undefined) {
      ctx.logger.error('ui-keybindings: the stored keybindings are unavailable; the change was not saved')
      return
    }

    const at = previous.findIndex(current => current.action === ref.action && current.key === ref.key)
    const stored = previous[at]
    if (stored !== undefined && alreadyStored(stored, edit)) return

    const override: KeybindingOverride = { ...(stored ?? { ...ref, base }), ...edit }
    const bindings = stored === undefined
      ? [...previous, override]
      : previous.map((current, index) => index === at ? override : current)
    void host.set('bindings', bindings)
  }

  // Reuptake: a default whose gesture moved replaces the base its overrides
  // still snapshot, so the stored base stays the one the origin ships. The
  // comparison is structural, so a pass over an already-reconciled list writes
  // nothing and the observer driving this settles after one write.
  const reconcile = (actions: readonly UiActionDefinition[]) => {
    const previous = host.getSnapshot().value?.bindings
    if (previous === undefined) return

    const bindings = reconcileBases(previous, actions)
    if (bindings === previous) return

    void host.set('bindings', bindings)
  }

  return { value, set, reconcile }
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

  // Reconcile whenever either side moves: a registration brings a new default,
  // a durable change brings overrides that may still snapshot the old one.
  ctx.effect(() => {
    const actions = ctx.uiActions.actions
    const reconcile = () => { bindings.reconcile(actions.getSnapshot()) }

    const disposers = [actions.subscribe(reconcile), bindings.value.subscribe(reconcile)]
    reconcile()

    return () => { for (const dispose of disposers) dispose() }
  }, 'ui-keybindings: base reconcile')

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

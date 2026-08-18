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
import { UiActionRegistry } from './action-registry.ts'
import { createKeybindingDispatcher, reconcileBases } from './dispatch.ts'
import { insertPrio, type PrioAssignment } from './reorder.ts'
import { keybindingRows, type EffectiveRow } from './rows.ts'
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
  remove: (ref: KeybindingOverrideRef) => void
  reconcile: () => void
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
/** Apply one priority assignment to the document. */
function assign(
  overrides: readonly KeybindingOverride[],
  { ref, prio }: PrioAssignment,
): readonly KeybindingOverride[] {
  return overrides.map((override) => {
    if (override.action !== ref.action || override.key !== ref.key) return override
    if (prio !== undefined) return { ...override, prio }

    // Retiring the last field an override states does not leave it saying
    // nothing: holding the seat is itself a statement, because the binding is
    // the user's from then on — it outranks the sources it used to follow, and
    // it orders in the user's scope rather than theirs.
    const { prio: _retired, ...rest } = override
    return rest
  })
}

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

  // Every write derives the next list from the stored one, so a list that
  // cannot be read is a write that cannot be made: replacing it would drop the
  // overrides it never saw.
  const readable = (): readonly KeybindingOverride[] | undefined => {
    const previous = host.getSnapshot().value?.bindings
    if (previous === undefined) {
      ctx.logger.error('ui-keybindings: the stored keybindings are unavailable; the change was not saved')
    }
    return previous
  }

  const set = (ref: KeybindingOverrideRef, base: Keybinding, edit: KeybindingEdit) => {
    const previous = readable()
    if (previous === undefined) return

    const at = previous.findIndex(current => current.action === ref.action && current.key === ref.key)
    const stored = previous[at]
    if (stored !== undefined && alreadyStored(stored, edit)) return

    const override: KeybindingOverride = { ...(stored ?? { ...ref, base }), ...edit }
    const edited = stored === undefined
      ? [...previous, override]
      : previous.map((current, index) => index === at ? override : current)

    void host.set('bindings', edit.prio === undefined ? edited : reordered(edited, ref, edit.prio))
  }

  /**
   * Drop the user's contribution to a seat. What the seat ships is untouched,
   * so a shipped binding returns to the page and a binding the user added
   * leaves it altogether; a seat the document does not address is not an error
   * to remove, it is a list that already reads the way the caller asked for.
   */
  const remove = (ref: KeybindingOverrideRef) => {
    const previous = readable()
    if (previous === undefined) return

    const kept = previous.filter(current => current.action !== ref.action || current.key !== ref.key)
    if (kept.length === previous.length) return

    void host.set('bindings', kept)
  }

  /**
   * A stated priority places the binding: whatever ordered at or after it in
   * the same scope moves one place back, judged against the world the edit
   * would leave rather than the one it arrived in — adopting a default moves
   * it into the user's scope, where the places are already taken.
   */
  const reordered = (
    overrides: readonly KeybindingOverride[],
    ref: KeybindingOverrideRef,
    prio: number,
  ): readonly KeybindingOverride[] => {
    const registered = ctx.uiActions.actions.getSnapshot()
    const rows = keybindingRows(registered, overrides.map(o => ({ ...o, source: USER_SOURCE })))
    // The seat's own binding, not the one an override took it from: only a
    // binding that dispatches holds a place for a stated priority to move.
    const candidate = rows.find((row): row is EffectiveRow =>
      !row.superseded && row.action === ref.action && row.key === ref.key)
    /* v8 ignore next -- every override yields a row, against its default or as an orphan */
    if (candidate === undefined) return overrides

    return insertPrio(rows, candidate, prio, action => registered.some(entry => entry.id === action))
      .reduce(assign, overrides)
  }

  // Reuptake: a default whose gesture moved replaces the base its overrides
  // still snapshot, so the stored base stays the one the origin ships. The
  // comparison is structural, so a pass over an already-reconciled list writes
  // nothing and the observer driving this settles after one write.
  const reconcile = () => {
    const previous = host.getSnapshot().value?.bindings
    if (previous === undefined) return

    const bindings = reconcileBases(previous, ctx.uiActions.actions.getSnapshot())
    if (bindings === previous) return

    void host.set('bindings', bindings)
  }

  return { value, set, remove, reconcile }
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
    const disposers = [
      ctx.uiActions.actions.subscribe(bindings.reconcile),
      bindings.value.subscribe(bindings.reconcile),
    ]
    bindings.reconcile()

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
      removeBinding: bindings.remove,
    }),
  }, KeybindingsSection))
}

/** Keystroke dispatch: match keydowns against the persisted entries and run the matched action. */
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { ChordMatcher } from '../chord.ts'
import {
  isRecordableKey, keybindingOfDefault, sameKeybinding, strokesKey,
  type KeybindingDefault, type KeybindingEntry, type KeybindingKey, type KeybindingOverride,
  type KeybindingSource, type SourcedOverride,
} from '../keybinding.ts'
import { evaluateWhen, parseWhenClause, type WhenContext } from '../when-clause.ts'
import type { UiActionId } from '../ui-action.ts'
import type { UiActionDefinition } from './action-registry.ts'
import type { ReadonlySnapshot } from './when-context.ts'

/**
 * Run the action a matched entry references. A binding whose command is no
 * longer registered does nothing rather than failing: a stored override
 * outlives the registration it was made against.
 * @param matched - the entry the gesture completed.
 * @param actions - the actions currently registered.
 */
export function runMatched(matched: KeybindingEntry, actions: readonly UiActionDefinition[]): void {
  actions.find(action => action.id === matched.action)?.run()
}

/**
 * Whether a binding's `when` clause holds against the context. A clause that
 * is absent or blank states no predicate and is always active, which is how an
 * override clears the predicate its default carries. A clause that does not
 * parse resolves false, so a binding is never fired on a predicate no one
 * could read.
 * @param when - the clause, or nothing.
 * @param context - the state keys in force.
 * @returns whether the binding may fire.
 */
export function resolveWhen(when: string | undefined, context: WhenContext): boolean {
  if (when === undefined || when.trim() === '') return true
  try {
    return evaluateWhen(parseWhenClause(when), context)
  } catch {
    return false
  }
}

/**
 * Feed one keydown into the matcher and run the action a binding completes on.
 * The dispatcher claims the keystroke whenever it matched or opened a chord,
 * so a bound gesture never also reaches the input beneath it, and it ignores
 * composition and auto-repeat, which are not presses the user made.
 * @param matcher - the chord matcher holding any pending chord.
 * @param actions - the actions currently registered.
 * @param event - the live keydown.
 * @param composing - whether an IME composition is in flight, tracked at the
 * window for engines that clear `isComposing` before the closing keydown.
 */
export function dispatchKeydown(
  matcher: ChordMatcher<KeybindingEntry>,
  actions: readonly UiActionDefinition[],
  event: KeyboardEvent,
  composing: boolean,
): void {
  /* v8 ignore next -- jsdom cannot synthesize isComposing on a native KeyboardEvent */
  if (event.isComposing || composing) return
  // oxlint-disable-next-line typescript/no-deprecated
  if (event.keyCode === 229) return
  if (event.repeat) return
  if (!isRecordableKey(event.key)) return
  const matched = matcher.feed(event)
  if (matched === null && matcher.progress === null) return
  event.preventDefault()
  if (matched !== null) runMatched(matched, actions)
}

/**
 * The top-ranked override for (action, key): user > plugin > system, then the
 * order its provider contributed it in. Only this one merges with the default
 * — overrides from different providers never roll together.
 * @param overrides - every override in force, each stamped by its provider.
 * @param action - the action the seat belongs to.
 * @param key - the seat's stable key.
 * @returns the one override that merges, or nothing when the seat is free.
 */
export function topOverride(
  overrides: readonly SourcedOverride[],
  action: UiActionId,
  key: KeybindingKey,
): SourcedOverride | undefined {
  let best: SourcedOverride | undefined
  for (const override of overrides) {
    if (override.action !== action || override.key !== key) continue
    if (best === undefined || sourceRank(override.source) < sourceRank(best.source)) best = override
  }
  return best
}

/**
 * Emit a shipped default as an effective entry. The source is stamped here
 * rather than declared by the registrar, so nothing can claim a provenance it
 * does not have.
 * @param def - the shipped default.
 * @param action - the action it invokes.
 * @returns the entry dispatch resolves against.
 */
export function defaultEntry(def: KeybindingDefault, action: UiActionId): KeybindingEntry {
  return {
    strokes: def.strokes,
    action,
    source: 'system',
    ...(def.when === undefined ? {} : { when: def.when }),
  }
}

/**
 * Merge one default with the override that took its seat. A field the override
 * does not state follows the default, which is what lets a later change to
 * that default still reach the merged binding.
 * @param def - the current default, or nothing when it is unavailable, in
 * which case the override's retained base snapshot stands in for it.
 * @param action - the action the binding invokes.
 * @param override - the override that took the seat, already stamped.
 * @returns the entry dispatch resolves against.
 */
export function mergeOverride(
  def: KeybindingDefault | undefined,
  action: UiActionId,
  override: SourcedOverride,
): KeybindingEntry {
  // Reconcile with the world: the current default, else the retained base snapshot.
  const base = def ?? override.base
  const when = override.when ?? base.when
  return {
    strokes: override.strokes ?? base.strokes,
    action,
    source: override.source,
    ...(when === undefined ? {} : { when }),
    ...(override.prio === undefined ? {} : { prio: override.prio }),
  }
}

/**
 * The default a seat currently ships.
 * @param actions - the actions registered right now.
 * @param action - the action the seat belongs to.
 * @param key - the seat's stable key.
 * @returns the default, or nothing when no registration ships that seat.
 */
export function findDefault(
  actions: readonly UiActionDefinition[],
  action: UiActionId,
  key: KeybindingKey,
): KeybindingDefault | undefined {
  for (const candidate of actions) {
    if (candidate.id !== action) continue
    for (const def of candidate.defaultKeybindings ?? []) {
      if (def.key === key) return def
    }
  }
  return undefined
}

/**
 * The overrides with every stored base refreshed to the default it names, so
 * the snapshot an override merges with stays the one its origin currently
 * ships. An override whose default is unavailable keeps the base it retained —
 * failing to reconcile is not failing to merge. Returns the given list itself
 * when no base has drifted, which is how a caller tells a write is owed.
 * @param overrides - the stored overrides.
 * @param actions - the actions registered right now, holding the live defaults.
 * @returns the reconciled overrides, or `overrides` when none drifted.
 */
export function reconcileBases(
  overrides: readonly KeybindingOverride[],
  actions: readonly UiActionDefinition[],
): readonly KeybindingOverride[] {
  const reconciled = overrides.map((override) => {
    const def = findDefault(actions, override.action, override.key)
    if (def === undefined) return override

    const base = keybindingOfDefault(def)
    return sameKeybinding(base, override.base) ? override : { ...override, base }
  })

  return reconciled.every((next, index) => next === overrides[index]) ? overrides : reconciled
}

/**
 * Every binding in force: each shipped seat merged with the override that took
 * it, plus the overrides whose seat no registration ships, which still
 * dispatch against the base they retained.
 * @param actions - the actions registered right now.
 * @param overrides - every override in force, each stamped by its provider.
 * @returns one entry per seat, in registration order.
 */
export function effectiveEntries(
  actions: readonly UiActionDefinition[],
  overrides: readonly SourcedOverride[],
): readonly KeybindingEntry[] {
  const entries: KeybindingEntry[] = []
  for (const action of actions) {
    for (const def of action.defaultKeybindings ?? []) {
      const override = topOverride(overrides, action.id, def.key)
      entries.push(override === undefined ? defaultEntry(def, action.id) : mergeOverride(def, action.id, override))
    }
  }
  // An orphaned override (its key was retired wholesale) still resolves: the
  // retained base snapshot stands in while the origin is unavailable.
  for (const override of overrides) {
    if (findDefault(actions, override.action, override.key) !== undefined) continue
    entries.push(mergeOverride(undefined, override.action, override))
  }
  return entries
}

/**
 * Cross-source rank: the user outranks plugins, which outrank what ships.
 * @param source - where a binding came from.
 * @returns a rank, lowest first, as the ordering consults it.
 */
export function sourceRank(source: KeybindingSource): number {
  if (source === 'user') return 0
  if (source === 'system') return 2
  return 1
}

/**
 * The entries in the order dispatch resolves them: by source rank first, then
 * by the priority that separates entries one rank cannot, with an absent
 * priority seeded within the scope it would compete in.
 * @param entries - the effective entries, in registration order.
 * @returns the same entries, ordered, each carrying the priority it ordered by.
 */
export function assignOrder(entries: readonly KeybindingEntry[]): readonly KeybindingEntry[] {
  return seedPrios(entries, entry => entry)
    .map(({ item, prio }) => ({ entry: item, rank: sourceRank(item.source), prio }))
    .sort((a, b) => a.rank - b.rank || a.prio - b.prio)
    .map(({ entry, prio }) => ({ ...entry, prio }))
}

/**
 * Each entry with the prio it orders by: the one it states, else its position
 * among the entries it can collide with. Prio only ever separates entries
 * sharing a (stroke, source), so seeding from the whole list would number
 * bindings that never compete and would leave a real collision undetectable,
 * every seeded value being distinct. Ordering and the settings page read this
 * one rule, so the value a row shows is the value a collision is settled with.
 *
 * A stated prio is the user's choice and stands; seeding fills the slots it
 * leaves, lowest first, so an unstated entry never lands on a claimed one.
 * Within a scope the values are therefore distinct unless two entries state
 * the same one, which is the single case an override-time check must refuse.
 * @param items - whatever carries the entries, in registration order.
 * @param entryOf - the entry an item carries.
 * @returns each item paired with its effective prio, order preserved.
 */
export function seedPrios<T>(
  items: readonly T[],
  entryOf: (item: T) => KeybindingEntry,
): readonly { item: T; prio: number }[] {
  const claimed = new Map<string, Set<number>>()
  for (const item of items) {
    const entry = entryOf(item)
    if (entry.prio === undefined) continue
    const scope = collisionScope(entry)
    claimed.set(scope, (claimed.get(scope) ?? new Set()).add(entry.prio))
  }

  const next = new Map<string, number>()

  return items.map((item) => {
    const entry = entryOf(item)
    if (entry.prio !== undefined) return { item, prio: entry.prio }

    const scope = collisionScope(entry)
    let slot = next.get(scope) ?? 0
    while (claimed.get(scope)?.has(slot) === true) slot += 1
    next.set(scope, slot + 1)

    return { item, prio: slot }
  })
}

/**
 * The scope a prio orders within: entries sharing one gesture and one source
 * are the only ones a priority ever separates.
 * @param entry - the effective entry.
 * @returns a stable key equal for entries that compete.
 */
export function collisionScope(entry: KeybindingEntry): string {
  return `${strokesKey(entry.strokes)}\u0000${entry.source}`
}

/**
 * Listen for window keydowns and dispatch them against the bindings in force.
 * Listening at the window rather than at a focused node is what makes a
 * binding a property of the application instead of a property of whatever
 * happens to hold focus; where a binding should not apply, its `when` clause
 * says so.
 * @param bindings - the overrides in force, re-read as they change.
 * @param actions - the registered actions, re-read as they change.
 * @param context - the state keys `when` clauses resolve against.
 * @returns a disposer that stops listening.
 */
export function createKeybindingDispatcher(
  bindings: SnapshotStore<readonly SourcedOverride[]>,
  actions: SnapshotStore<readonly UiActionDefinition[]>,
  context: ReadonlySnapshot<WhenContext>,
): () => void {
  const active = (entry: KeybindingEntry) => resolveWhen(entry.when, context.getSnapshot())
  const entries = () => assignOrder(effectiveEntries(actions.getSnapshot(), bindings.getSnapshot()))
  let matcher = new ChordMatcher<KeybindingEntry>(entries(), active)
  const rebuild = () => {
    matcher = new ChordMatcher<KeybindingEntry>(entries(), active)
  }
  const disposeBindings = bindings.subscribe(rebuild)
  const disposeActions = actions.subscribe(rebuild)
  // IME composition tracking: Safari delivers the closing keydown after
  // compositionend, so the clear is deferred one tick before the window sees
  // the keydown that commits the candidate.
  let composing = false
  let composingTimer: ReturnType<typeof setTimeout> | undefined
  const onCompositionStart = (): void => {
    composing = true
    if (composingTimer !== undefined) clearTimeout(composingTimer)
  }
  const onCompositionEnd = (): void => {
    composingTimer = setTimeout(() => { composing = false }, 10)
  }
  const onKeydown = (event: KeyboardEvent) => {
    dispatchKeydown(matcher, actions.getSnapshot(), event, composing)
  }
  window.addEventListener('keydown', onKeydown, { capture: true })
  window.addEventListener('compositionstart', onCompositionStart, { capture: true })
  window.addEventListener('compositionend', onCompositionEnd, { capture: true })
  return () => {
    disposeBindings()
    disposeActions()
    if (composingTimer !== undefined) clearTimeout(composingTimer)
    window.removeEventListener('keydown', onKeydown, { capture: true })
    window.removeEventListener('compositionstart', onCompositionStart, { capture: true })
    window.removeEventListener('compositionend', onCompositionEnd, { capture: true })
  }
}

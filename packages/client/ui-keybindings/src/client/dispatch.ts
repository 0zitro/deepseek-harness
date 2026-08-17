/** Keystroke dispatch: match keydowns against the persisted entries and run the matched action. */
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { ChordMatcher } from '../chord.ts'
import {
  isRecordableKey, keybindingOfDefault, sameKeybinding,
  type KeybindingDefault, type KeybindingEntry, type KeybindingKey, type KeybindingOverride,
  type KeybindingSource,
} from '../keybinding.ts'
import { evaluateWhen, parseWhenClause, type WhenContext } from '../when-clause.ts'
import type { UiActionId } from '../ui-action.ts'
import type { UiActionDefinition } from './action-registry.ts'
import type { ReadonlySnapshot } from './when-context.ts'

/** Run the action a matched entry references, if it is still registered. */
export function runMatched(matched: KeybindingEntry, actions: readonly UiActionDefinition[]): void {
  actions.find(action => action.id === matched.action)?.run()
}

/**
 * Whether a binding's `when` clause holds against the context. A clause that
 * is absent or blank states no predicate and is always active, which is how an
 * override clears the predicate its default carries.
 */
export function resolveWhen(when: string | undefined, context: WhenContext): boolean {
  if (when === undefined || when.trim() === '') return true
  try {
    return evaluateWhen(parseWhenClause(when), context)
  } catch {
    return false
  }
}

/** Feed one keydown into the matcher; run the action when a binding completes. */
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

/** The top-ranked override for (action, key): user > plugin > system, then registration. */
export function topOverride(
  overrides: readonly KeybindingOverride[],
  action: UiActionId,
  key: KeybindingKey,
): KeybindingOverride | undefined {
  let best: KeybindingOverride | undefined
  for (const override of overrides) {
    if (override.action !== action || override.key !== key) continue
    if (best === undefined || sourceRank(override.source) < sourceRank(best.source)) best = override
  }
  return best
}

/** Emit a default as a system-sourced effective entry. */
export function defaultEntry(def: KeybindingDefault, action: UiActionId): KeybindingEntry {
  return {
    strokes: def.strokes,
    action,
    source: 'system',
    ...(def.when === undefined ? {} : { when: def.when }),
  }
}

/** Merge one default with its top override, producing a full effective entry. */
export function mergeOverride(
  def: KeybindingDefault | undefined,
  action: UiActionId,
  override: KeybindingOverride,
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

/** The current default for (action, key), or undefined when it is unavailable. */
function findDefault(
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

/** The effective entries: each default merged with its top override, plus orphans resolved against their retained base. */
export function effectiveEntries(
  actions: readonly UiActionDefinition[],
  overrides: readonly KeybindingOverride[],
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

/** Cross-source dispatch rank: the user outranks plugins, which outrank the shipped defaults. */
export function sourceRank(source: KeybindingSource): number {
  if (source === 'user') return 0
  if (source === 'system') return 2
  return 1
}

/** Seed an absent prio by registration order and sort by source-rank → prio → registration. */
export function assignOrder(entries: readonly KeybindingEntry[]): readonly KeybindingEntry[] {
  return entries
    .map((entry, index) => ({ entry, rank: sourceRank(entry.source), prio: entry.prio ?? index }))
    .sort((a, b) => a.rank - b.rank || a.prio - b.prio)
    .map(({ entry, prio }) => ({ ...entry, prio }))
}

/** Stable (stroke, source) key for the prio-uniqueness scope. */
function strokeSourceKey(entry: KeybindingEntry): string {
  return `${JSON.stringify(entry.strokes)}\u0000${entry.source}`
}

/**
 * The effective entry clashing with `candidate` on the same (stroke, source)
 * and prio, excluding `action`'s own entries, or undefined. Operates over the
 * assignOrder output so a seeded prio is compared against a user-chosen one.
 */
export function findPrioClash(
  entries: readonly KeybindingEntry[],
  action: UiActionId,
  candidate: KeybindingEntry,
): KeybindingEntry | undefined {
  if (candidate.prio === undefined) return undefined
  const key = strokeSourceKey(candidate)
  return entries.find(entry =>
    entry.action !== action && strokeSourceKey(entry) === key && entry.prio === candidate.prio)
}

/** Listen for window keydowns and dispatch them against the effective bindings. */
export function createKeybindingDispatcher(
  bindings: SnapshotStore<readonly KeybindingOverride[]>,
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

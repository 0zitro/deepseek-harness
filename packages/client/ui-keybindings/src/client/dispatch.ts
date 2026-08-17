/** Keystroke dispatch: match keydowns against the persisted entries and run the matched action. */
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { ChordMatcher } from '../chord.ts'
import { isRecordableKey, type KeybindingEntry, type KeybindingSource } from '../keybinding.ts'
import { evaluateWhen, parseWhenClause, type WhenContext } from '../when-clause.ts'
import type { UiActionId } from '../ui-action.ts'
import type { UiActionDefinition } from './action-registry.ts'
import type { ReadonlySnapshot } from './when-context.ts'

/** Run the action a matched entry references, if it is still registered. */
export function runMatched(matched: KeybindingEntry, actions: readonly UiActionDefinition[]): void {
  actions.find(action => action.id === matched.action)?.run()
}

/** Whether a binding's `when` clause holds against the context; absent clauses are always active. */
export function resolveWhen(when: string | undefined, context: WhenContext): boolean {
  if (when === undefined) return true
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

/** The effective entries: every persisted override, else every default binding (system source). */
export function effectiveEntries(
  actions: readonly UiActionDefinition[],
  bindings: readonly KeybindingEntry[],
): readonly KeybindingEntry[] {
  const entries: KeybindingEntry[] = []
  for (const action of actions) {
    const overrides = bindings.filter(entry => entry.action === action.id)
    if (overrides.length > 0) {
      entries.push(...overrides)
    } else {
      for (const keybinding of action.defaultKeybindings ?? []) {
        entries.push({ ...keybinding, action: action.id, source: 'system' })
      }
    }
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
  bindings: SnapshotStore<readonly KeybindingEntry[]>,
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

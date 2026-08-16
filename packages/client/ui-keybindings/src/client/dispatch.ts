/** Keystroke dispatch: match keydowns against the persisted entries and run the matched action. */
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { ChordMatcher } from '../chord.ts'
import { isRecordableKey, type KeybindingEntry } from '../keybinding.ts'
import { evaluateWhen, parseWhenClause, type WhenContext } from '../when-clause.ts'
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
): void {
  /* v8 ignore next -- jsdom cannot synthesize isComposing on a native KeyboardEvent */
  if (event.isComposing) return
  if (event.repeat) return
  if (!isRecordableKey(event.key)) return
  const matched = matcher.feed(event)
  if (matched !== null) runMatched(matched, actions)
}

/** The effective entries: a persisted override, else the action's default binding. */
export function effectiveEntries(
  actions: readonly UiActionDefinition[],
  bindings: readonly KeybindingEntry[],
): readonly KeybindingEntry[] {
  const entries: KeybindingEntry[] = []
  for (const action of actions) {
    const override = bindings.find(entry => entry.action === action.id)
    if (override !== undefined) {
      entries.push(override)
    } else if (action.defaultKeybinding !== undefined) {
      entries.push({ ...action.defaultKeybinding, action: action.id })
    }
  }
  return entries
}

/** Listen for window keydowns and dispatch them against the effective bindings. */
export function createKeybindingDispatcher(
  bindings: SnapshotStore<readonly KeybindingEntry[]>,
  actions: SnapshotStore<readonly UiActionDefinition[]>,
  context: ReadonlySnapshot<WhenContext>,
): () => void {
  const active = (entry: KeybindingEntry) => resolveWhen(entry.when, context.getSnapshot())
  const entries = () => effectiveEntries(actions.getSnapshot(), bindings.getSnapshot())
  let matcher = new ChordMatcher<KeybindingEntry>(entries(), active)
  const rebuild = () => {
    matcher = new ChordMatcher<KeybindingEntry>(entries(), active)
  }
  const disposeBindings = bindings.subscribe(rebuild)
  const disposeActions = actions.subscribe(rebuild)
  const onKeydown = (event: KeyboardEvent) => {
    dispatchKeydown(matcher, actions.getSnapshot(), event)
  }
  window.addEventListener('keydown', onKeydown, { capture: true })
  return () => {
    disposeBindings()
    disposeActions()
    window.removeEventListener('keydown', onKeydown, { capture: true })
  }
}

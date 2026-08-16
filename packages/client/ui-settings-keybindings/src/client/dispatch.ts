/** Keystroke dispatch: match keydowns against the persisted entries and run the matched action. */
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { ChordMatcher } from '../chord.ts'
import { isRecordableKey, type KeybindingEntry } from '../keybinding.ts'
import type { UiActionDefinition } from './action-registry.ts'

/** Run the action a matched entry references, if it is still registered. */
export function runMatched(matched: KeybindingEntry, actions: readonly UiActionDefinition[]): void {
  actions.find(action => action.id === matched.action)?.run()
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

/** Every binding is active until `when` resolution lands in a later change. */
const alwaysActive = () => true

/** Listen for window keydowns and dispatch them against the persisted bindings. */
export function createKeybindingDispatcher(
  bindings: SnapshotStore<readonly KeybindingEntry[]>,
  actions: SnapshotStore<readonly UiActionDefinition[]>,
): () => void {
  let matcher = new ChordMatcher<KeybindingEntry>(bindings.getSnapshot(), alwaysActive)
  const disposeBindings = bindings.subscribe(() => {
    matcher = new ChordMatcher<KeybindingEntry>(bindings.getSnapshot(), alwaysActive)
  })
  const onKeydown = (event: KeyboardEvent) => {
    dispatchKeydown(matcher, actions.getSnapshot(), event)
  }
  window.addEventListener('keydown', onKeydown, { capture: true })
  return () => {
    disposeBindings()
    window.removeEventListener('keydown', onKeydown, { capture: true })
  }
}

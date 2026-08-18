/**
 * Reordering a collision scope by stating one priority.
 *
 * Typing a number is the only way to reorder a scope until columns can be
 * sorted and rows dragged, so a stated priority reads as "put this binding
 * here" rather than as a claim that may be refused: the binding takes the
 * value and everything that ordered at or after it moves one place back.
 *
 * Only bindings whose merged source is the user's share the scope of a binding
 * the user just edited, and each of those already has a stored override, so a
 * shift rewrites overrides that exist and never invents one for a shipped or
 * plugin-contributed binding. Seeded values need no rewrite at all: seeding
 * fills the slots a stated value leaves.
 */
import type { KeybindingOverrideRef } from '../keybinding.ts'
import type { UiActionId } from '../ui-action.ts'
import { collisionScope } from './dispatch.ts'
import type { EffectiveRow, KeybindingRow } from './rows.ts'

/** What one override's priority becomes; `undefined` retires it. */
export interface PrioAssignment {
  ref: KeybindingOverrideRef
  prio: number | undefined
}

/**
 * The priorities a scope holds once `target` is stated for `candidate`.
 *
 * A binding whose command is unavailable cannot use a place in the order, so
 * it retires its priority instead of taking one — the lazy half of the
 * collision rules, paid at the moment a clash would otherwise be created.
 * @param rows - every effective binding, as the edit would leave them.
 * @param candidate - the binding the user is placing.
 * @param target - the priority the user stated.
 * @param achievable - whether an action is registered and can therefore fire.
 * @returns one assignment per override the write must touch.
 */
export function insertPrio(
  rows: readonly KeybindingRow[],
  candidate: EffectiveRow,
  target: number,
  achievable: (action: UiActionId) => boolean,
): readonly PrioAssignment[] {
  const scope = collisionScope(candidate.entry)
  // A superseded binding cannot fire, so it holds no place to be moved out of.
  const displaced = rows.filter((row): row is EffectiveRow =>
    row !== candidate && !row.superseded && row.prio >= target
    && collisionScope(row.entry) === scope)

  return [
    { ref: { action: candidate.action, key: candidate.key }, prio: target },
    ...displaced.map(row => ({
      ref: { action: row.action, key: row.key },
      prio: achievable(row.action) ? row.prio + 1 : undefined,
    })),
  ]
}

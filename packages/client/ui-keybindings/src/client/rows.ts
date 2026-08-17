/**
 * The settings page's view of the effective bindings.
 *
 * Dispatch needs only the merged entry; the page also needs to say where each
 * field came from — an overridden field is the user's, an absent one still
 * follows its default — and needs the identity and base snapshot an edit
 * writes against. This projection carries both, in the order dispatch resolves
 * them, so the prio a row shows is the prio a collision is settled with.
 */
import {
  keybindingKey, keybindingOfDefault,
  type Keybinding, type KeybindingEntry, type KeybindingKey, type KeybindingOverride,
} from '../keybinding.ts'
import type { UiActionId } from '../ui-action.ts'
import type { UiActionDefinition } from './action-registry.ts'
import { defaultEntry, findDefault, mergeOverride, seededPrio, topOverride } from './dispatch.ts'

/** Which of an override's fields the override states itself. */
export interface KeybindingProvenance {
  strokes: boolean
  when: boolean
  prio: boolean
}

/** One row of the keybindings table: an effective binding and its provenance. */
export interface KeybindingRow {
  /** The action the binding invokes. */
  action: UiActionId
  /** The action's label, or its id when no registration supplies one. */
  label: string
  /** The action's own description, when its registration carries one. */
  description?: string
  /** Identity of the default this row's override merges into. */
  key: KeybindingKey
  /** The snapshot an edit writes as the override's base. */
  base: Keybinding
  /** The merged gesture, clause, and source. */
  entry: KeybindingEntry
  /** The prio this row orders by, seeded from its position when unstated. */
  prio: number
  /** Fields the override states; the rest follow the base. */
  overridden: KeybindingProvenance
}

/** Which fields an override states, or none at all when there is no override. */
function provenanceOf(override: KeybindingOverride | undefined): KeybindingProvenance {
  return {
    strokes: override?.strokes !== undefined,
    when: override?.when !== undefined,
    prio: override?.prio !== undefined,
  }
}

/** Dot-delimited segments compare in order, so a whole segment sorts before its suffixes. */
export function compareActionIds(left: string, right: string): number {
  const leftParts = left.split('.')
  const rightParts = right.split('.')

  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index++) {
    const compared = (leftParts[index] ?? '').localeCompare(rightParts[index] ?? '')
    if (compared !== 0) return compared
  }
  return 0
}

/**
 * Every effective binding as a row, grouped by action and ordered by the
 * action's dot-delimited segments so one command's rows stay adjacent.
 * @param actions - the registered actions, holding labels and defaults.
 * @param overrides - the stored overrides.
 * @returns one row per effective binding.
 */
export function keybindingRows(
  actions: readonly UiActionDefinition[],
  overrides: readonly KeybindingOverride[],
): readonly KeybindingRow[] {
  const rows: KeybindingRow[] = []

  for (const definition of actions) {
    const shipped = definition.defaultKeybindings ?? []
    // An action shipping no default still gets a row, keyed by its own id, or
    // there would be no seat in which to bind it.
    const defaults = shipped.length > 0 ? shipped : [{ key: keybindingKey(definition.id), strokes: [] }]

    for (const def of defaults) {
      const override = topOverride(overrides, definition.id, def.key)
      rows.push({
        action: definition.id,
        label: definition.label,
        ...definition.description === undefined ? {} : { description: definition.description },
        key: def.key,
        base: keybindingOfDefault(def),
        entry: override === undefined ? defaultEntry(def, definition.id) : mergeOverride(def, definition.id, override),
        prio: 0,
        overridden: provenanceOf(override),
      })
    }
  }

  // An override whose default is unavailable still dispatches, so it still
  // shows: against its retained base, and labelled by its action when one is
  // registered under a different key.
  for (const override of overrides) {
    if (findDefault(actions, override.action, override.key) !== undefined) continue
    rows.push({
      action: override.action,
      label: actions.find(candidate => candidate.id === override.action)?.label ?? override.action,
      key: override.key,
      base: override.base,
      entry: mergeOverride(undefined, override.action, override),
      prio: 0,
      overridden: provenanceOf(override),
    })
  }

  // Seeding reads the position in the effective list, so it happens before the
  // display sort; sorting after keeps one command's rows together.
  return rows
    .map((row, index) => ({ ...row, prio: seededPrio(row.entry.prio, index) }))
    .sort((left, right) => compareActionIds(left.action, right.action))
}

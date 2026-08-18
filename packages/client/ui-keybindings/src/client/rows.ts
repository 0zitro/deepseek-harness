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
  type Keybinding, type KeybindingEntry, type KeybindingKey, type SourcedOverride,
} from '../keybinding.ts'
import type { UiActionId } from '../ui-action.ts'
import type { UiActionDefinition } from './action-registry.ts'
import { defaultEntry, mergeOverride, seedPrios, topOverride } from './dispatch.ts'

/** Which of an override's fields the override states itself. */
export interface KeybindingProvenance {
  strokes: boolean
  when: boolean
  prio: boolean
}

/** What every row of the table carries, whether or not its binding dispatches. */
interface RowFields {
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
  /** Fields the override states; the rest follow the base. */
  overridden: KeybindingProvenance
}

/** The binding a seat dispatches, at the place it holds among its competitors. */
export interface EffectiveRow extends RowFields {
  superseded: false
  prio: number
}

/**
 * A binding an override took the seat of. It stays on the page because it is
 * what the override departs from and what returns if the override goes, and it
 * is inert: nothing dispatches it, so it holds no place in any order.
 */
export interface SupersededRow extends RowFields {
  superseded: true
  prio?: undefined
}

/** One row of the keybindings table: one contribution to one seat. */
export type KeybindingRow = EffectiveRow | SupersededRow

/**
 * What separates a forked seat's key from the seat it forked off. A registrar
 * writes dotted identifiers, so a key carrying this could not have been
 * shipped: the two kinds of key share one namespace and still cannot collide.
 */
const FORK_SIGIL = '#'

/**
 * The key a binding forked from `origin` takes: the same family as the seat it
 * stems from, at the first number that family has free. Forking a fork stays
 * in the family rather than nesting, so one shipped seat's additions read as
 * one series.
 * @param rows - every row of the table, holding the keys already in use.
 * @param origin - the row the new binding forks from.
 * @returns a key no seat of that action holds.
 */
export function forkedKey(rows: readonly KeybindingRow[], origin: KeybindingRow): KeybindingKey {
  const forked = origin.key.indexOf(FORK_SIGIL)
  const family = forked === -1 ? origin.key : origin.key.slice(0, forked)
  const taken = new Set(rows.filter(row => row.action === origin.action).map(row => String(row.key)))

  let ordinal = 1
  while (taken.has(`${family}${FORK_SIGIL}${ordinal}`)) ordinal += 1
  return keybindingKey(`${family}${FORK_SIGIL}${ordinal}`)
}

/** The seat a row stands in: one default of one action. */
function seat(action: UiActionId, key: KeybindingKey): string {
  return `${action} ${key}`
}

/** Which fields an override states, or none at all when there is no override. */
function provenanceOf(override: SourcedOverride | undefined): KeybindingProvenance {
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
  overrides: readonly SourcedOverride[],
): readonly KeybindingRow[] {
  const dispatching: Omit<EffectiveRow, 'prio'>[] = []
  // The binding each seat ships, where an override took the seat from it.
  const shipped = new Map<string, SupersededRow>()
  // The seats a row already stands in. An override is an orphan when no row
  // took it, which is not the same question as whether its action still ships
  // a default: an action shipping none is given a seat here, and asking the
  // registrations instead would answer no and show the override twice.
  const taken = new Set<string>()

  for (const definition of actions) {
    const declared = definition.defaultKeybindings ?? []
    // An action shipping no default still gets a row, keyed by its own id, or
    // there would be no seat in which to bind it.
    const defaults = declared.length > 0 ? declared : [{ key: keybindingKey(definition.id), strokes: [] }]

    for (const def of defaults) {
      const override = topOverride(overrides, definition.id, def.key)
      const seated = seat(definition.id, def.key)
      taken.add(seated)

      const fields = {
        action: definition.id,
        label: definition.label,
        ...definition.description === undefined ? {} : { description: definition.description },
        key: def.key,
        base: keybindingOfDefault(def),
        entry: defaultEntry(def, definition.id),
      }

      // An override does not replace what the seat ships; it takes the seat
      // from it, and both are contributions the page shows. A seat that ships
      // no gesture has nothing to show above the override: what it would draw
      // is the seat itself, not a binding.
      if (override !== undefined && def.strokes.length > 0) {
        shipped.set(seated, { ...fields, overridden: provenanceOf(undefined), superseded: true })
      }
      dispatching.push({
        ...fields,
        ...override === undefined ? {} : { entry: mergeOverride(def, definition.id, override) },
        overridden: provenanceOf(override),
        superseded: false,
      })
    }
  }

  // An override whose default is unavailable still dispatches, so it still
  // shows: against its retained base, and labelled by its action when one is
  // registered under a different key.
  for (const override of overrides) {
    if (taken.has(seat(override.action, override.key))) continue
    dispatching.push({
      action: override.action,
      label: actions.find(candidate => candidate.id === override.action)?.label ?? override.action,
      key: override.key,
      base: override.base,
      entry: mergeOverride(undefined, override.action, override),
      overridden: provenanceOf(override),
      superseded: false,
    })
  }

  // Seeding reads each entry's position among the ones it can collide with, so
  // it runs over the rows in registration order; sorting after keeps one
  // command's rows together without disturbing the values.
  return seedPrios(dispatching, row => row.entry)
    .map(({ item, prio }) => ({ ...item, prio }))
    .sort((left, right) => compareActionIds(left.action, right.action))
    .flatMap((row) => {
      // What a seat ships stands directly above the contribution that took it.
      const above = shipped.get(seat(row.action, row.key))
      return above === undefined ? [row] : [above, row]
    })
}

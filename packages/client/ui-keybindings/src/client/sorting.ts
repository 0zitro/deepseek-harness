/**
 * The keybindings table's columns: what each one reads, and how that kind of
 * value orders.
 *
 * The ordering machinery itself is generic and lives in the primitives; what
 * belongs here is the domain — a gesture orders by the key it ends on, a
 * source by precedence rather than by alphabet, a place in an order counts
 * from the binding that wins.
 */
import { byText, orderedBy, type Ordering, type TableColumn } from '@deepseek-ai/dsh-client-ui-primitives'
import { sourceRank } from './dispatch.ts'
import { compareActionIds, type KeybindingRow } from './rows.ts'
import { canonicalModifiers, type KeybindingSource, type KeyStroke } from '../keybinding.ts'
import type { KeybindingsKey } from './locales.ts'

/** A dotted identifier orders segment by segment, so a namespace stays together. */
const identifier: Ordering<string> = {
  compare: compareActionIds,
  natural: 'asc',
}

/**
 * A place in an order counts from the binding that wins, so ascending is toward
 * it. A superseded binding holds no place, and reads after every binding that
 * holds one — a sentinel rather than an infinity, which would compare as NaN
 * against itself and leave two placeless rows unordered.
 */
const place: Ordering<number | undefined> = {
  compare: (left, right) => placeOf(left) - placeOf(right),
  natural: 'asc',
}

/** Where a row reads when it holds no place. */
function placeOf(prio: number | undefined): number {
  return prio ?? Number.MAX_SAFE_INTEGER
}

/**
 * A gesture reads by the key it ends on, so every binding on one key gathers
 * whatever modifiers it holds and the modifiers only separate them. That is
 * the reading a search wants; identity spells the modifiers first instead.
 */
const gesture: Ordering<readonly KeyStroke[]> = {
  compare: (left, right) => byKey(left).localeCompare(byKey(right)),
  natural: 'asc',
}

/** A gesture spelled key first, so one key's bindings sort together. */
function byKey(strokes: readonly KeyStroke[]): string {
  return strokes.map(stroke => [stroke.key, ...canonicalModifiers(stroke)].join('+')).join(' ')
}

/** A source orders by precedence, not by alphabet: the user's own first. */
const precedence: Ordering<KeybindingSource> = {
  compare: (left, right) => sourceRank(left) - sourceRank(right),
  natural: 'asc',
}

/** A column of this table: an ordered column that also names its heading. */
export interface SortableColumn extends TableColumn<KeybindingRow> {
  /** Dictionary key of the column heading. */
  label: KeybindingsKey
  /**
   * How wide it would like to be, relative to the rest. It is declared with
   * the column rather than beside it, so a column cannot come into being
   * without one and nothing has to decide what a column with none should get.
   */
  share: number
}

/**
 * A column, as this table declares one: where it reads its value, how that
 * kind of value orders, and what its heading says.
 * @param id - stable column key.
 * @param label - dictionary key of the heading.
 * @param share - how wide it would like to be, relative to the rest.
 * @param ordering - how this kind of value orders.
 * @param valueOf - where a row carries this column's value.
 * @returns the column, comparing rows by that value.
 */
function sortable<T>(
  id: string,
  label: KeybindingsKey,
  share: number,
  ordering: Ordering<T>,
  valueOf: (row: KeybindingRow) => T,
): SortableColumn {
  return { ...orderedBy(id, ordering, valueOf), label, share }
}

/** The table's columns, in render order. */
export const COLUMNS: readonly SortableColumn[] = [
  sortable('command', 'column.command', 1.7, identifier, row => row.action),
  sortable('stroke', 'column.stroke', 1.1, gesture, row => row.entry.strokes),
  sortable('when', 'column.when', 1.9, byText, row => row.entry.when ?? ''),
  sortable('prio', 'column.prio', 0.5, place, row => row.prio),
  sortable('source', 'column.source', 0.6, precedence, row => row.entry.source),
]

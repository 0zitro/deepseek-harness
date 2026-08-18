/**
 * Sorting the keybindings table.
 *
 * A column does not carry a comparison; it declares which kind of value it
 * holds, and the kind carries the ordering. That keeps the comparisons where
 * their meaning is — a gesture orders by the key it ends on, a source by
 * precedence rather than by alphabet — and it keeps a column declaration to
 * the one thing only the column knows: where to read its value.
 *
 * Each kind also states the direction a first click takes, because ascending
 * is not always the useful reading: priority ascends toward the binding that
 * wins, and a source ascends toward the user's own.
 */
import { sourceRank } from './dispatch.ts'
import { compareActionIds, type KeybindingRow } from './rows.ts'
import { canonicalModifiers, type KeybindingSource, type KeyStroke } from '../keybinding.ts'
import type { KeybindingsKey } from './locales.ts'

/** Which way a sort reads. */
export type SortDirection = 'asc' | 'desc'

/** How one kind of value orders, and the direction that reads naturally for it. */
export interface Ordering<T> {
  /** Ascending comparison, as `Array.prototype.sort` expects. */
  compare: (left: T, right: T) => number
  /** The direction a first click takes on a column of this kind. */
  natural: SortDirection
}

/** Prose orders by the reader's locale. */
const text: Ordering<string> = {
  compare: (left, right) => left.localeCompare(right),
  natural: 'asc',
}

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

/** A column of the table, with the ordering its kind of value defines. */
export interface SortableColumn {
  /** Stable column key, used by the sort state and as a React key. */
  id: string
  /** Dictionary key of the column heading. */
  label: KeybindingsKey
  /** The direction a first click on this column takes. */
  natural: SortDirection
  /** Ascending comparison of two rows by this column's value. */
  compare: (left: KeybindingRow, right: KeybindingRow) => number
}

/**
 * Bind where a column reads its value to how that kind of value orders. The
 * type parameter exists only to prove the two agree; it is consumed here, so
 * the columns are one homogeneous list rather than a family of shapes.
 * @param id - stable column key.
 * @param label - dictionary key of the heading.
 * @param ordering - how this kind of value orders.
 * @param valueOf - where a row carries this column's value.
 * @returns the column, comparing rows by that value.
 */
function sortable<T>(
  id: string,
  label: KeybindingsKey,
  ordering: Ordering<T>,
  valueOf: (row: KeybindingRow) => T,
): SortableColumn {
  return {
    id,
    label,
    natural: ordering.natural,
    compare: (left, right) => ordering.compare(valueOf(left), valueOf(right)),
  }
}

/** The table's columns, in render order. */
export const COLUMNS: readonly SortableColumn[] = [
  sortable('command', 'column.command', identifier, row => row.action),
  sortable('stroke', 'column.stroke', gesture, row => row.entry.strokes),
  sortable('when', 'column.when', text, row => row.entry.when ?? ''),
  sortable('prio', 'column.prio', place, row => row.prio),
  sortable('source', 'column.source', precedence, row => row.entry.source),
]

/** One column's contribution to the order, most significant first. */
export interface ColumnSort {
  id: string
  direction: SortDirection
}

/** The other way round. */
function opposite(direction: SortDirection): SortDirection {
  return direction === 'asc' ? 'desc' : 'asc'
}

/**
 * A click sorts by a column: the first one in the kind's natural direction,
 * a later one the other way round. Columns accumulate in click order, so the
 * first column clicked stays the most significant.
 * @param sorts - the order in force.
 * @param column - the column clicked.
 * @returns the order after the click.
 */
export function toggleSort(sorts: readonly ColumnSort[], column: SortableColumn): readonly ColumnSort[] {
  const sorted = sorts.find(sort => sort.id === column.id)
  if (sorted === undefined) return [...sorts, { id: column.id, direction: column.natural }]

  return sorts.map(sort => sort.id === column.id ? { ...sort, direction: opposite(sort.direction) } : sort)
}

/**
 * A double click drops a column out of the order. The clicks that compose it
 * toggle the column first, which the drop then discards, so no click has to
 * be held back to find out which gesture it belongs to.
 * @param sorts - the order in force.
 * @param id - the column double-clicked.
 * @returns the order without that column.
 */
export function dropSort(sorts: readonly ColumnSort[], id: string): readonly ColumnSort[] {
  return sorts.filter(sort => sort.id !== id)
}

/**
 * The rows in the order the sorted columns describe. Sorting is stable, so
 * rows the order does not separate keep the arrangement they arrived in —
 * grouped by command, which is what keeps one command's rows adjacent.
 * @param rows - the rows to order.
 * @param sorts - the order in force, most significant first.
 * @param columns - the columns the ids refer to.
 * @returns the ordered rows, or the given ones when nothing is sorted.
 */
export function sortRows(
  rows: readonly KeybindingRow[],
  sorts: readonly ColumnSort[],
  columns: readonly SortableColumn[] = COLUMNS,
): readonly KeybindingRow[] {
  const active = sorts.flatMap((sort) => {
    const column = columns.find(candidate => candidate.id === sort.id)
    return column === undefined ? [] : [{ column, sign: sort.direction === 'desc' ? -1 : 1 }]
  })
  if (active.length === 0) return rows

  return [...rows].sort((left, right) => {
    for (const { column, sign } of active) {
      const compared = column.compare(left, right) * sign
      if (compared !== 0) return compared
    }
    return 0
  })
}

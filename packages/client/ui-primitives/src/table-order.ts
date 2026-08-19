/**
 * Ordering a table's rows by its columns.
 *
 * A column does not carry a comparison; it declares which kind of value it
 * holds, and the kind carries the ordering. That keeps a comparison where its
 * meaning is — whatever "in order" means for durations, versions, or
 * precedence lives with that kind rather than with the column showing it — and
 * it leaves a column declaration stating the one thing only the column knows:
 * where its value is read from.
 *
 * A kind also states the direction a first click takes, because ascending is
 * not always the useful reading. A rank ascends toward first place; a duration
 * usually wants its longest first.
 */

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
export const byText: Ordering<string> = {
  compare: (left, right) => left.localeCompare(right),
  natural: 'asc',
}

/**
 * A column, as ordering needs to know it. A consumer's own column type extends
 * this with whatever it takes to draw a heading, which is no business of the
 * ordering.
 */
export interface TableColumn<Row> {
  /** Stable column key, which the sort state names and React keys by. */
  id: string
  /** The direction a first click on this column takes. */
  natural: SortDirection
  /** Ascending comparison of two rows by this column's value. */
  compare: (left: Row, right: Row) => number
}

/**
 * Bind where a column reads its value to how that kind of value orders.
 *
 * The value's type is consumed here, which is the point: it proves the reader
 * and the ordering agree, and leaves the columns one homogeneous list rather
 * than a family of shapes no array can hold.
 * @param id - stable column key.
 * @param ordering - how this kind of value orders.
 * @param valueOf - where a row carries this column's value.
 * @returns the column, comparing rows by that value.
 */
export function orderedBy<Row, T>(
  id: string,
  ordering: Ordering<T>,
  valueOf: (row: Row) => T,
): TableColumn<Row> {
  return {
    id,
    natural: ordering.natural,
    compare: (left, right) => ordering.compare(valueOf(left), valueOf(right)),
  }
}

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
 * A click sorts by a column: the first one in the kind's natural direction, a
 * later one the other way round. Columns accumulate in click order, so the
 * first column clicked stays the most significant.
 * @param sorts - the order in force.
 * @param column - the column clicked.
 * @returns the order after the click.
 */
export function toggleSort<Row>(
  sorts: readonly ColumnSort[],
  column: TableColumn<Row>,
): readonly ColumnSort[] {
  const sorted = sorts.find(sort => sort.id === column.id)
  if (sorted === undefined) return [...sorts, { id: column.id, direction: column.natural }]

  return sorts.map(sort => sort.id === column.id ? { ...sort, direction: opposite(sort.direction) } : sort)
}

/**
 * Drop a column out of the order. A double click is the usual way to ask: the
 * clicks composing it toggle the column first, which the drop then discards,
 * so no click has to be held back to find out which gesture it belongs to.
 * @param sorts - the order in force.
 * @param id - the column to drop.
 * @returns the order without that column.
 */
export function dropSort(sorts: readonly ColumnSort[], id: string): readonly ColumnSort[] {
  return sorts.filter(sort => sort.id !== id)
}

/**
 * The rows in the order the sorted columns describe.
 *
 * Sorting is stable, so rows the order does not separate keep the arrangement
 * they arrived in — which is what lets a caller group its rows first and have
 * that grouping survive every order that does not contradict it. A sort naming
 * a column that is not there contributes nothing rather than failing: the sort
 * state outlives any one set of columns.
 * @param rows - the rows to order.
 * @param sorts - the order in force, most significant first.
 * @param columns - the columns the ids refer to.
 * @returns the ordered rows, or the given ones when nothing is sorted.
 */
export function sortRows<Row>(
  rows: readonly Row[],
  sorts: readonly ColumnSort[],
  columns: readonly TableColumn<Row>[],
): readonly Row[] {
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

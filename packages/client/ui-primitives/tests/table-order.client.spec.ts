import { describe, expect, it } from 'vitest'
import {
  byText, dropSort, orderedBy, sortRows, toggleSort, type ColumnSort, type Ordering,
} from '../src/table-order.ts'

interface Run {
  name: string
  seconds: number
}

/** A duration reads longest first, which is the point of a natural direction. */
const byDuration: Ordering<number> = {
  compare: (left, right) => left - right,
  natural: 'desc',
}

const name = orderedBy<Run, string>('name', byText, run => run.name)
const took = orderedBy<Run, number>('took', byDuration, run => run.seconds)
const COLUMNS = [name, took]

const RUNS: readonly Run[] = [
  { name: 'build', seconds: 30 },
  { name: 'test', seconds: 30 },
  { name: 'lint', seconds: 5 },
]

const order = (...sorts: ColumnSort[]) => sortRows(RUNS, sorts, COLUMNS).map(run => run.name)

describe('orderedBy', () => {
  it('takes its direction from the kind of value, not from the column', () => {
    expect([name.natural, took.natural]).toEqual(['asc', 'desc'])
  })

  it('compares rows by the value it was told to read', () => {
    const [first, second] = RUNS as [Run, Run]
    expect(took.compare(first, second)).toBe(0)
    expect(name.compare(first, second)).toBeLessThan(0)
  })
})

describe('sortRows', () => {
  it('returns the rows it was given when nothing orders them', () => {
    expect(sortRows(RUNS, [], COLUMNS)).toBe(RUNS)
  })

  it('orders by one column', () => {
    expect(order({ id: 'name', direction: 'asc' })).toEqual(['build', 'lint', 'test'])
  })

  it('reverses a column without disturbing which column decides', () => {
    expect(order({ id: 'name', direction: 'desc' })).toEqual(['test', 'lint', 'build'])
  })

  it('consults a later column only where every earlier one ties', () => {
    expect(order({ id: 'took', direction: 'asc' }, { id: 'name', direction: 'desc' }))
      .toEqual(['lint', 'test', 'build'])
  })

  it('keeps the arrangement it was given where every sorted column ties', () => {
    // Stability is what lets a caller group its rows first: an order that does
    // not contradict the grouping leaves it standing.
    expect(order({ id: 'took', direction: 'desc' })).toEqual(['build', 'test', 'lint'])
  })

  it('ignores a sort naming a column that is not there', () => {
    // The sort state outlives any one set of columns, so a stale id is a sort
    // that contributes nothing rather than a failure.
    expect(order({ id: 'gone', direction: 'asc' })).toEqual(['build', 'test', 'lint'])
    expect(sortRows(RUNS, [{ id: 'gone', direction: 'asc' }], COLUMNS)).toBe(RUNS)
  })
})

describe('toggleSort', () => {
  it('adds a column in the direction its kind reads naturally', () => {
    expect(toggleSort([], took)).toEqual([{ id: 'took', direction: 'desc' }])
  })

  it('reverses a column already in the order, keeping its place', () => {
    const sorts = toggleSort(toggleSort([], name), took)
    expect(toggleSort(sorts, name)).toEqual([
      { id: 'name', direction: 'desc' },
      { id: 'took', direction: 'desc' },
    ])
  })

  it('returns to the natural direction on a third click', () => {
    const once = toggleSort([], took)
    const twice = toggleSort(once, took)
    expect([once[0]?.direction, twice[0]?.direction, toggleSort(twice, took)[0]?.direction])
      .toEqual(['desc', 'asc', 'desc'])
  })

  it('accumulates columns in click order, so the first clicked stays first', () => {
    expect(toggleSort(toggleSort([], took), name).map(sort => sort.id)).toEqual(['took', 'name'])
  })
})

describe('dropSort', () => {
  it('removes one column and leaves the rest in order', () => {
    const sorts = toggleSort(toggleSort([], took), name)
    expect(dropSort(sorts, 'took')).toEqual([{ id: 'name', direction: 'asc' }])
  })

  it('leaves an order that never held the column alone', () => {
    expect(dropSort([{ id: 'name', direction: 'asc' }], 'gone'))
      .toEqual([{ id: 'name', direction: 'asc' }])
  })
})

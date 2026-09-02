import { describe, expect, it } from 'vitest'
import { runId, runsBy, runsWithin, tableRunRows } from '../src/table-runs.ts'

interface Entry {
  command: string
  gesture: string
}

const entry = (command: string, gesture: string): Entry => ({ command, gesture })
const byCommand = (row: Entry) => row.command
const shape = <Row>(rows: readonly Row[], keyOf: (row: Row) => string) =>
  runsBy(rows, keyOf).map(run => `${runId(run)}@${run.start}+${run.rows.length}`)

describe('runsBy', () => {
  it('gathers adjacent rows sharing a key, and no others', () => {
    const rows = [entry('rename', 'r1'), entry('rename', 'r2'), entry('save', 's1')]

    expect(shape(rows, byCommand)).toEqual(['0:rename@0+2', '0:save@2+1'])
  })

  it('reads one key twice where the order puts it in two places', () => {
    // An order that interleaves two keys is the reader's; a presentation that
    // gathered the scattered rows into one cell would misreport it.
    const rows = [entry('rename', 'r1'), entry('save', 's1'), entry('rename', 'r2'), entry('save', 's2')]

    expect(shape(rows, byCommand)).toEqual(['0:rename@0+1', '0:save@1+1', '1:rename@2+1', '1:save@3+1'])
  })

  it('numbers a key\'s runs without any regard to what other keys do', () => {
    const rows = [entry('a', ''), entry('b', ''), entry('a', ''), entry('c', ''), entry('a', '')]

    // `a` counts its own runs; `b` and `c` appearing between them changes none
    // of those numbers, which is what makes an identity survive an edit
    // elsewhere in the table.
    expect(shape(rows, byCommand)).toEqual(['0:a@0+1', '0:b@1+1', '1:a@2+1', '0:c@3+1', '2:a@4+1'])
  })

  it('is total in both directions', () => {
    expect(runsBy([], byCommand)).toEqual([])

    const rows = [entry('a', ''), entry('a', ''), entry('b', '')]
    expect(runsBy(rows, byCommand).flatMap(run => run.rows)).toEqual(rows)
  })

  it('keeps the rows of a run in the order it was given them', () => {
    const rows = [entry('a', 'first'), entry('a', 'second'), entry('a', 'third')]

    expect(runsBy(rows, byCommand)[0]?.rows.map(row => row.gesture)).toEqual(['first', 'second', 'third'])
  })
})

describe('runId', () => {
  it('names a run by its key and which of that key\'s runs it is', () => {
    expect(runsBy([entry('a', ''), entry('b', ''), entry('a', '')], byCommand).map(runId))
      .toEqual(['0:a', '0:b', '1:a'])
  })

  it('stays injective over keys that spell the separator themselves', () => {
    // The ordinal comes first because an ordinal spells no separator: a key
    // free to spell one cannot collide with a neighbour by spelling it.
    const rows = [entry('0:a', ''), entry('b', ''), entry('0:a', '')]

    expect(new Set(runsBy(rows, byCommand).map(runId)).size).toBe(3)
  })
})

describe('runsWithin', () => {
  it('breaks the inner runs where the outer runs break', () => {
    const rows = [
      entry('rename', 'ctrl'), entry('rename', 'ctrl'), entry('rename', 'alt'),
      entry('save', 'ctrl'),
    ]
    const inner = runsWithin(runsBy(rows, byCommand), row => row.gesture)

    // The last `ctrl` belongs to `save`, so it is a run of its own however
    // much it looks like the two above it.
    expect(inner.map(run => `${runId(run)}@${run.start}+${run.rows.length}`))
      .toEqual(['0:ctrl@0+2', '0:alt@2+1', '1:ctrl@3+1'])
  })

  it('counts its positions and its ordinals across the whole presentation', () => {
    const rows = [entry('a', 'x'), entry('b', 'x'), entry('b', 'y')]
    const inner = runsWithin(runsBy(rows, byCommand), row => row.gesture)

    // Not within the outer run: these are what the whole table places and keys
    // by, so an inner run's start is where it stands on the page.
    expect(inner.map(run => [run.key, run.ordinal, run.start])).toEqual([['x', 0, 0], ['x', 1, 1], ['y', 0, 2]])
  })

  it('is nothing inside nothing', () => {
    expect(runsWithin([], byCommand)).toEqual([])
  })
})

describe('tableRunRows', () => {
  it('places a run under however many rows come before the first', () => {
    const runs = runsBy([entry('a', ''), entry('a', ''), entry('b', '')], byCommand)

    // Two heading rows here, which is a caller's fact and not this module's to
    // assume.
    expect(runs.map(run => tableRunRows(3, run))).toEqual(['3 / span 2', '5 / span 1'])
  })
})

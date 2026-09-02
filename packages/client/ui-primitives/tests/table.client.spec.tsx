// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import {
  minContentWidth, settledWidths, showsItsContent, Table, TableGroup, tableColumnLine, tableLaneLine,
} from '../src/Table.tsx'

afterEach(cleanup)

const COLUMNS = [
  { id: 'command', share: 2 },
  { id: 'key', share: 1 },
  { id: 'source', share: 1 },
]

/**
 * jsdom lays nothing out, so what the suite can hold is the coordinate system
 * the table publishes and the markup it is expressed in. Whether a track
 * resolves to the pixels it should is measured in a browser and recorded in
 * the Agent Note.
 */
/** A lane, as the table spells one: the grip, plus any gutter beside it. */
const lane = (index: number) =>
  `calc(var(--dsh-table-lane-${index}, var(--dsh-table-lane))`
  + ` + var(--dsh-table-gutter-${index}, var(--dsh-table-gutter)))`

function mount(widths?: readonly number[]) {
  const view = render(
    <Table columns={COLUMNS} className="mine" {...(widths === undefined ? {} : { widths })}>
      {COLUMNS.map((column, index) => (
        <div key={column.id} data-table-column={column.id} style={{ gridColumn: tableColumnLine(index) }}>
          {column.id}
        </div>
      ))}
    </Table>,
  )
  return view.container.firstElementChild as HTMLElement
}

describe('Table', () => {
  it('lays its columns out in shares, with a lane between each pair', () => {
    // Each lane reads its own override before the shared width, so one lane can
    // differ without the table growing a prop for it; and it carries the grip
    // plus whatever gutter stands against the next column, which is what makes
    // the two disjoint by arithmetic rather than by care.
    expect(mount().style.gridTemplateColumns).toBe(
      `minmax(min-content, 2fr) ${lane(0)} minmax(min-content, 1fr) ${lane(1)} minmax(min-content, 1fr)`,
    )
  })

  it('states settled widths where it was given them, and takes a class of its own', () => {
    const table = mount([230, 70, 100])

    expect(table.style.gridTemplateColumns).toBe(`230px ${lane(0)} 70px ${lane(1)} 100px`)
    expect(table.className).toContain('mine')
  })

  it('owns its coordinate system and nothing else', () => {
    const table = mount()

    // No boundary, no state, no policy: a table offering none of those renders
    // what it was given and stops.
    expect(table.querySelector('[role="separator"]')).toBeNull()
    expect(table.children).toHaveLength(COLUMNS.length)
  })

  it('counts its lines past the lanes between the columns', () => {
    expect([0, 1, 2].map(tableColumnLine)).toEqual([1, 3, 5])
    expect([0, 1].map(tableLaneLine)).toEqual([2, 4])
  })
})

describe('TableGroup', () => {
  it("stands its cells on the table's own columns, across the rows it spans", () => {
    render(<TableGroup line={3} rows={2} className="row">cells</TableGroup>)

    const group = screen.getByText('cells')
    expect(group.className).toContain('row')
    expect([group.style.gridColumn, group.style.gridRow]).toEqual(['1 / -1', '3 / span 2'])
  })

  it('starts after a cell that spans its rows beside it', () => {
    render(<TableGroup line={2} rows={3} from={1}>cells</TableGroup>)

    // The value every row of the group shares stands in the first column, so
    // the group covers the columns after it and anything hung off the group
    // starts there rather than at the table's own edge.
    expect(screen.getByText('cells').style.gridColumn).toBe(`${tableColumnLine(1)} / -1`)
  })

  it('ends where it was told to, counting the last column in', () => {
    render(<TableGroup line={2} rows={1} from={1} to={2}>cells</TableGroup>)

    // A spanning cell in the middle of the table leaves the columns either
    // side of it as two groups, since a grid area is a rectangle.
    expect(screen.getByText('cells').style.gridColumn)
      .toBe(`${tableColumnLine(1)} / ${tableColumnLine(2) + 1}`)
  })
})

describe('settledWidths', () => {
  it('reads one width per column past the lanes between them', () => {
    expect(settledWidths('230px 12px 70px 12px 100px')).toEqual([230, 70, 100])
  })

  it('answers with nothing where the template has not resolved', () => {
    // A template still written as it was authored has its own spaces, so any
    // positional read of it is nonsense; nothing is the honest answer, and a
    // caller that cannot proceed without widths hears it.
    expect(settledWidths('minmax(min-content, 2fr) 12px minmax(min-content, 1fr)')).toBeUndefined()
  })
})

describe('minContentWidth', () => {
  it('measures at the narrowest and puts back the width it found', () => {
    render(<span style={{ width: '40px' }}>held</span>)
    const element = screen.getByText('held')

    expect(minContentWidth([element])).toBe(0)
    expect(element.style.width).toBe('40px')
  })

  it('leaves an element that stated no width stating none', () => {
    render(<span>free</span>)

    minContentWidth([screen.getByText('free')])

    expect(screen.getByText('free').style.width).toBe('')
  })

  it('measures nothing as nothing', () => {
    expect(minContentWidth([])).toBe(0)
  })

  it('is what a column showing its content floors at', () => {
    render(<span>cell</span>)
    const cell = screen.getByText('cell')

    expect(showsItsContent({ heading: cell, cells: [cell] }, 0)).toBe(0)
  })
})

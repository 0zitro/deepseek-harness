// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import {
  minContentWidth, Table, TableGroup, tableColumnLine, tableLaneLine,
  type TableColumnCells, type TableColumnFloor,
} from '../src/Table.tsx'

afterEach(cleanup)

const COLUMNS = [
  { id: 'command', share: 2 },
  { id: 'key', share: 1 },
  { id: 'source', share: 1 },
]

/**
 * jsdom lays nothing out, so a drag is measured against the tracks and floors
 * stated here; what the suite can hold is the arithmetic reaching the template
 * and the markup the geometry is expressed in. The layout itself is measured
 * in a browser and recorded in the Agent Note.
 */
function mount(floorOf?: TableColumnFloor) {
  const view = render(
    <Table
      columns={COLUMNS}
      {...(floorOf === undefined ? {} : { floorOf })}
      classNames={{ table: 'mine', sash: 'grip' }}
      sashLabel={(leading, trailing) => `${leading.id} | ${trailing.id}`}
    >
      {COLUMNS.map((column, index) => (
        <div
          key={column.id}
          data-table-column={column.id}
          data-table-heading=""
          style={{ gridColumn: tableColumnLine(index) }}
        >
          {column.id}
        </div>
      ))}
    </Table>,
  )
  const table = view.container.firstElementChild as HTMLElement
  const sashes = [...table.querySelectorAll('[role="separator"]')] as HTMLElement[]
  return { table, sashes }
}

/** Report settled tracks and a writing direction, since jsdom resolves neither. */
function laidOutAs(table: HTMLElement, tracks: string, direction: 'ltr' | 'rtl' = 'ltr') {
  vi.spyOn(globalThis, 'getComputedStyle').mockImplementation(((element: Element) => ({
    gridTemplateColumns: element === table ? tracks : '',
    direction,
  })) as unknown as typeof globalThis.getComputedStyle)
}

/** Take hold of a boundary, as a pointer does. */
function grip(sash: HTMLElement) {
  sash.setPointerCapture = vi.fn()
  fireEvent.pointerDown(sash, { clientX: 0, pointerId: 1 })
  return sash
}

describe('Table', () => {
  it('lays its columns out in shares, with a lane between each pair', () => {
    const { table } = mount()

    // Each lane reads its own override before the shared width, so one lane can
    // be widened without the table growing a prop for it.
    expect(table.style.gridTemplateColumns).toBe(
      'minmax(min-content, 2fr) var(--dsh-table-lane-0, var(--dsh-table-lane))'
      + ' minmax(min-content, 1fr) var(--dsh-table-lane-1, var(--dsh-table-lane))'
      + ' minmax(min-content, 1fr)',
    )
  })

  it('puts one sash between each pair of columns and none past the last', () => {
    const { sashes } = mount()

    expect(sashes).toHaveLength(COLUMNS.length - 1)
    expect(sashes.map(sash => sash.style.gridColumn)).toEqual([`${tableLaneLine(0)}`, `${tableLaneLine(1)}`])
    // A boundary that can move is one a keyboard can move, so it is a separator
    // that takes focus rather than a decoration between two columns.
    expect(sashes.map(sash => [sash.getAttribute('aria-orientation'), sash.tabIndex]))
      .toEqual([['vertical', 0], ['vertical', 0]])
    expect(screen.getByRole('separator', { name: 'command | key' })).toBeDefined()
  })

  it('takes a class for each part it owns', () => {
    const { table, sashes } = mount()

    expect(table.className).toContain('mine')
    expect(sashes[0]?.className).toContain('grip')
  })

  it('settles the columns in pixels once a boundary is dragged', () => {
    const { table, sashes } = mount(() => 40)
    laidOutAs(table, '200px 12px 100px 12px 100px')

    fireEvent.pointerMove(grip(sashes[0] as HTMLElement), { clientX: 30 })

    // What one column gains the other gives up, so the table's own width
    // cannot change with a drag.
    expect(table.style.gridTemplateColumns).toBe('230px var(--dsh-table-lane-0, var(--dsh-table-lane)) 70px'
      + ' var(--dsh-table-lane-1, var(--dsh-table-lane)) 100px')
  })

  it('stops a drag at the floor its policy states', () => {
    const floorOf = vi.fn((_column: TableColumnCells, _index: number) => 150)
    const { table, sashes } = mount(floorOf)
    laidOutAs(table, '200px 12px 100px 12px 100px')

    fireEvent.pointerMove(grip(sashes[0] as HTMLElement), { clientX: 1000 })

    expect(table.style.gridTemplateColumns.startsWith('150px ')).toBe(true)
    // Asked once, when the boundary is taken hold of, so it may measure.
    expect(floorOf).toHaveBeenCalledTimes(COLUMNS.length)
    expect(floorOf.mock.calls[0]?.[0].heading.dataset['tableColumn']).toBe('command')
  })

  it('moves a boundary by the arrow keys, and leaves other keys alone', () => {
    const { table, sashes } = mount(() => 40)
    laidOutAs(table, '200px 12px 100px 12px 100px')
    const sash = sashes[0] as HTMLElement

    fireEvent.keyDown(sash, { key: 'ArrowRight' })
    expect(table.style.gridTemplateColumns.startsWith('208px ')).toBe(true)

    fireEvent.keyDown(sash, { key: 'ArrowLeft' })
    fireEvent.keyDown(sash, { key: 'ArrowLeft' })
    expect(table.style.gridTemplateColumns.startsWith('192px ')).toBe(true)

    fireEvent.keyDown(sash, { key: 'Enter' })
    expect(table.style.gridTemplateColumns.startsWith('192px ')).toBe(true)
  })

  it('lets go of the boundary when the pointer does', () => {
    const { table, sashes } = mount(() => 40)
    laidOutAs(table, '200px 12px 100px 12px 100px')
    const sash = grip(sashes[0] as HTMLElement)

    fireEvent.pointerMove(sash, { clientX: 30 })
    fireEvent.pointerUp(sash)
    fireEvent.pointerMove(sash, { clientX: 500 })

    // The drag ended where the pointer released it, not wherever the pointer
    // went afterwards.
    expect(table.style.gridTemplateColumns.startsWith('230px ')).toBe(true)
  })

  it('drags toward the inline end whichever way the pointer has to move', () => {
    const { table, sashes } = mount(() => 40)
    laidOutAs(table, '200px 12px 100px 12px 100px', 'rtl')
    const sash = grip(sashes[0] as HTMLElement)

    // A pointer is physical: under RTL, moving it right takes the boundary
    // toward the inline start, so the leading column gives width up.
    fireEvent.pointerMove(sash, { clientX: 30 })
    expect(table.style.gridTemplateColumns.startsWith('170px ')).toBe(true)

    fireEvent.keyDown(sash, { key: 'ArrowRight' })
    expect(table.style.gridTemplateColumns.startsWith('192px ')).toBe(true)
  })

  it('floors a column at what its own cells measure unless told otherwise', () => {
    const { table, sashes } = mount()
    laidOutAs(table, '200px 12px 100px 12px 100px')

    // jsdom lays nothing out, so every cell measures nothing and the default
    // policy floors at nothing: what it proves here is that the default is the
    // cells rather than a number of the table's own.
    fireEvent.pointerMove(grip(sashes[0] as HTMLElement), { clientX: 1000 })
    expect(table.style.gridTemplateColumns.startsWith('300px ')).toBe(true)
  })

  it('gives a column no floor at all when nothing in it says it is a heading', () => {
    const floorOf = vi.fn((_column: TableColumnCells, _index: number) => 150)
    render(
      <Table columns={COLUMNS} floorOf={floorOf}>
        <div data-table-column="command" style={{ gridColumn: tableColumnLine(0) }}>no heading</div>
      </Table>,
    )
    grip(screen.getAllByRole('separator')[0] as HTMLElement)

    // A column with no heading is one the policy was never asked about, which
    // is a floor of nothing rather than a guess.
    expect(floorOf).not.toHaveBeenCalled()
  })
})

describe('TableGroup', () => {
  it("stands its cells on the table's own columns, across the rows it spans", () => {
    render(<TableGroup line={3} rows={2} className="row">cells</TableGroup>)

    const group = screen.getByText('cells')
    expect(group.className).toContain('row')
    expect([group.style.gridColumn, group.style.gridRow]).toEqual(['1 / -1', '3 / span 2'])
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
    const element = screen.getByText('free')

    minContentWidth([element])

    expect(element.style.width).toBe('')
  })

  it('measures nothing as nothing', () => {
    expect(minContentWidth([])).toBe(0)
  })
})

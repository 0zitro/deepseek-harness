// @vitest-environment jsdom
import { useRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Table, tableColumnLine, type TableColumnCells } from '../src/Table.tsx'
import { TableSash, useTableResize, type UseTableResizeOptions } from '../src/TableSash.tsx'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const COLUMNS = [
  { id: 'command', share: 2 },
  { id: 'key', share: 1 },
  { id: 'source', share: 1 },
]

type Options = Omit<UseTableResizeOptions, 'grid' | 'columns'>

/** A table that offers resizing, which is the table plus a hook and a grip. */
function Resizable({ options }: { options: Options }) {
  const grid = useRef<HTMLDivElement>(null)
  const resize = useTableResize({ grid, columns: COLUMNS, ...options })

  return (
    <Table ref={grid} columns={COLUMNS} {...(resize.widths === undefined ? {} : { widths: resize.widths })}>
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
      {COLUMNS.slice(0, -1).map((column, index) => (
        <TableSash key={column.id} index={index} span={4} label={`after ${column.id}`} resize={resize} />
      ))}
    </Table>
  )
}

/**
 * jsdom resolves no layout, so the tracks a gesture starts from are stated
 * here. What the suite holds is the arithmetic reaching the template, the
 * gestures that drive it, and what a boundary reports about itself.
 */
/**
 * Report a resolved template and a writing direction for one element, leaving
 * every other computed style alone: the accessible-name machinery reads real
 * ones, so replacing them outright breaks finding the boundary at all.
 */
function laidOutAs(table: HTMLElement, tracks: string, direction: 'ltr' | 'rtl') {
  // Put back the real one first: replacing a spy's implementation while the
  // spy is what this captured makes it call itself.
  vi.restoreAllMocks()
  const real = globalThis.getComputedStyle.bind(globalThis)
  vi.spyOn(globalThis, 'getComputedStyle').mockImplementation((element: Element, pseudo?: string | null) => {
    const style = real(element, pseudo ?? undefined)
    return new Proxy(style, {
      get(target: CSSStyleDeclaration, key: string | symbol): unknown {
        if (element === table && key === 'gridTemplateColumns') return tracks
        if (key === 'direction') return direction
        const value: unknown = Reflect.get(target, key)
        return typeof value === 'function' ? (value as () => unknown).bind(target) : value
      },
    })
  })
}

function mount(options: Options = {}, tracks = '200px 12px 100px 12px 100px', direction: 'ltr' | 'rtl' = 'ltr') {
  const view = render(<Resizable options={{ floorOf: () => 40, ...options }} />)
  const table = view.container.firstElementChild as HTMLElement

  laidOutAs(table, tracks, direction)

  const sash = screen.getByRole('separator', { name: 'after command' })
  sash.setPointerCapture = vi.fn()
  // The lane tokens carry spaces of their own, so the column widths are read
  // by what they are rather than by where they sit.
  const columns = () => table.style.gridTemplateColumns.match(/[\d.]+px/g) ?? []
  return { table, sash, columns }
}

/** Take hold of a boundary and move the pointer to where it is asked. */
function drag(sash: HTMLElement, to: number) {
  fireEvent.pointerDown(sash, { clientX: 0, pointerId: 1 })
  fireEvent.pointerMove(sash, { clientX: to })
}

describe('useTableResize', () => {
  it('settles the columns in pixels, conserving what the pair holds', () => {
    const { sash, columns } = mount()

    drag(sash, 30)

    expect(columns()).toEqual(['230px', '70px', '100px'])
  })

  it('stops a drag at the floor its policy states', () => {
    const floorOf = vi.fn((_column: TableColumnCells, _index: number) => 150)
    const { sash, columns } = mount({ floorOf })

    drag(sash, 1000)

    expect(columns()[0]).toBe('150px')
    // Asked once, when the boundary is taken hold of, so it may measure.
    expect(floorOf).toHaveBeenCalledTimes(COLUMNS.length)
    expect(floorOf.mock.calls[0]?.[0].heading.dataset['tableColumn']).toBe('command')
  })

  it('floors a column at what its own cells measure unless told otherwise', () => {
    // jsdom lays nothing out, so every cell measures nothing and the default
    // policy floors at nothing: what this holds is that the default is the
    // cells rather than a number of the table's own.
    const { sash, columns } = mount({ floorOf: undefined })

    drag(sash, 1000)

    expect(columns()[0]).toBe('300px')
  })

  it('gives a column no floor at all when nothing in it says it is a heading', () => {
    const floorOf = vi.fn((_column: TableColumnCells, _index: number) => 150)
    function Headless() {
      const grid = useRef<HTMLDivElement>(null)
      const resize = useTableResize({ grid, columns: COLUMNS, floorOf })
      return (
        <Table ref={grid} columns={COLUMNS}>
          <div data-table-column="command" style={{ gridColumn: tableColumnLine(0) }}>no heading</div>
          <TableSash index={0} span={2} label="after command" resize={resize} />
        </Table>
      )
    }
    const view = render(<Headless />)
    const table = view.container.firstElementChild as HTMLElement
    laidOutAs(table, '200px 12px 100px 12px 100px', 'ltr')

    const sash = screen.getByRole('separator')
    sash.setPointerCapture = vi.fn()
    fireEvent.pointerDown(sash, { clientX: 0, pointerId: 1 })

    // A column with no heading is one the policy was never asked about, which
    // is a floor of nothing rather than a guess.
    expect(floorOf).not.toHaveBeenCalled()
  })

  it('lets go of a boundary however the gesture ends', () => {
    for (const ending of ['pointerUp', 'pointerCancel', 'lostPointerCapture'] as const) {
      const { sash, columns } = mount()

      drag(sash, 30)
      fireEvent[ending](sash)
      fireEvent.pointerMove(sash, { clientX: 500 })

      // A drag the system takes away ends like one the reader ends: without
      // this the table would go on listening to a pointer doing something else.
      expect(columns()).toEqual(['230px', '70px', '100px'])
      cleanup()
    }
  })

  it('reports the widths once a gesture is over, and not on the way', () => {
    const onWidthsCommit = vi.fn()
    const { sash } = mount({ onWidthsCommit })

    fireEvent.pointerDown(sash, { clientX: 0, pointerId: 1 })
    fireEvent.pointerMove(sash, { clientX: 10 })
    fireEvent.pointerMove(sash, { clientX: 30 })
    expect(onWidthsCommit).not.toHaveBeenCalled()

    fireEvent.pointerUp(sash)
    // A drag passes through every width between its ends, and none of those is
    // a decision anyone made.
    expect(onWidthsCommit).toHaveBeenCalledTimes(1)
    expect(onWidthsCommit).toHaveBeenCalledWith([230, 70, 100])

    fireEvent.keyDown(sash, { key: 'ArrowRight' })
    // A press is a whole gesture, so it is over as soon as it happened.
    expect(onWidthsCommit).toHaveBeenCalledTimes(2)
  })

  it('starts from the widths it was given, for a layout a consumer kept', () => {
    const { columns } = mount({ initialWidths: [111, 222, 333] })

    expect(columns()).toEqual(['111px', '222px', '333px'])
  })

  it('moves a boundary by the keyboard, to a step or to the floor', () => {
    const { sash, columns } = mount({ step: 5 })

    fireEvent.keyDown(sash, { key: 'ArrowRight' })
    expect(columns()[0]).toBe('205px')

    fireEvent.keyDown(sash, { key: 'ArrowLeft' })
    fireEvent.keyDown(sash, { key: 'ArrowLeft' })
    expect(columns()[0]).toBe('195px')

    // Home and End take the boundary as far as the floors let it go.
    fireEvent.keyDown(sash, { key: 'Home' })
    expect(columns()[0]).toBe('40px')
    fireEvent.keyDown(sash, { key: 'End' })
    expect(columns()[0]).toBe('260px')

    fireEvent.keyDown(sash, { key: 'Enter' })
    expect(columns()[0]).toBe('260px')
  })

  it('drags and steps toward the inline end whichever way that is', () => {
    const { sash, columns } = mount({ step: 5 }, '200px 12px 100px 12px 100px', 'rtl')

    // A pointer is physical: under RTL, moving it right takes the boundary
    // toward the inline start, so the leading column gives width up.
    drag(sash, 30)
    expect(columns()[0]).toBe('170px')

    fireEvent.keyDown(sash, { key: 'ArrowRight' })
    expect(columns()[0]).toBe('195px')
  })

  it('does nothing at all before the table has been laid out', () => {
    const view = render(<Resizable options={{ floorOf: () => 40 }} />)
    const table = view.container.firstElementChild as HTMLElement
    const sash = screen.getByRole('separator', { name: 'after command' })
    sash.setPointerCapture = vi.fn()

    // jsdom resolves no template, which is the same answer a real engine gives
    // before first layout: a gesture with nothing to start from does not start.
    drag(sash, 30)
    fireEvent.keyDown(sash, { key: 'ArrowRight' })

    expect(table.style.gridTemplateColumns.startsWith('minmax(')).toBe(true)
  })
})

describe('TableSash', () => {
  it('is a separator that says where it stands, once it can', () => {
    const { sash } = mount()

    expect([sash.getAttribute('aria-orientation'), sash.tabIndex]).toEqual(['vertical', 0])
    expect([sash.getAttribute('aria-valuemin'), sash.getAttribute('aria-valuemax')]).toEqual(['0', '100'])
    // Omitted rather than guessed at until something has asked.
    expect(sash.getAttribute('aria-valuenow')).toBeNull()

    fireEvent.focus(sash)
    expect(sash.getAttribute('aria-valuenow')).toBe('67')
  })

  it('says nothing about where it stands where the pair has no width', () => {
    const { sash } = mount({}, '0px 12px 0px 12px 0px')

    fireEvent.focus(sash)

    expect(sash.getAttribute('aria-valuenow')).toBeNull()
  })

  it('says it is being held, for as long as it is', () => {
    const { sash } = mount()

    fireEvent.pointerDown(sash, { clientX: 0, pointerId: 1 })
    expect(sash.dataset['dragging']).toBe('true')

    fireEvent.lostPointerCapture(sash)
    expect(sash.dataset['dragging']).toBeUndefined()
  })

  it('runs the rows it was told to, since only its consumer knows how many', () => {
    const { sash } = mount()

    // It cannot be `1 / -1`: that resolves against the explicit grid, and a
    // table whose rows are implicit has none, so the sash would stand in the
    // first row alone.
    expect(sash.style.gridRow).toBe('1 / span 4')
  })
})

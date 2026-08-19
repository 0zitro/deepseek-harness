import { useRef, useState, type PointerEvent, type KeyboardEvent, type ReactNode } from 'react'
import clsx from 'clsx'
import { resizeWidths } from './table-resize.ts'
import css from './Table.module.css'

/** A column, as the table's geometry needs to know it. */
export interface TableColumnLayout {
  /** Stable column key, which its cells name and React keys by. */
  id: string
  /**
   * Its share of the width while the columns lay themselves out. Shares are
   * data rather than CSS because a drag converts them to pixels: a share only
   * the painter knew would be a number the table converts without having seen.
   */
  share: number
}

/** The cells of one column, as a floor policy sees them. */
export interface TableColumnCells {
  /** The heading cell. */
  heading: HTMLElement
  /** Every cell in the column, heading first, in document order. */
  cells: readonly HTMLElement[]
}

/**
 * What a column may not be dragged below. This is a policy and not a rule: a
 * table whose rows are the point wants them counted, and one whose row cells
 * clip or scroll their own content wants only its heading counted, so that a
 * long value cannot hold a column open for content that has somewhere else to
 * go. It is asked once, when a sash is taken hold of, so it may measure.
 */
export type TableColumnFloor = (column: TableColumnCells, index: number) => number

/** The parts a consumer may dress. */
export type TablePart = 'table' | 'sash' | 'group'

/**
 * The width the given elements measure at their narrowest.
 *
 * Measured rather than assumed: a floor stated as a number is a guess about a
 * font, and a font is not something a stylesheet's author is holding. The
 * elements are restored to the width they had, so this reads the page without
 * changing it.
 * @param elements - the elements to measure.
 * @returns the widest of their narrowest widths, or zero for none.
 */
export function minContentWidth(elements: readonly HTMLElement[]): number {
  // Each element paired with the width it stated, rather than two lists kept in
  // step by an index: there is no wrong index to hold if there is no index.
  const held = elements.map(element => [element, element.style.width] as const)

  for (const [element] of held) element.style.width = 'min-content'
  const width = Math.max(0, ...held.map(([element]) => element.getBoundingClientRect().width))
  for (const [element, stated] of held) element.style.width = stated

  return width
}

/** A column shows its content: the unsurprising rule, and the one to depart from knowingly. */
const showsItsContent: TableColumnFloor = ({ cells }) => minContentWidth([...cells])

/** The grid line a column's cells stand on, counting the lanes between them. */
export function tableColumnLine(index: number): number {
  return index * 2 + 1
}

/** The grid line of the lane that follows a column. */
export function tableLaneLine(index: number): number {
  return index * 2 + 2
}

/**
 * The track template for the given columns, in shares or in settled pixels.
 *
 * Each lane reads its own optional override before the shared width, so a
 * consumer that needs one lane wider — because a row's own controls sit in it,
 * say — states that lane and leaves the rest alone, without the table growing
 * a prop for it.
 */
function template(columns: readonly TableColumnLayout[], widths: readonly number[] | undefined): string {
  return columns
    .flatMap((column, index) => {
      const width = widths?.[index]
      const track = width === undefined
        ? `minmax(min-content, ${column.share}fr)`
        : `${width}px`
      const lane = `var(--dsh-table-lane-${index}, var(--dsh-table-lane))`
      return index === columns.length - 1 ? [track] : [track, lane]
    })
    .join(' ')
}

/** How far one press of an arrow key moves a boundary. */
const KEYBOARD_STEP = 8

/** What a table is, apart from what stands in it. */
export interface TableProps {
  /** The columns, in render order. */
  columns: readonly TableColumnLayout[]
  /**
   * What a column may not be dragged below. Defaults to what the column's
   * cells measure at their narrowest, which is a column showing its content.
   */
  floorOf?: TableColumnFloor | undefined
  /** A class per part, for everything the table does not read back. */
  classNames?: Partial<Record<TablePart, string>> | undefined
  /** The accessible name each sash takes, given the columns it divides. */
  sashLabel?: ((leading: TableColumnLayout, trailing: TableColumnLayout) => string) | undefined
  /** The headings and rows, placed on the table's own lines. */
  children: ReactNode
}

/**
 * A grid of columns divided by draggable boundaries.
 *
 * The table owns the tracks and the lanes and nothing else: what stands in a
 * cell, what it looks like, and what a row means are the consumer's, placed on
 * the lines `tableColumnLine` names and dressed through the class it passes
 * for each part. A cell states which column it belongs to with
 * `data-table-column`, and a heading adds `data-table-heading`, which is how a
 * floor policy finds what to measure.
 *
 * A drag moves one boundary, so it concerns the two columns that meet there:
 * what one gains the other gives up, and the table's own width never changes.
 * The columns lay themselves out until a boundary is first taken hold of, and
 * the drag starts from what they measure at that moment, so nothing jumps.
 * @param props - the columns, the floor policy, and what stands in the table.
 * @returns the table.
 */
export function Table(
  { columns, floorOf = showsItsContent, classNames, sashLabel, children }: TableProps,
) {
  const grid = useRef<HTMLDivElement>(null)
  const [widths, setWidths] = useState<readonly number[]>()

  /** What the columns measure now, which is where a drag starts from. */
  const settled = (): readonly number[] => {
    const table = grid.current
    /* v8 ignore next -- a sash cannot be taken hold of before the table mounts */
    if (table === null) return []
    return getComputedStyle(table).gridTemplateColumns
      .split(' ')
      .filter((_, at) => at % 2 === 0)
      .map(track => Number.parseFloat(track))
  }

  /** The cells of each column, which is what a floor policy is asked about. */
  const floors = (): readonly number[] => {
    const table = grid.current
    /* v8 ignore next -- a sash cannot be taken hold of before the table mounts */
    if (table === null) return []
    return columns.map((column, index) => {
      const cells = [...table.querySelectorAll<HTMLElement>(`[data-table-column="${column.id}"]`)]
      const heading = cells.find(cell => cell.dataset['tableHeading'] !== undefined)
      return heading === undefined ? 0 : floorOf({ heading, cells }, index)
    })
  }

  /** Move one boundary, conserving what the pair either side of it holds. */
  const resize = (index: number, from: readonly number[], measured: readonly number[], delta: number) => {
    setWidths(resizeWidths(from, measured, index, delta))
  }

  const onPointerDown = (index: number) => (event: PointerEvent<HTMLDivElement>) => {
    const handle = event.currentTarget
    const origin = event.clientX
    // Physical, because a pointer is: under RTL a drag toward the inline end
    // moves the pointer the other way.
    const toward = getComputedStyle(handle).direction === 'rtl' ? -1 : 1
    const from = settled()
    const measured = floors()

    handle.setPointerCapture(event.pointerId)
    const onMove = (moved: globalThis.PointerEvent) => {
      resize(index, from, measured, (moved.clientX - origin) * toward)
    }
    const onEnd = () => {
      handle.removeEventListener('pointermove', onMove)
      handle.removeEventListener('pointerup', onEnd)
    }
    handle.addEventListener('pointermove', onMove)
    handle.addEventListener('pointerup', onEnd)
  }

  // A boundary is a separator, and a separator that can move is one the
  // keyboard can move: a pointer drag is not a way of stating a width that
  // everyone has.
  const onKeyDown = (index: number) => (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (step === 0) return

    event.preventDefault()
    const toward = getComputedStyle(event.currentTarget).direction === 'rtl' ? -1 : 1
    resize(index, settled(), floors(), step * toward * KEYBOARD_STEP)
  }

  return (
    <div
      ref={grid}
      className={clsx(css.table, classNames?.table)}
      style={{ gridTemplateColumns: template(columns, widths) }}
    >
      {children}
      {columns.slice(0, -1).map((column, index) => (
        <div
          key={`sash-${column.id}`}
          role="separator"
          aria-orientation="vertical"
          tabIndex={0}
          aria-label={sashLabel?.(column, columns[index + 1] as TableColumnLayout)}
          className={clsx(css.sash, classNames?.sash)}
          style={{ gridColumn: tableLaneLine(index), gridRow: '1 / -1' }}
          onPointerDown={onPointerDown(index)}
          onKeyDown={onKeyDown(index)}
        />
      ))}
    </div>
  )
}

/** One group of cells standing together on the table's own columns. */
export interface TableGroupProps {
  /** The first grid row the group occupies. */
  line: number
  /** How many rows it spans. */
  rows: number
  className?: string | undefined
  children: ReactNode
}

/**
 * A run of rows as one group on the table's tracks.
 *
 * A grid row is as tall as the tallest thing in it, so anything hung off the
 * row — a band below it, a rule across it — sits against that rather than
 * against the cells it belongs to. Grouping the cells gives those things
 * something the right height to hang from, while subgrid keeps the cells
 * standing in the table's own columns rather than in tracks of their own.
 * @param props - where the group stands, and the cells in it.
 * @returns the group.
 */
export function TableGroup({ line, rows, className, children }: TableGroupProps) {
  return (
    <div
      className={clsx(css.group, className)}
      style={{ gridColumn: '1 / -1', gridRow: `${line} / span ${rows}` }}
    >
      {children}
    </div>
  )
}

import { useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react'
import clsx from 'clsx'
import { resizeWidths } from './table-resize.ts'
import {
  settledWidths, showsItsContent, tableLaneLine,
  type TableColumnFloor, type TableColumnLayout,
} from './Table.tsx'
import css from './Table.module.css'

/** How far one press of an arrow key moves a boundary, where none is stated. */
const STEP = 8

/** Far enough past any floor that the arithmetic's own clamp decides where it stops. */
const TO_THE_FLOOR = Number.MAX_SAFE_INTEGER

/** What a resizable table's boundaries are given to work with. */
export interface UseTableResizeOptions {
  /** The table itself, which is what the settled widths are read from. */
  grid: RefObject<HTMLElement | null>
  /** The columns, in the same order the table has them. */
  columns: readonly TableColumnLayout[]
  /**
   * What a column may not be dragged below. Defaults to what the column's own
   * cells measure at their narrowest — a column showing its content — which a
   * table whose cells clip or scroll may knowingly depart from.
   */
  floorOf?: TableColumnFloor | undefined
  /** Pixels one press of an arrow key moves a boundary. */
  step?: number | undefined
  /** Widths to start from, for a consumer restoring a layout it kept. */
  initialWidths?: readonly number[] | undefined
  /**
   * The widths once a gesture is over, which is the point they are worth
   * keeping: a drag passes through every width between its ends, and none of
   * those is a decision anyone made.
   */
  onWidthsCommit?: ((widths: readonly number[]) => void) | undefined
}

/** What moves a table's boundaries, and what the table is showing meanwhile. */
export interface TableResizeController {
  /** The settled widths, or nothing while the columns still lay themselves out. */
  widths: readonly number[] | undefined
  /** Take hold of the boundary after a column. */
  beginDrag: (index: number) => (event: PointerEvent<HTMLElement>) => void
  /** Move the boundary after a column by the keyboard. */
  keyResize: (index: number) => (event: KeyboardEvent<HTMLElement>) => void
  /**
   * How the pair either side of a boundary is divided, from 0 to 100, or
   * nothing before the table has been laid out. A separator that reports where
   * it stands is one a screen reader can follow.
   */
  splitOf: (index: number) => number | undefined
}

/**
 * Moving a table's column boundaries.
 *
 * The widths are this feature's own state and nobody else's copy: a table that
 * offers no resizing holds none, and a consumer that keeps a layout between
 * sessions states where to start and hears where it ended, rather than owning
 * every width in between.
 *
 * The columns lay themselves out until a boundary is first taken hold of, and
 * a gesture starts from what they measure at that moment, so nothing jumps
 * whatever laid them out until then.
 * @param options - the table, its columns, and how far a boundary may go.
 * @returns the widths, and the handlers a boundary is driven by.
 */
export function useTableResize(
  { grid, columns, floorOf = showsItsContent, step = STEP, initialWidths, onWidthsCommit }: UseTableResizeOptions,
): TableResizeController {
  const [widths, setWidths] = useState<readonly number[] | undefined>(initialWidths)

  /** What the columns measure now, which is where a gesture starts from. */
  const settled = (): readonly number[] | undefined => {
    const table = grid.current
    /* v8 ignore next -- a boundary cannot be taken hold of before the table mounts */
    if (table === null) return undefined
    return settledWidths(getComputedStyle(table).gridTemplateColumns)
  }

  /** The cells of each column, which is what a floor policy is asked about. */
  const floors = (table: HTMLElement): readonly number[] =>
    columns.map((column, index) => {
      const cells = [...table.querySelectorAll<HTMLElement>(`[data-table-column="${column.id}"]`)]
      const heading = cells.find(cell => cell.dataset['tableHeading'] !== undefined)
      return heading === undefined ? 0 : floorOf({ heading, cells }, index)
    })

  /** Everything a gesture needs, or nothing where the table cannot yet say. */
  const held = (): { from: readonly number[]; measured: readonly number[] } | undefined => {
    const table = grid.current
    const from = settled()
    /* v8 ignore next -- the table is there whenever its own boundary is */
    if (table === null || from === undefined) return undefined
    return { from, measured: floors(table) }
  }

  const beginDrag = (index: number) => (event: PointerEvent<HTMLElement>) => {
    const gesture = held()
    if (gesture === undefined) return

    const handle = event.currentTarget
    const origin = event.clientX
    // Physical, because a pointer is: under RTL a drag toward the inline end
    // moves the pointer the other way.
    const toward = getComputedStyle(handle).direction === 'rtl' ? -1 : 1
    let latest = gesture.from

    const onMove = (moved: globalThis.PointerEvent) => {
      latest = resizeWidths(gesture.from, gesture.measured, index, (moved.clientX - origin) * toward)
      setWidths(latest)
    }
    // Every way a gesture can end, and not only the one where it goes well: a
    // drag the system takes away — a call arriving, a pen leaving the tablet —
    // ends without a `pointerup` and would otherwise leave the table listening.
    const onEnd = () => {
      for (const kind of ['pointerup', 'pointercancel', 'lostpointercapture']) {
        handle.removeEventListener(kind, onEnd)
      }
      handle.removeEventListener('pointermove', onMove)
      onWidthsCommit?.(latest)
    }

    handle.setPointerCapture(event.pointerId)
    handle.addEventListener('pointermove', onMove)
    for (const kind of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      handle.addEventListener(kind, onEnd)
    }
  }

  const keyResize = (index: number) => (event: KeyboardEvent<HTMLElement>) => {
    const toward = getComputedStyle(event.currentTarget).direction === 'rtl' ? -1 : 1
    // Home and End take the boundary as far as it goes, which is where the
    // floors are: the arithmetic already clamps, so asking for everything asks
    // for exactly the floor.
    const delta = { ArrowLeft: -step, ArrowRight: step, Home: -TO_THE_FLOOR, End: TO_THE_FLOOR }[event.key]
    if (delta === undefined) return

    const gesture = held()
    if (gesture === undefined) return

    event.preventDefault()
    const next = resizeWidths(gesture.from, gesture.measured, index, delta * toward)
    setWidths(next)
    // A press is a whole gesture, so it is over as soon as it happened.
    onWidthsCommit?.(next)
  }

  const splitOf = (index: number) => {
    const measured = settled()
    const leading = measured?.[index]
    const trailing = measured?.[index + 1]
    if (leading === undefined || trailing === undefined || leading + trailing === 0) return undefined
    return Math.round((leading / (leading + trailing)) * 100)
  }

  return { widths, beginDrag, keyResize, splitOf }
}

/** A boundary between two of a table's columns. */
export interface TableSashProps {
  /** The column it follows. */
  index: number
  /** How many grid rows it runs through, the heading's among them. */
  span: number
  /** The grid row it starts at. */
  from?: number | undefined
  /**
   * What it is called. Required, because a separator a reader cannot name is
   * one they cannot decide whether to move.
   */
  label: string
  resize: TableResizeController
  className?: string | undefined
}

/**
 * The grip on a column boundary.
 *
 * The whole lane is the grip: the line a consumer draws in it is thinner than
 * the area that catches a pointer, so a boundary can be taken hold of anywhere
 * along its height. It draws nothing of its own — what it looks like, and what
 * it looks like while it is being held, is the consumer's, hung off the class
 * it passes and the `data-dragging` the sash publishes.
 *
 * The span is a prop because it is the one fact only the consumer knows. It
 * cannot be `1 / -1`: that resolves against the *explicit* grid, and a table
 * whose rows are implicit has none, so the sash would stand in the first row
 * alone — measured at 22px of a 114px table.
 * @param props - which boundary this is, how far it runs, and what moves it.
 * @returns the grip.
 */
export function TableSash({ index, span, from = 1, label, resize, className }: TableSashProps) {
  const [dragging, setDragging] = useState(false)
  const [split, setSplit] = useState<number>()

  const report = () => { setSplit(resize.splitOf(index)) }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      // Omitted rather than guessed at before the table has been laid out,
      // which is what an indeterminate separator reports.
      {...(split === undefined ? {} : { 'aria-valuenow': split })}
      tabIndex={0}
      data-dragging={dragging || undefined}
      className={clsx(css.sash, className)}
      style={{ gridColumn: tableLaneLine(index), gridRow: `${from} / span ${span}` }}
      onFocus={report}
      onPointerDown={(event) => {
        setDragging(true)
        event.currentTarget.addEventListener('lostpointercapture', () => {
          setDragging(false)
          report()
        }, { once: true })
        resize.beginDrag(index)(event)
      }}
      onKeyDown={(event) => {
        resize.keyResize(index)(event)
        report()
      }}
    />
  )
}

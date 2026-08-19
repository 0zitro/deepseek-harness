import { forwardRef, type ForwardedRef, type ReactNode } from 'react'
import clsx from 'clsx'
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
export const showsItsContent: TableColumnFloor = ({ cells }) => minContentWidth([...cells])

/**
 * The pixel widths a resolved track template states, or nothing where it
 * states none.
 *
 * A template only resolves to pixels once the table has been laid out. Before
 * that it is still the `minmax(min-content, 2fr)` it was written as, whose own
 * spaces make any positional read of it nonsense — so this answers with
 * nothing rather than with a list of `NaN`, and a caller that cannot proceed
 * without widths knows it.
 * @param template - a computed `grid-template-columns`.
 * @returns one width per column, or undefined where the template is unresolved.
 */
export function settledWidths(template: string): readonly number[] | undefined {
  const tracks = template.split(' ')
  const widths = tracks.filter((_, at) => at % 2 === 0).map(track => Number.parseFloat(track))

  return widths.every(width => Number.isFinite(width)) ? widths : undefined
}

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

/** What a table is, apart from what stands in it. */
export interface TableProps {
  /** The columns, in render order. */
  columns: readonly TableColumnLayout[]
  /**
   * Settled pixel widths, one per column, from whatever moves the boundaries.
   * Without them the columns lay themselves out in their shares, which is what
   * a table that offers no resizing wants and all it needs.
   */
  widths?: readonly number[] | undefined
  className?: string | undefined
  /** The headings and rows, placed on the table's own lines. */
  children: ReactNode
}

/**
 * A grid of columns with a lane between each pair.
 *
 * The table owns its coordinate system — the column lines, the lane lines, and
 * the track template — and nothing else. What stands in a cell, what it looks
 * like, and what a row means are the consumer's, placed on the lines
 * `tableColumnLine` names. That coordinate system is the seam every other
 * feature composes through: sorting is arithmetic over the consumer's own
 * rows, resizing is a hook and an element that name a lane, and a control in
 * the space between cells names a group. A table that wants none of them pays
 * for none of them.
 *
 * A cell states which column it belongs to with `data-table-column`, and a
 * heading adds `data-table-heading`, which is how a resize policy finds what to
 * measure without the table having to be told twice.
 * @param props - the columns, any settled widths, and what stands in the table.
 * @returns the table.
 */
export const Table = forwardRef(function Table(
  { columns, widths, className, children }: TableProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  return (
    <div
      ref={ref}
      className={clsx(css.table, className)}
      style={{ gridTemplateColumns: template(columns, widths) }}
    >
      {children}
    </div>
  )
})

/** One group of cells standing together on the table's own columns. */
export interface TableGroupProps {
  /** The first grid row the group occupies. */
  line: number
  /** How many rows it spans. */
  rows: number
  /**
   * The first column the group covers, which is not always the first column of
   * the table: a cell spanning the group's rows — one value shared by all of
   * them — stands beside the group rather than in it, and the group starts
   * after it. Anything hung off the group starts there too.
   */
  from?: number | undefined
  /**
   * The last column it covers, counting inclusively; the table's last by
   * default. A group ends early where a spanning cell stands in the middle of
   * the table rather than at its edge: a grid area is a rectangle, so the
   * columns either side of that cell are two groups and not one.
   */
  to?: number | undefined
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
 *
 * A group covers a range of columns rather than all of them, because a cell
 * spanning its rows may stand anywhere: at the table's leading edge, at its
 * trailing edge, or in the middle, where the columns either side of it are two
 * groups since a grid area is a rectangle.
 * @param props - where the group stands, and the cells in it.
 * @returns the group.
 */
export function TableGroup({ line, rows, from = 0, to, className, children }: TableGroupProps) {
  // A column ends at the line after the one it starts on; `-1` is the table's
  // own last line, which is what a group running to the edge wants and the one
  // case no column index can name.
  const ends = to === undefined ? '-1' : `${tableColumnLine(to) + 1}`

  return (
    <div
      className={clsx(css.group, className)}
      style={{ gridColumn: `${tableColumnLine(from)} / ${ends}`, gridRow: `${line} / span ${rows}` }}
    >
      {children}
    </div>
  )
}

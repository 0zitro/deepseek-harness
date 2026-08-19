import { useState, type PointerEvent, type ReactNode } from 'react'
import clsx from 'clsx'
import css from './Table.module.css'

/** Where a band begins and ends along the axis it follows. */
export interface BandBounds {
  start: number
  end: number
}

/**
 * Where along a band the pointer is, counted from the band's start.
 *
 * Clamped, and the clamp is the whole of the hold-still rule: a band answers
 * past itself, so a pointer that has left the band but not its reach lands on
 * the nearest end and the band stops following rather than chasing something
 * outside it. That is one arithmetic fact instead of a second rule about when
 * to stop.
 * @param bounds - the band's own extent, not counting its reach.
 * @param pointer - where the pointer is along the same axis.
 * @returns the distance from the band's start, within the band.
 */
export function bandOffset({ start, end }: BandBounds, pointer: number): number {
  return Math.min(Math.max(pointer, start), end) - start
}

/** What every band holds: a name, something to do, and something to draw. */
interface BandProps {
  /**
   * What it is called. Required: a control standing in space no cell occupies
   * is one nothing else names.
   */
  label: string
  onPress: () => void
  className?: string | undefined
  /** What it draws. Drawn only where the consumer says, off `data-drawn`. */
  children: ReactNode
}

/** A control in reserved space, following the pointer along one axis. */
function Band(
  { axis, property, part, style, label, onPress, className, children }: BandProps & {
    axis: 'block' | 'inline'
    property: string
    part: string | undefined
    style?: Record<string, string> | undefined
  },
) {
  const [drawn, setDrawn] = useState(false)
  const [offset, setOffset] = useState(0)

  // The band's own box, not the reach it grows while drawn: clamping against
  // the box is what leaves the drawing where it was when the pointer went past.
  const follow = (event: PointerEvent<HTMLElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    const bounds = axis === 'block'
      ? { start: box.top, end: box.bottom }
      : { start: box.left, end: box.right }
    setOffset(bandOffset(bounds, axis === 'block' ? event.clientY : event.clientX))
  }

  return (
    <button
      type="button"
      aria-label={label}
      data-drawn={drawn || undefined}
      className={clsx(css.band, part, className)}
      style={{ ...style, [property]: `${offset}px` }}
      onPointerEnter={(event) => { setDrawn(true); follow(event) }}
      onPointerMove={follow}
      onPointerLeave={() => { setDrawn(false) }}
      onClick={onPress}
    >
      {children}
    </button>
  )
}

/** A control in the gap below a group, where the next group begins. */
export type TableSeamProps = BandProps

/**
 * The affordance of the boundary between one group of rows and the next.
 *
 * It stands in the gap the table already leaves between rows, reaching as far
 * into the groups either side as the seam inset says, and takes no room of its
 * own — a table is as tall as its rows whether it offers a seam or not. It
 * publishes where the pointer is along it as `--dsh-table-seam-y`, clamped to
 * itself, so a consumer that wants its mark to follow the pointer writes one
 * rule and one that wants it to stand still writes none.
 *
 * One per group, not one per boundary. A band belonging to whichever group the
 * pointer was nearer reads as belonging to neither, so the space where two
 * groups meet is the upper one's and nothing else's.
 * @param props - what it is called, what it does, and what it draws.
 * @returns the seam.
 */
export function TableSeam(props: TableSeamProps) {
  return <Band {...props} axis="block" property="--dsh-table-seam-y" part={css.seam} />
}

/** A control in the widened lane at a group's edge. */
export interface TableGutterProps extends BandProps {
  /** Which lane it stands in, which is where its width comes from. */
  lane: number
  /** Which edge of the group it stands at. */
  side?: 'leading' | 'trailing' | undefined
}

/**
 * The affordance of a row's own edge.
 *
 * It stands in the width its lane carries beyond the sash's grip, so the two
 * never share a pixel — which is arithmetic rather than care, and matters most
 * where the gutter's control is the one that destroys something and the sash's
 * is the one a reader aims at all day. It publishes the pointer's place along
 * it as `--dsh-table-gutter-x`.
 * @param props - which lane and edge it stands at, and what it does there.
 * @returns the gutter.
 */
export function TableGutter({ lane, side = 'leading', ...props }: TableGutterProps) {
  const width = `var(--dsh-table-gutter-${lane}, var(--dsh-table-gutter))`
  const edge = side === 'leading'
    ? { insetInlineStart: `calc(-1 * ${width})` }
    : { insetInlineEnd: `calc(-1 * ${width})` }

  return (
    <Band
      {...props}
      axis="inline"
      property="--dsh-table-gutter-x"
      part={css.gutter}
      style={{ ...edge, width }}
    />
  )
}

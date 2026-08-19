import { forwardRef, type ForwardedRef, type ReactNode } from 'react'
import clsx from 'clsx'
import css from './Run.module.css'

/**
 * Which flank carries the slack, and nothing else. The reserved room is not
 * slack, so no mode reaches it: a run is centred, pushed to one end, or lets
 * its content take the space, and in every case the reservation stands where
 * it was.
 *
 * The distributive modes CSS also offers — `space-between` and its siblings —
 * are absent because they share space *between peers*, and the reserved room
 * is not a peer of the content. A caller wanting them composes them inside the
 * content it passes.
 */
export type RunJustify = 'start' | 'center' | 'end' | 'stretch'

/** How the content sits across the run, in the axis the run does not lay out. */
export type RunAlign = 'start' | 'center' | 'end' | 'stretch' | 'baseline'

/**
 * A reserved end of a run: what it measures as, and who stands there.
 *
 * The reserve is required. A room measured from whoever is in it moves the
 * moment they do, which is the state the two planes exist to prevent, so the
 * width is a fact about the widest thing the end can ever hold rather than
 * about the thing there now.
 */
export interface RunRoom {
  /**
   * The widest form this end can ever hold, rendered hidden. The room is
   * whatever this measures, which is why a run states no lengths: give it a
   * mark carrying a rank and the room fits a ranked mark, whether or not the
   * mark showing has a rank.
   *
   * It must be inert. A run renders it to measure it and for nothing else, so
   * a control passed here is a second control — hidden and unreachable, and
   * still mounted. Pass the shape, not the thing.
   */
  reserve: ReactNode
  /** Who is in that room now. Its absence changes no measurement. */
  occupant?: ReactNode | undefined
  /**
   * The room is taken by something the run does not hold — a control floating
   * over this end, which cannot nest inside the content it floats over. The
   * run places its content as though it held that occupant, and renders
   * nothing for it.
   */
  occupied?: boolean | undefined
}

/** What every run holds: content, the rooms it keeps, and who is in them. */
interface RunProps {
  /** The room kept at the inline start, if the run keeps one there. */
  start?: RunRoom | undefined
  /** The room kept at the inline end, if the run keeps one there. */
  end?: RunRoom | undefined
  /**
   * What the content measures as, where it cannot measure itself. Defaults to
   * the content, which is what a phrase wants.
   *
   * A control does not: it reports an intrinsic width of its own — an input's
   * comes from its `size` attribute rather than from its value — so a run that
   * measured one would ask for a width nobody typed. Neither does a value that
   * varies, where measuring what is showing hands the run a width that moves
   * with the data. Both want an inert stand-in, for the same reason a room
   * wants a reserve.
   */
  exemplar?: ReactNode
  justify?: RunJustify | undefined
  align?: RunAlign | undefined
  className?: string | undefined
  /** The content's own wrapper, where a caller states how it wraps or clips. */
  contentClassName?: string | undefined
  children: ReactNode
}

/** A run whose content is read where it stands. */
export type FittedRunProps = RunProps

/**
 * Where a scrolling run places its content. `stretch` is absent: scroll
 * content has no width to stretch into — it is as wide as it is, and either
 * fits or scrolls.
 */
export type ScrollJustify = Exclude<RunJustify, 'stretch'>

/**
 * A run whose content is read by scrolling it.
 *
 * No `exemplar`: a scrolling run puts nothing of its content in the size
 * plane, so it has nothing to state a stand-in for. Its whole answer to
 * content it cannot fit is to scroll, and a stated content width would be a
 * floor it then scrolled inside — a different feature.
 */
export interface ScrollingRunProps extends Omit<RunProps, 'justify' | 'exemplar'> {
  justify?: ScrollJustify | undefined
}

/** Which end a room is kept at. */
type RunEnd = 'start' | 'end'

/**
 * Whether a room is kept clear: by an occupant the run holds, or by one
 * floating over it that the run only makes way for. A room nobody is in is
 * still measured — it is simply not something the content has to avoid.
 */
function held(room: RunRoom | undefined): true | undefined {
  if (room === undefined) return undefined
  return room.occupant !== undefined || room.occupied === true ? true : undefined
}

/** What a room asks for, in the plane where asking is all that happens. */
function SizeRoom({ room, at }: { room: RunRoom; at: RunEnd }) {
  return <span className={css.sizeRoom} data-at={at} aria-hidden="true">{room.reserve}</span>
}

/**
 * The room and who is in it, as the two children that share one cell: the
 * reserve states where the room is, the occupant lands in it, so an occupant
 * narrower than its reserve stands where the reserve's edge promised.
 *
 * Drawn only where the room is kept clear. A room nobody is in has nothing to
 * place and nothing to keep the content off, so putting it in the paint plane
 * would floor a flank against a width the content is free to use.
 */
function Room({ room, at }: { room: RunRoom; at: RunEnd }) {
  return (
    <>
      <span className={clsx(css.room, css.reserve)} data-at={at} aria-hidden="true">{room.reserve}</span>
      {room.occupant === undefined ? null : <span className={css.room} data-at={at}>{room.occupant}</span>}
    </>
  )
}

/**
 * Content with room reserved at either end, read where it stands.
 *
 * Two planes. What the run asks for is settled by hidden exemplars — a
 * stand-in for the content and one per room — which are the only things in
 * flow, so the ask is the content plus the rooms and an occupant cannot change
 * it: it is not in that plane. Where things sit is settled by an overlay laid
 * out at the width that ask won, which is free to place them however the
 * alignment says because nothing it does reaches back into the sizing.
 *
 * Every exemplar is stated or defaults to something inert, so a run's width is
 * a function of what it was told and not of what it is showing. A run whose
 * exemplars do not change cannot change width, whatever happens inside it, and
 * no column holding one can move.
 *
 * Where a room is empty the content honours the alignment across the whole
 * run. Where one is occupied, it moves off that alignment by what the occupant
 * needs and no more — and by nothing at all once the run has the room to
 * spare. The content is never clipped by a reservation: it is spent last,
 * after the flanks and after each room's own share of them.
 *
 * Two rooms holding the same shape are how content is centred against an
 * occupant at one end: the flanks floor at equal widths, so the content sits
 * on the run's true centre while there is slack, and gives ground only when
 * there is not. Nothing states a length for that — the balance is measured
 * from the shape.
 * @param props - the content, the rooms it keeps, and how the slack is placed.
 * @returns the run.
 */
export function FittedRun(
  { start, end, exemplar, justify = 'center', align = 'center', className, contentClassName, children }: FittedRunProps,
) {
  return (
    <span className={clsx(css.run, className)} data-justify={justify} data-align={align}>
      {/* The size plane. The content's stand-in carries the content class so
          that it measures the way the content the reader sees measures. */}
      {start === undefined ? null : <SizeRoom room={start} at="start" />}
      <span className={clsx(css.sizeContent, contentClassName)} aria-hidden="true">{exemplar ?? children}</span>
      {end === undefined ? null : <SizeRoom room={end} at="end" />}
      <span
        className={css.layer}
        data-justify={justify}
        data-align={align}
        data-held={held(start) ?? held(end)}
      >
        <span className={clsx(css.content, contentClassName)}>{children}</span>
        {start === undefined || held(start) === undefined ? null : <Room room={start} at="start" />}
        {end === undefined || held(end) === undefined ? null : <Room room={end} at="end" />}
      </span>
    </span>
  )
}

/**
 * Content with room reserved at one end, read by scrolling it.
 *
 * The reservation rides inside the scroll content, which is what makes the
 * room double as overscroll: an occupant floating over the run's end is
 * cleared at the end of the scroll. The reserve is rendered a second time
 * ahead of the content as slack, which collapses before the scrolling starts —
 * so content that nearly fits moves by exactly the scroll it saves — and which
 * is what puts the content's own centre on the run's centre while it fits.
 *
 * The occupant is passed here only when the caller wants it inside the
 * scroller; one that must float over the end — a control, which cannot nest
 * inside another control — is the caller's own sibling element, placed over the
 * room this run holds open.
 * @param props - the content, the room it keeps, and how the slack is placed.
 * @returns the run.
 */
export const ScrollingRun = forwardRef(function ScrollingRun(
  { start, end, justify = 'center', align = 'center', className, contentClassName, children }: ScrollingRunProps,
  ref: ForwardedRef<HTMLSpanElement>,
) {
  return (
    <span className={clsx(css.scrollBox, className)} data-align={align}>
      {/* The whole of the ask: the rooms, held in every state. No stand-in for
          the content, which a scroller does not need and must not have — its
          content may be arbitrarily long, and asking for that width would hand
          the column the longest content anyone ever put in it. */}
      {start === undefined ? null : <SizeRoom room={start} at="start" />}
      {end === undefined ? null : <SizeRoom room={end} at="end" />}
      <span ref={ref} className={css.scroller} data-justify={justify} data-align={align}>
        <span className={clsx(css.content, contentClassName)}>{children}</span>
        {/* A room is in the scroll content only while it is taken: that is
            what carries the scroll past the content's end and out from under
            whatever floats there. With nothing floating there, there is
            nothing to scroll clear of. */}
        {start === undefined || held(start) === undefined ? null : <Room room={start} at="start" />}
        {end === undefined || held(end) === undefined ? null : <Room room={end} at="end" />}
      </span>
    </span>
  )
})

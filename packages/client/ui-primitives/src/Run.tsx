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

/** What every run holds: content, the room it keeps, and who is in that room. */
interface RunProps {
  /**
   * The widest form the reserved end can ever hold, rendered hidden. The room
   * is whatever this measures, which is why a run states no lengths: give it a
   * mark carrying a rank and the room fits a ranked mark, whether or not the
   * mark showing has a rank.
   */
  reserve?: ReactNode
  /** Who is in that room now. Its absence changes no measurement. */
  occupant?: ReactNode
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

/** A run whose content is read by scrolling it. */
export interface ScrollingRunProps extends Omit<RunProps, 'justify'> {
  justify?: ScrollJustify | undefined
}

/** The room and what is in it, as the two children that share one cell. */
function Room({ reserve, occupant }: Pick<RunProps, 'reserve' | 'occupant'>) {
  return (
    <>
      {reserve === undefined ? null : <span className={clsx(css.room, css.reserve)} aria-hidden="true">{reserve}</span>}
      {/* The occupant names itself, so the stylesheet can ask whether one is
          there. That is the only state a run has, and it is read where it is
          written rather than mirrored into a prop, a class, or a hook. */}
      {occupant === undefined ? null : <span className={clsx(css.room, css.occupant)}>{occupant}</span>}
    </>
  )
}

/**
 * Content with room reserved at one end, read where it stands.
 *
 * Two planes. What the run asks for is settled by hidden exemplars — a ghost
 * of the content and the reserve — which are the only things in flow, so the
 * ask is the content plus the room and an occupant cannot change it: it is not
 * in that plane. Where things sit is settled by an overlay laid out at the
 * width that ask won, which is free to place them however the alignment says
 * because nothing it does reaches back into the sizing.
 *
 * With no occupant the content honours the alignment across the whole run.
 * With one, it moves off that alignment by what the mark needs and no more —
 * and by nothing at all once the run has the room to spare. The content is
 * never clipped by the reservation: it is spent last, after the flanks and
 * after the room's own share of them.
 * @param props - the content, the room it keeps, and how the slack is placed.
 * @returns the run.
 */
export function FittedRun(
  { reserve, occupant, justify = 'center', align = 'center', className, contentClassName, children }: FittedRunProps,
) {
  return (
    <span className={clsx(css.run, className)} data-justify={justify} data-align={align}>
      {/* The size plane. The ghost carries the content class so that it
          measures the way the content the reader sees measures. */}
      <span className={clsx(css.sizeContent, contentClassName)} aria-hidden="true">{children}</span>
      {reserve === undefined ? null : <span className={css.sizeRoom} aria-hidden="true">{reserve}</span>}
      <span className={css.layer} data-justify={justify} data-align={align}>
        <span className={clsx(css.content, contentClassName)}>{children}</span>
        <Room reserve={reserve} occupant={occupant} />
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
  { reserve, occupant, justify = 'center', align = 'center', className, contentClassName, children }: ScrollingRunProps,
  ref: ForwardedRef<HTMLSpanElement>,
) {
  return (
    <span className={clsx(css.scrollerBox, className)} data-justify={justify}>
      <span ref={ref} className={css.scroller} data-align={align}>
        {/* The reserve twice: slack ahead of the content, room behind it. Both
            are inert, so rendering it twice costs nothing but the room it is
            there to state — and it is what keeps the content's own centre on
            the box's centre while it fits. */}
        {reserve === undefined ? null : <span className={css.slack} aria-hidden="true">{reserve}</span>}
        <span className={clsx(css.content, contentClassName)}>{children}</span>
        <Room reserve={reserve} occupant={occupant} />
      </span>
    </span>
  )
})

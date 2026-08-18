// @vitest-environment jsdom
import { createRef } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { FittedRun, ScrollingRun } from '../src/Run.tsx'

afterEach(cleanup)

/**
 * jsdom resolves no layout, so what the suite can hold is the markup the law
 * is expressed in: that the reserve is rendered and hidden from the reader,
 * that it and the occupant share one cell, and that the alignment reaches the
 * stylesheet. The law itself — the floors, the spending order, the overscroll
 * — is measured in a browser and recorded in the Agent Note.
 */
const runOf = (node: HTMLElement) => node.closest('span[data-justify]') as HTMLElement

describe('FittedRun', () => {
  it('renders the content, and the reserve beside it, kept from the reader', () => {
    render(<FittedRun reserve={<i>MARK9</i>}>Priority</FittedRun>)

    const run = runOf(screen.getByText('Priority'))
    const reserve = screen.getByText('MARK9').parentElement as HTMLElement

    expect(run.children).toHaveLength(2)
    expect(reserve.getAttribute('aria-hidden')).toBe('true')
    // The room and what would occupy it are one cell, so an occupant arriving
    // cannot move anything: the cell was already the reserve's width.
    expect(reserve.className).toContain('room')
    expect(reserve.className).toContain('reserve')
  })

  it('gives the occupant the same cell the reserve holds', () => {
    render(<FittedRun reserve={<i>MARK9</i>} occupant={<b>M9</b>}>Priority</FittedRun>)

    const run = runOf(screen.getByText('Priority'))
    const occupant = screen.getByText('M9').parentElement as HTMLElement

    expect(run.children).toHaveLength(3)
    expect(occupant.className).toContain('room')
    // Only the reserve is hidden; the occupant is the one the reader gets.
    expect(occupant.className).not.toContain('reserve')
    expect(occupant.getAttribute('aria-hidden')).toBeNull()
  })

  it('holds no room when it was given no reserve', () => {
    render(<FittedRun>Priority</FittedRun>)

    expect(runOf(screen.getByText('Priority')).children).toHaveLength(1)
  })

  it('states the placement it was asked for, and centres by default', () => {
    const { rerender } = render(<FittedRun>Priority</FittedRun>)
    const run = runOf(screen.getByText('Priority'))
    expect([run.dataset['justify'], run.dataset['align']]).toEqual(['center', 'center'])

    rerender(<FittedRun justify="end" align="baseline">Priority</FittedRun>)
    expect([run.dataset['justify'], run.dataset['align']]).toEqual(['end', 'baseline'])
  })

  it('takes a class of its own and one for the content', () => {
    render(<FittedRun className="outer" contentClassName="inner">Priority</FittedRun>)

    const content = screen.getByText('Priority')
    expect(content.className).toContain('inner')
    expect(runOf(content).className).toContain('outer')
  })
})

describe('ScrollingRun', () => {
  it('names the scroller for a caller that scrolls it, inside the box that places it', () => {
    const scroller = createRef<HTMLSpanElement>()
    render(<ScrollingRun ref={scroller} reserve={<i>ROOM</i>}>chips</ScrollingRun>)

    const scrolled = scroller.current as HTMLElement
    expect(scrolled).toBe(screen.getByText('chips').parentElement)
    expect(scrolled.className).toContain('scroller')
    // The scroller shrink-wraps; the box around it is what places the result.
    expect(scrolled.parentElement?.className).toContain('scrollerBox')
  })

  it('renders the reserve twice, as the slack ahead of the content and the room behind it', () => {
    render(<ScrollingRun reserve={<i>ROOM</i>} occupant={<b>done</b>}>chips</ScrollingRun>)

    const [slack, content, room, occupant] = [...(screen.getByText('chips').parentElement?.children ?? [])]
    expect(slack?.className).toContain('slack')
    expect(content?.textContent).toBe('chips')
    // Room and occupant inside the scroll content, so the scroll reaches the
    // end of the room rather than stopping at the last chip.
    expect(room?.className).toContain('room')
    expect(occupant?.textContent).toBe('done')
    // Two copies of one reserve: the slack gives its width up, the room keeps it.
    expect(screen.getAllByText('ROOM')).toHaveLength(2)
  })

  it('carries no slack when it was given no reserve', () => {
    render(<ScrollingRun>chips</ScrollingRun>)

    const scroller = screen.getByText('chips').parentElement as HTMLElement
    expect(scroller.children).toHaveLength(1)
  })

  it('states the placement it was asked for, on the part that answers it', () => {
    render(<ScrollingRun justify="start" align="baseline">chips</ScrollingRun>)

    const scroller = screen.getByText('chips').parentElement as HTMLElement
    // Where the scroller sits is the box's to answer; how its content sits
    // across the run is the scroller's own.
    expect(scroller.parentElement?.dataset['justify']).toBe('start')
    expect(scroller.dataset['align']).toBe('baseline')
  })
})

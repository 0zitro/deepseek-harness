// @vitest-environment jsdom
import { createRef } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { FittedRun, ScrollingRun } from '../src/Run.tsx'

afterEach(cleanup)

/**
 * jsdom resolves no layout, so what the suite can hold is the markup the law
 * is expressed in: that a fitted run is two planes, that what is there to be
 * measured is kept from the reader, and that the alignment reaches the
 * stylesheet. The law itself — the floors, the spending order, where the
 * content sits against an occupant — is measured in a browser and recorded in
 * the Agent Note.
 */
/** The visible content of a fitted run, the hidden ghost being the first. */
const paintOf = (text: string) => screen.getAllByText(text)[1] as HTMLElement
const layerOf = (text: string) => paintOf(text).parentElement as HTMLElement
const runOf = (text: string) => layerOf(text).parentElement as HTMLElement

describe('FittedRun', () => {
  it('renders the content twice: once to be measured, once to be read', () => {
    render(<FittedRun contentClassName="inner">Priority</FittedRun>)

    const [ghost, content] = screen.getAllByText('Priority') as [HTMLElement, HTMLElement]
    // The ghost is what the run asks its width from, so it must measure the
    // way the content the reader sees measures: same class, same text.
    expect(ghost.className).toContain('sizeContent')
    expect(ghost.className).toContain('inner')
    expect(ghost.getAttribute('aria-hidden')).toBe('true')
    expect(content.className).toContain('inner')
    expect(content.getAttribute('aria-hidden')).toBeNull()
    // One in the size plane, one in the paint plane.
    expect(content.parentElement?.className).toContain('layer')
  })

  it('states the room in both planes, and keeps both copies from the reader', () => {
    render(<FittedRun reserve={<i>MARK9</i>}>Priority</FittedRun>)

    const copies = screen.getAllByText('MARK9').map(n => n.parentElement as HTMLElement)
    const [sizeRoom, room] = copies as [HTMLElement, HTMLElement]

    expect(sizeRoom.className).toContain('sizeRoom')
    expect(room.className).toContain('room')
    expect(room.className).toContain('reserve')
    for (const copy of copies) expect(copy.getAttribute('aria-hidden')).toBe('true')
  })

  it('gives the occupant the room, and lets it name itself', () => {
    render(<FittedRun reserve={<i>MARK9</i>} occupant={<b>M9</b>}>Priority</FittedRun>)

    const occupant = screen.getByText('M9').parentElement as HTMLElement

    expect(occupant.className).toContain('room')
    // The class is the whole of the run's state: the stylesheet reads it to
    // decide whether there is anything to keep the content clear of.
    expect(occupant.className).toContain('occupant')
    expect(occupant.className).not.toContain('reserve')
    expect(occupant.getAttribute('aria-hidden')).toBeNull()
  })

  it('holds no room in either plane when it was given no reserve', () => {
    render(<FittedRun>Priority</FittedRun>)

    // The ghost and the layer, and nothing between them.
    expect(runOf('Priority').children).toHaveLength(2)
    expect(layerOf('Priority').children).toHaveLength(1)
  })

  it('states the placement on both planes, and centres by default', () => {
    const { rerender } = render(<FittedRun>Priority</FittedRun>)
    const placement = (el: HTMLElement) => [el.dataset['justify'], el.dataset['align']]

    // The root carries it as the state a consumer may read; the layer carries
    // it as the switch the stylesheet acts on.
    expect(placement(runOf('Priority'))).toEqual(['center', 'center'])
    expect(placement(layerOf('Priority'))).toEqual(['center', 'center'])

    rerender(<FittedRun justify="end" align="baseline">Priority</FittedRun>)
    expect(placement(runOf('Priority'))).toEqual(['end', 'baseline'])
    expect(placement(layerOf('Priority'))).toEqual(['end', 'baseline'])
  })

  it('takes a class of its own', () => {
    render(<FittedRun className="outer">Priority</FittedRun>)

    expect(runOf('Priority').className).toContain('outer')
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

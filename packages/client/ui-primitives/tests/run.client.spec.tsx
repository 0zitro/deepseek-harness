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

  it('gives the occupant the room and says the room is taken', () => {
    render(<FittedRun reserve={<i>MARK9</i>} occupant={<b>M9</b>}>Priority</FittedRun>)

    const occupant = screen.getByText('M9').parentElement as HTMLElement

    expect(occupant.className).toContain('room')
    expect(occupant.className).not.toContain('reserve')
    expect(occupant.getAttribute('aria-hidden')).toBeNull()
    // Whether the room is taken is the only state a run has, and it is the
    // switch the paint plane's template hangs off.
    expect(layerOf('Priority').dataset['occupied']).toBe('true')
  })

  it('takes the room as taken when the occupant is one it does not hold', () => {
    const { rerender } = render(<FittedRun reserve={<i>MARK9</i>}>Priority</FittedRun>)
    expect(layerOf('Priority').dataset['occupied']).toBeUndefined()

    // A control floating over the run's end cannot nest inside it, so the
    // caller says the room is taken and the run makes way without holding it.
    rerender(<FittedRun reserve={<i>MARK9</i>} occupied>Priority</FittedRun>)
    expect(layerOf('Priority').dataset['occupied']).toBe('true')
    expect(screen.queryByText('M9')).toBeNull()
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
  it('names the scroller for a caller that scrolls it, inside the box that asks for the room', () => {
    const scroller = createRef<HTMLSpanElement>()
    render(<ScrollingRun ref={scroller} reserve={<i>ROOM</i>}>chips</ScrollingRun>)

    const scrolled = scroller.current as HTMLElement
    expect(scrolled).toBe(screen.getByText('chips').parentElement)
    expect(scrolled.className).toContain('scroller')
    expect(scrolled.parentElement?.className).toContain('scrollBox')
  })

  it('asks for the room and nothing else: no ghost of content it means to scroll', () => {
    render(<ScrollingRun reserve={<i>ROOM</i>}>chips</ScrollingRun>)

    const box = screen.getByText('chips').parentElement?.parentElement as HTMLElement
    const room = screen.getByText('ROOM').parentElement as HTMLElement

    expect(room.className).toContain('sizeRoom')
    expect(room.getAttribute('aria-hidden')).toBe('true')
    // The room and the scroller, and no second copy of the content: a strip
    // that scrolls must not hand its column the width of the longest thing
    // anyone ever put in it.
    expect(box.children).toHaveLength(2)
    expect(screen.getAllByText('chips')).toHaveLength(1)
  })

  it('puts the room inside the scroll content only once it is taken', () => {
    const { rerender } = render(<ScrollingRun reserve={<i>ROOM</i>}>chips</ScrollingRun>)
    const scroller = () => screen.getByText('chips').parentElement as HTMLElement

    // Nothing floats over the end, so there is nothing to scroll clear of and
    // both flanks stay equal: the content simply honours the alignment.
    expect(scroller().children).toHaveLength(1)

    rerender(<ScrollingRun reserve={<i>ROOM</i>} occupied>chips</ScrollingRun>)

    // Now it is the overscroll that carries the content's end out from under
    // whatever floats there, so it has to be inside what scrolls.
    expect(scroller().children).toHaveLength(2)
    expect(screen.getAllByText('ROOM')).toHaveLength(2)
  })

  it('holds an occupant it does hold, in the same room', () => {
    render(<ScrollingRun reserve={<i>ROOM</i>} occupant={<b>done</b>}>chips</ScrollingRun>)

    const occupant = screen.getByText('done').parentElement as HTMLElement
    expect(occupant.className).toContain('room')
    expect(occupant.parentElement?.className).toContain('scroller')
  })

  it('carries no room at all when it was given no reserve', () => {
    render(<ScrollingRun>chips</ScrollingRun>)

    const box = screen.getByText('chips').parentElement?.parentElement as HTMLElement
    expect(box.children).toHaveLength(1)
  })

  it('states the placement it was asked for, on the part that answers it', () => {
    render(<ScrollingRun justify="start" align="baseline">chips</ScrollingRun>)

    const scroller = screen.getByText('chips').parentElement as HTMLElement
    expect(scroller.dataset['justify']).toBe('start')
    expect(scroller.dataset['align']).toBe('baseline')
    // The box carries the cross axis too, since the run's height comes from it.
    expect(scroller.parentElement?.dataset['align']).toBe('baseline')
  })
})

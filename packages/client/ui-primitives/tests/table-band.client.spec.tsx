// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { bandOffset, TableGutter, TableSeam } from '../src/TableBand.tsx'

afterEach(cleanup)

/** Report a box for the band, since jsdom gives every element none. */
function occupying(band: HTMLElement, box: { top: number; bottom: number; left: number; right: number }) {
  vi.spyOn(band, 'getBoundingClientRect').mockReturnValue({
    ...box, width: box.right - box.left, height: box.bottom - box.top, x: box.left, y: box.top,
    toJSON: () => ({}),
  })
}

describe('bandOffset', () => {
  it('counts from the band\'s own start', () => {
    expect(bandOffset({ start: 100, end: 140 }, 118)).toBe(18)
  })

  it('holds at whichever end the pointer went past', () => {
    // A band answers past itself, so this is the whole of the hold-still rule:
    // the drawing stays where it was rather than chasing a pointer outside.
    expect(bandOffset({ start: 100, end: 140 }, 60)).toBe(0)
    expect(bandOffset({ start: 100, end: 140 }, 400)).toBe(40)
  })

  it('answers at either edge exactly', () => {
    expect([bandOffset({ start: 100, end: 140 }, 100), bandOffset({ start: 100, end: 140 }, 140)]).toEqual([0, 40])
  })
})

describe('TableSeam', () => {
  it('is a named control that draws only once the pointer has asked', () => {
    const onPress = vi.fn()
    render(<TableSeam label="add below" onPress={onPress}><i>mark</i></TableSeam>)
    const seam = screen.getByRole('button', { name: 'add below' })
    occupying(seam, { top: 100, bottom: 114, left: 0, right: 200 })

    // The rows either side keep every pixel until the pointer arrives.
    expect(seam.dataset['drawn']).toBeUndefined()

    fireEvent.pointerEnter(seam, { clientY: 107, clientX: 50 })
    expect(seam.dataset['drawn']).toBe('true')

    fireEvent.pointerLeave(seam)
    expect(seam.dataset['drawn']).toBeUndefined()

    fireEvent.click(seam)
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('publishes where the pointer is along it, clamped to itself', () => {
    render(<TableSeam label="add below" onPress={vi.fn()}>mark</TableSeam>)
    const seam = screen.getByRole('button', { name: 'add below' })
    occupying(seam, { top: 100, bottom: 114, left: 0, right: 200 })

    fireEvent.pointerEnter(seam, { clientY: 104 })
    expect(seam.style.getPropertyValue('--dsh-table-seam-y')).toBe('4px')

    fireEvent.pointerMove(seam, { clientY: 111 })
    expect(seam.style.getPropertyValue('--dsh-table-seam-y')).toBe('11px')

    // Past the band but inside the reach it grows while drawn: the line stops
    // where the band stops rather than following a pointer that has left it.
    fireEvent.pointerMove(seam, { clientY: 122 })
    expect(seam.style.getPropertyValue('--dsh-table-seam-y')).toBe('14px')
  })
})

describe('TableGutter', () => {
  it('takes its width from the lane it stands in, at the edge it was given', () => {
    const { rerender } = render(<TableGutter lane={0} label="drop" onPress={vi.fn()}>x</TableGutter>)
    const gutter = screen.getByRole('button', { name: 'drop' })
    const width = 'var(--dsh-table-gutter-0, var(--dsh-table-gutter))'

    // The lane carries this width beyond the sash's grip, so the two cannot
    // share a pixel however either is styled.
    expect(gutter.style.width).toBe(width)
    expect(gutter.style.insetInlineStart).toBe(`calc(-1 * ${width})`)
    expect(gutter.style.insetInlineEnd).toBe('')

    rerender(<TableGutter lane={2} side="trailing" label="drop" onPress={vi.fn()}>x</TableGutter>)
    expect(gutter.style.insetInlineEnd).toBe('calc(-1 * var(--dsh-table-gutter-2, var(--dsh-table-gutter)))')
    expect(gutter.style.insetInlineStart).toBe('')
  })

  it('follows the pointer across itself, along its own axis', () => {
    render(<TableGutter lane={0} label="drop" onPress={vi.fn()}>x</TableGutter>)
    const gutter = screen.getByRole('button', { name: 'drop' })
    occupying(gutter, { top: 0, bottom: 40, left: 300, right: 314 })

    fireEvent.pointerEnter(gutter, { clientX: 306 })
    expect(gutter.style.getPropertyValue('--dsh-table-gutter-x')).toBe('6px')

    fireEvent.pointerMove(gutter, { clientX: 1000 })
    expect(gutter.style.getPropertyValue('--dsh-table-gutter-x')).toBe('14px')
  })
})

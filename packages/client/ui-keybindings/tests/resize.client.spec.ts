import { describe, expect, it } from 'vitest'
import { resizeWidths } from '../src/client/resize.ts'

const WIDTHS = [200, 200, 200, 120, 120]

describe('resizeWidths', () => {
  it('moves what one column gains from the one beside it', () => {
    expect(resizeWidths(WIDTHS, 0, 40)).toEqual([240, 160, 200, 120, 120])
  })

  it('leaves every other column alone and conserves the pair exactly', () => {
    const resized = resizeWidths(WIDTHS, 2, -30)

    expect(resized.slice(0, 2)).toEqual([200, 200])
    expect(resized[4]).toBe(120)
    // Conserved in pixels, so the table's own width cannot change with a drag.
    expect((resized[2] ?? 0) + (resized[3] ?? 0)).toBe(320)
  })

  it('keeps a column dragged shut reachable', () => {
    const resized = resizeWidths(WIDTHS, 0, -1000)

    expect(resized[0]).toBe(80)
    expect((resized[0] ?? 0) + (resized[1] ?? 0)).toBe(400)
  })

  it('returns the widths themselves when the drag changes nothing', () => {
    expect(resizeWidths(WIDTHS, 0, 0)).toBe(WIDTHS)
    // Already at the floor, so there is nothing further to give in that direction.
    expect(resizeWidths(resizeWidths(WIDTHS, 0, -1000), 0, -1000)).toEqual(resizeWidths(WIDTHS, 0, -1000))
  })

  it('keeps the split of a pair too narrow to hold both floors', () => {
    const narrow = [100, 40, 200, 120, 120]

    expect(resizeWidths(narrow, 0, 20)).toBe(narrow)
  })

  it('ignores a sash that is not between two columns', () => {
    expect(resizeWidths(WIDTHS, 4, 20)).toBe(WIDTHS)
    expect(resizeWidths(WIDTHS, -1, 20)).toBe(WIDTHS)
  })
})

import { describe, expect, it } from 'vitest'
import { resizeWidths } from '../src/table-resize.ts'

const WIDTHS = [200, 200, 200, 120, 120]
/** What each column measures at its narrowest; the last two are narrow ones. */
const FLOORS = [90, 90, 90, 40, 38]

describe('resizeWidths', () => {
  it('moves what one column gains from the one beside it', () => {
    expect(resizeWidths(WIDTHS, FLOORS, 0, 40)).toEqual([240, 160, 200, 120, 120])
  })

  it('leaves every other column alone and conserves the pair exactly', () => {
    const resized = resizeWidths(WIDTHS, FLOORS, 2, -30)

    expect(resized.slice(0, 2)).toEqual([200, 200])
    expect(resized[4]).toBe(120)
    // Conserved in pixels, so the table's own width cannot change with a drag.
    expect((resized[2] ?? 0) + (resized[3] ?? 0)).toBe(320)
  })

  it('stops a column at its own floor, not at a floor shared with the rest', () => {
    const resized = resizeWidths(WIDTHS, FLOORS, 3, -1000)

    // The priority column's content is narrow, so it may become narrow: a
    // floor taken from a wider column would refuse the width it can give up.
    expect(resized[3]).toBe(40)
    expect((resized[3] ?? 0) + (resized[4] ?? 0)).toBe(240)
  })

  it('keeps a column dragged shut reachable', () => {
    const resized = resizeWidths(WIDTHS, FLOORS, 0, -1000)

    expect(resized[0]).toBe(90)
    expect((resized[0] ?? 0) + (resized[1] ?? 0)).toBe(400)
  })

  it('returns the widths themselves when the drag changes nothing', () => {
    expect(resizeWidths(WIDTHS, FLOORS, 0, 0)).toBe(WIDTHS)
    // Already at the floor, so there is nothing further to give in that direction.
    const shut = resizeWidths(WIDTHS, FLOORS, 0, -1000)
    expect(resizeWidths(shut, FLOORS, 0, -1000)).toEqual(shut)
  })

  it('keeps the split of a pair too narrow to hold both floors', () => {
    const narrow = [100, 40, 200, 120, 120]

    expect(resizeWidths(narrow, FLOORS, 0, 20)).toBe(narrow)
  })

  it('ignores a sash that is not between two columns', () => {
    expect(resizeWidths(WIDTHS, FLOORS, 4, 20)).toBe(WIDTHS)
    expect(resizeWidths(WIDTHS, FLOORS, -1, 20)).toBe(WIDTHS)
  })

  it('treats a column it was given no floor for as having none', () => {
    // The floors are measured from the same columns, so a missing one is not
    // reachable through the page; the arithmetic still has to say what it means.
    expect(resizeWidths(WIDTHS, [], 0, -1000)).toEqual([0, 400, 200, 120, 120])
  })
})

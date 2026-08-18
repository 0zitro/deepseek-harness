import { describe, expect, it } from 'vitest'
import { resizeShares } from '../src/client/resize.ts'

const SHARES = [2, 2, 2, 1, 1]

describe('resizeShares', () => {
  it('moves what one column gains from the one beside it', () => {
    const resized = resizeShares(SHARES, 0, 0.25)

    // The pair totals 4, so a quarter of it moves one unit across.
    expect(resized).toEqual([3, 1, 2, 1, 1])
  })

  it('leaves every other column alone', () => {
    const resized = resizeShares(SHARES, 2, -0.1)

    expect(resized.slice(0, 2)).toEqual([2, 2])
    expect(resized[4]).toBe(1)
    // The pair it touched still totals what it did before.
    expect((resized[2] ?? 0) + (resized[3] ?? 0)).toBeCloseTo(3)
  })

  it('keeps a column dragged shut reachable', () => {
    const resized = resizeShares(SHARES, 0, -1)

    expect(resized[0]).toBeGreaterThan(0)
    expect((resized[0] ?? 0) + (resized[1] ?? 0)).toBe(4)
  })

  it('returns the shares themselves when the drag changes nothing', () => {
    expect(resizeShares(SHARES, 0, 0)).toBe(SHARES)
    // A drag already at the floor cannot move further in that direction.
    expect(resizeShares(resizeShares(SHARES, 0, -1), 0, -1)).toEqual(resizeShares(SHARES, 0, -1))
  })

  it('ignores a boundary that is not between two columns', () => {
    expect(resizeShares(SHARES, 4, 0.2)).toBe(SHARES)
    expect(resizeShares(SHARES, -1, 0.2)).toBe(SHARES)
  })
})

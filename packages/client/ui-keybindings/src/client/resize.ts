/**
 * Resizing the table's columns.
 *
 * A drag moves one boundary, so it concerns exactly the two columns that meet
 * there: what one gains the other gives up, and every other column is left
 * alone. Widths are shares rather than pixels, so the table still answers a
 * change in the panel's width after the user has sized it.
 */

/** The share a column keeps whatever the drag asks for, as a fraction of its pair. */
const MINIMUM_SHARE = 0.08

/**
 * The shares after dragging the boundary that follows `index`.
 *
 * The pair's total is conserved, so the columns on either side of the drag
 * absorb it entirely and the table's own width is untouched. Neither column
 * falls below a floor, which keeps a column that was dragged shut reachable:
 * its share never reaches zero, so dragging back reopens it.
 * @param shares - the current shares, one per column.
 * @param index - the column on the leading side of the dragged boundary.
 * @param fraction - the drag, as a fraction of the two columns' width together.
 * @returns the shares after the drag, or the given ones when nothing moves.
 */
export function resizeShares(
  shares: readonly number[],
  index: number,
  fraction: number,
): readonly number[] {
  const leading = shares[index]
  const trailing = shares[index + 1]
  if (leading === undefined || trailing === undefined) return shares

  const pair = leading + trailing
  const floor = pair * MINIMUM_SHARE
  const wanted = leading + fraction * pair
  const next = Math.min(Math.max(wanted, floor), pair - floor)
  if (next === leading) return shares

  return shares.map((share, at) => {
    if (at === index) return next
    return at === index + 1 ? pair - next : share
  })
}

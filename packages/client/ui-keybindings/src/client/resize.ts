/**
 * Resizing the table's columns.
 *
 * A drag moves one sash, so it concerns exactly the two columns that meet
 * there: what one gains the other gives up, and every other column is left
 * alone. Widths are pixels rather than shares, because a share only maps to a
 * width while every column is above its content's floor — pinch one against
 * that floor and the space it cannot give up is redistributed to every other
 * column, which moves columns the drag never touched and changes the table's
 * total. In pixels the pair conserves exactly, whatever the rest is doing.
 */

/** The width a column keeps whatever the drag asks for. */
const MINIMUM_WIDTH = 80

/**
 * The widths after dragging the sash that follows `index`.
 *
 * The pair's total is conserved, so the columns either side of the sash absorb
 * the drag entirely and the table's own width never changes — a horizontal
 * scroll neither appears nor disappears because a column was resized. Neither
 * column falls below a floor, which keeps one dragged shut reachable.
 * @param widths - the current widths in pixels, one per column.
 * @param index - the column on the leading side of the dragged sash.
 * @param delta - the drag in pixels, toward the inline end.
 * @returns the widths after the drag, or the given ones when nothing moves.
 */
export function resizeWidths(
  widths: readonly number[],
  index: number,
  delta: number,
): readonly number[] {
  const leading = widths[index]
  const trailing = widths[index + 1]
  if (leading === undefined || trailing === undefined) return widths

  const pair = leading + trailing
  // A pair too narrow to hold both floors keeps the split it has.
  if (pair < MINIMUM_WIDTH * 2) return widths

  const next = Math.min(Math.max(leading + delta, MINIMUM_WIDTH), pair - MINIMUM_WIDTH)
  if (next === leading) return widths

  return widths.map((width, at) => {
    if (at === index) return next
    return at === index + 1 ? pair - next : width
  })
}

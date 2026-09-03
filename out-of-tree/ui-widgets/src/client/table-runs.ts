/**
 * Runs of adjacent rows sharing a value, for a cell that spans them.
 *
 * A table often shows one value once across the rows it belongs to — a command
 * above its bindings, a date above its entries — and that is a fact about the
 * *presented sequence*, not about the data. Rows are joint because they are
 * next to each other, so an order that separates them separates the runs too,
 * and the same value read twice in two places is the presentation telling the
 * truth about the order the reader chose rather than a defect to reunite.
 *
 * This is adjacent grouping, the operation `itertools.groupby` performs and
 * relational `GROUP BY` does not: maximal contiguous segments of equal key, in
 * one pass, each carrying where it starts. Nothing shorter is possible, since
 * adjacency is a property of the sequence and not of the values in it.
 */

/** One maximal run of adjacent rows sharing a key, in the presented order. */
export interface TableRun<Row> {
  /** The key every row of this run projects to. */
  key: string
  /** Which of this key's runs this is, counted from the top of the presentation. */
  ordinal: number
  /**
   * The run's rows, in presented order, and never none of them: a run exists
   * because a row opened it. Saying so in the type spares every reader of a
   * run the ceremony of asking whether the first one is there.
   */
  rows: readonly [Row, ...Row[]]
  /** Where the run's first row sits in the presentation, counting from zero. */
  start: number
}

/**
 * Segment the presented rows into maximal runs of adjacent equal keys.
 *
 * Total in both directions: no rows is no runs, and every row belongs to
 * exactly one run. The key is a string because it has to survive into a React
 * key, so a structured value gets its spelling here, where the caller's own
 * grammar is — the caller knows what makes two of its rows the same.
 * @param rows - the rows in the order they are shown.
 * @param keyOf - what makes adjacent rows joint.
 * @returns the runs, in the same order.
 */
export function runsBy<Row>(
  rows: readonly Row[],
  keyOf: (row: Row) => string,
): readonly TableRun<Row>[] {
  const runs: TableRun<Row>[] = []
  // How many runs each key has opened, which is what numbers them.
  const opened = new Map<string, number>()

  rows.forEach((row, start) => {
    const key = keyOf(row)
    const open = runs[runs.length - 1]
    if (open !== undefined && open.key === key) {
      runs[runs.length - 1] = { ...open, rows: [...open.rows, row] }
      return
    }

    const ordinal = opened.get(key) ?? 0
    opened.set(key, ordinal + 1)
    runs.push({ key, ordinal, rows: [row], start })
  })

  return runs
}

/**
 * A run's identity: its key, and which of that key's runs it is.
 *
 * Neither half alone will do, and both failures are worth stating because each
 * looks right until an order changes. The key alone collides the moment a sort
 * separates one key's rows, and two runs answering to one name cost the later
 * one its place. The run's first row will not do either: a run's rows come and
 * go as the reader edits, so an identity taken from them changes under an edit
 * and takes with it whatever the reader was in the middle of. Nor will the
 * run's position, which every run below an insertion would shift.
 *
 * Spelled ordinal first, because an ordinal spells no separator: whatever
 * grammar a key uses, including one that spells this separator itself, the
 * identity stays injective.
 * @param run - the run to name.
 * @returns its identity, stable across everything but a re-ordering.
 */
export function runId(run: TableRun<unknown>): string {
  return `${run.ordinal}:${run.key}`
}

/**
 * Segment again inside runs already found, so the inner runs break where the
 * outer ones do.
 *
 * Two joint columns are independent by default — two calls to `runsBy` that
 * know nothing of each other, whose spanning cells are rectangles in different
 * tracks — which is what a table wants when its two values vary freely. This
 * is the other relationship, where the inner value is only ever read within
 * one outer value: a month inside a year, a section inside a chapter. Which of
 * the two a table means is the table's to say, so it is a second function
 * rather than a mode.
 * @param outer - the runs to segment within.
 * @param keyOf - what makes adjacent rows joint inside one of them.
 * @returns the inner runs, positioned across the whole presentation.
 */
export function runsWithin<Row>(
  outer: readonly TableRun<Row>[],
  keyOf: (row: Row) => string,
): readonly TableRun<Row>[] {
  const opened = new Map<string, number>()

  return outer.flatMap(run => runsBy(run.rows, keyOf).map((inner) => {
    const ordinal = opened.get(inner.key) ?? 0
    opened.set(inner.key, ordinal + 1)
    // Positions and ordinals count across the presentation, not within the
    // outer run: they are what the whole table places and keys by.
    return { ...inner, ordinal, start: run.start + inner.start }
  }))
}

/**
 * Where a run stands, as a grid row.
 * @param firstRowLine - the grid line the first presented row occupies, which
 * is a caller's fact: how many heading rows come before it is not this
 * module's to assume.
 * @param run - the run to place.
 * @returns the `grid-row` the run's spanning cell takes.
 */
export function tableRunRows(firstRowLine: number, run: TableRun<unknown>): string {
  return `${firstRowLine + run.start} / span ${run.rows.length}`
}

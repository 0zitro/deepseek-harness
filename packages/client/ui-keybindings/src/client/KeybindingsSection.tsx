/** The Keybindings settings page: one table row per effective binding. */
import { Fragment, useMemo, useState, type PointerEvent, type ReactNode } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { FittedRun, ScrollingRun } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import {
  type Keybinding, type KeybindingEdit, type KeybindingOverrideRef, type KeybindingSource,
  type KeyStroke, type SourcedOverride,
} from '../keybinding.ts'
import { parseWhenClause } from '../when-clause.ts'
import type { UiActionDefinition } from './action-registry.ts'
import type { UiActionId } from '../ui-action.ts'
import { useDraft } from './draft.ts'
import { ControlRoom, KeybindingRecorder } from './KeybindingRecorder.tsx'
import { resizeWidths } from './resize.ts'
import {
  forkedKey, keybindingRows, type EffectiveRow, type KeybindingRow, type SupersededRow,
} from './rows.ts'
import {
  COLUMNS, dropSort, sortRows, toggleSort,
  type ColumnSort, type SortableColumn, type SortDirection,
} from './sorting.ts'
import { StrokeChips } from './StrokeChips.tsx'
import css from './keybindings.module.css'

/** Registration-side preference face. */
export interface KeybindingsSectionInjected {
  hooks: {
    /** Registered actions bound as useActions. */
    actions: SnapshotStore<readonly UiActionDefinition[]>
    /** The overrides in force, each stamped by its provider, bound as useBindings. */
    bindings: SnapshotStore<readonly SourcedOverride[]>
  }
  /** Persist one field the user changed, against the default it overrides. */
  setBinding: (ref: KeybindingOverrideRef, base: Keybinding, edit: KeybindingEdit) => void
  /** Drop the user's contribution to a seat, leaving what the seat ships. */
  removeBinding: (ref: KeybindingOverrideRef) => void
}

/** Full Settings-page props. */
export type KeybindingsSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'keybindings'>
  & InjectFace<KeybindingsSectionInjected>

/** The section's localized translate face. */
type SectionT = PropsLocale<'keybindings'>['t']

/** Consecutive rows of one command, which share a single label cell. */
interface CommandRun {
  label: string
  description?: string | undefined
  rows: readonly KeybindingRow[]
  /**
   * What tells one run from another: the command, and which of that command's
   * runs this is. A command owns one run while its bindings are adjacent and
   * several once an order separates them, so the command alone is not an
   * identity — two runs answering to one collide, and a collision costs the
   * later one its place in the grid. Naming a run by a row it holds is not one
   * either: the rows of a run come and go as the user edits, and a run that
   * changed identity under an edit would take the field being edited with it.
   */
  id: string
  /** Grid row its first binding stands on; the heading holds the first. */
  line: number
  /** What a binding added to this command would be. */
  addition: InsertPoint
}

/** The grid row the headings occupy, above every binding. */
const HEADING_LINE = 1

/**
 * Group the ordered rows into runs of one command, each knowing where it
 * stands. Every cell names its own row rather than taking one from
 * auto-placement, because auto-placement steps over whatever is already there:
 * one definitely placed item spanning a row would push that row's cells down.
 */
function commandRuns(rows: readonly KeybindingRow[]): readonly CommandRun[] {
  const runs: CommandRun[] = []
  // How many runs each command has opened so far, which is what numbers them.
  const opened = new Map<UiActionId, number>()
  // A binding added to a command forks the last one it owns, so the addition
  // is rebuilt as the run grows rather than looked up afterwards.
  const addition = (origin: KeybindingRow, label: string): InsertPoint => ({
    label,
    ref: { action: origin.action, key: forkedKey(rows, origin) },
    base: origin.base,
  })

  for (const row of rows) {
    const open = runs[runs.length - 1]
    if (open !== undefined && open.rows[0]?.action === row.action) {
      runs[runs.length - 1] = { ...open, rows: [...open.rows, row], addition: addition(row, open.label) }
      continue
    }
    const ordinal = opened.get(row.action) ?? 0
    opened.set(row.action, ordinal + 1)
    runs.push({
      label: row.label,
      description: row.description,
      rows: [row],
      id: `${row.action}:${ordinal}`,
      line: open === undefined ? HEADING_LINE + 1 : open.line + open.rows.length,
      addition: addition(row, row.label),
    })
  }
  return runs
}

/**
 * A binding a command would gain, and what it would fork from. One per
 * command, drawn under the last binding it owns: the space between two
 * commands belongs to the one above it and to nothing else, because a place
 * whose command depended on which half of that space the pointer was in gave
 * the reader nothing to read.
 */
interface InsertPoint {
  /** The command it joins, for the control's name. */
  label: string
  /** The seat the new binding takes, and the snapshot it forks. */
  ref: KeybindingOverrideRef
  base: Keybinding
}

/**
 * What tells one row of a seat from another: a seat shows the binding it ships
 * and the one that dispatches, and each is a row of its own. The dispatching
 * row keeps this identity when the user takes the seat over — a key that
 * changed with the source would remount the row mid-edit, losing the focus and
 * the draft of the very field that caused the change.
 */
function contributionKey(row: KeybindingRow): string {
  return `${row.action}:${row.key}:${row.superseded ? 'shipped' : 'bound'}`
}

/** The seat something addresses, as one string. */
function seatKey({ action, key }: KeybindingOverrideRef): string {
  return `${action}:${key}`
}

/** Join the defined names; a css-module lookup is optional by type. */
function classes(...names: readonly (string | false | undefined)[]): string {
  return names.filter(name => typeof name === 'string').join(' ')
}

/** An overridden field reads as the user's; an inherited one recedes. */
function fieldClass(overridden: boolean): string | undefined {
  return overridden ? css.overridden : css.inherited
}

/**
 * Where a binding comes from: the shipped default, the user, or the plugin
 * that contributed it, which a plugin-contributed default will carry.
 * @param source - the merged entry's source.
 * @param t - the section's translate face.
 * @returns the text the source column shows.
 */
export function sourceLabel(source: KeybindingSource, t: SectionT): string {
  if (source === 'system') return t('source.system')
  if (source === 'user') return t('source.user')
  return source
}

/** Whether a clause is storable: blank states no predicate, anything else must parse. */
function storableClause(clause: string): boolean {
  if (clause === '') return true
  try {
    parseWhenClause(clause)
    return true
  } catch {
    return false
  }
}

/** Whether a prio is storable: 0 is highest and only whole, non-negative values order. */
function storablePrio(prio: string): boolean {
  return /^\d+$/.test(prio.trim())
}

/** A blur-committed cell input, flagged while its draft is unfit to store. */
function CellInput(
  { value, storable, commit, className, ...rest }: {
    value: string
    storable: (draft: string) => boolean
    commit: (draft: string) => void
    className?: string | undefined
    placeholder?: string
    type?: 'number'
    min?: number
    step?: number
    'aria-label': string
  },
) {
  const [invalid, setInvalid] = useState(false)
  const [draft, setDraft] = useDraft(value)

  const onBlur = () => {
    const fit = storable(draft)
    // A blank draft in a field where blank states nothing is an abandoned
    // edit, not a mistake: it returns to the stored value without complaint.
    if (!fit && draft.trim() === '') {
      setDraft(value)
      setInvalid(false)
      return
    }

    setInvalid(!fit)
    if (fit && draft !== value) commit(draft)
  }

  return (
    <input
      {...rest}
      className={classes(css.cellInput, className, invalid && css.invalid)}
      value={draft}
      onChange={(event) => { setDraft(event.target.value) }}
      onBlur={onBlur}
      aria-invalid={invalid || undefined}
      spellCheck={false}
    />
  )
}

/** The four editable cells of one binding: gesture, clause, prio, source. */
function BindingCells(
  { row, armed, setBinding, t }: {
    row: EffectiveRow
    armed: boolean
    setBinding: KeybindingsSectionInjected['setBinding']
    t: SectionT
  },
) {
  const ref = { action: row.action, key: row.key } as const

  // Each control writes its own field only: a field the user did not touch
  // stays absent from the override and keeps following the default.
  const setStrokes = (strokes: KeyStroke[]) => { setBinding(ref, row.base, { strokes }) }

  return (
    <>
      <div className={classes(css.cell, fieldClass(row.overridden.strokes))} style={{ gridColumn: cellLine(1) }}>
        <KeybindingRecorder
          armed={armed}
          strokes={row.entry.strokes}
          onStrokesChange={setStrokes}
          label={row.label}
          doneLabel={t('recorder.done')}
          clearLabel={t('recorder.clear')}
        />
      </div>
      <div className={css.cell} style={{ gridColumn: cellLine(2) }}>
        <CellInput
          value={row.entry.when ?? ''}
          storable={storableClause}
          commit={(when) => { setBinding(ref, row.base, { when }) }}
          className={classes(css.clauseInput, fieldClass(row.overridden.when))}
          placeholder={t('when.placeholder')}
          aria-label={`${t('column.when')}: ${row.label}`}
        />
      </div>
      <div className={css.cell} style={{ gridColumn: cellLine(3) }}>
        <CellInput
          value={String(row.prio)}
          storable={storablePrio}
          commit={(prio) => { setBinding(ref, row.base, { prio: Number(prio) }) }}
          className={classes(css.prioInput, fieldClass(row.overridden.prio))}
          type="number"
          min={0}
          step={1}
          aria-label={`${t('column.prio')}: ${row.label}`}
        />
      </div>
      <div className={classes(css.cell, css.source)} style={{ gridColumn: cellLine(4) }}>
        {sourceLabel(row.entry.source, t)}
      </div>
    </>
  )
}

/**
 * The four cells of a binding an override supersedes. It is shown because it
 * is what the override departs from and what returns if the override goes, and
 * it is inert: nothing dispatches it, so it holds no place in the order, and
 * editing it would only write the override that already took its seat.
 */
function ShippedCells({ row, t }: { row: SupersededRow; t: SectionT }) {
  return (
    <>
      <div className={classes(css.cell, css.shipped)} style={{ gridColumn: cellLine(1) }}>
        {/* The same run the recorder uses, with the same room reserved, so a
            struck strip and the live one above it hold their chips in the same
            place — the two rows are meant to read against each other. */}
        <ScrollingRun className={classes(css.shippedBox, css.recorderLayout)} reserve={<ControlRoom />}>
          <span className={css.strokeStrip}>
            {row.entry.strokes.map((stroke, index) => <StrokeChips key={index} stroke={stroke} />)}
          </span>
        </ScrollingRun>
      </div>
      <div className={classes(css.cell, css.shipped)} style={{ gridColumn: cellLine(2) }}>
        <span className={classes(css.shippedBox, css.clauseText)}>{row.entry.when ?? ''}</span>
      </div>
      <div className={classes(css.cell, css.shipped)} style={{ gridColumn: cellLine(3) }}>
        <span className={classes(css.shippedBox, css.shippedPlace)} />
      </div>
      <div className={classes(css.cell, css.source, css.shipped)} style={{ gridColumn: cellLine(4) }}>
        {sourceLabel(row.entry.source, t)}
      </div>
    </>
  )
}

/** The control that drops a binding, drawn at the weight of the rest. */
function Minus() {
  return (
    <svg viewBox="0 0 12 12" width="12" height="12">
      <path d="M2.5 6h7" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  )
}

/** Whether a band draws what it would add. */
function draw(band: HTMLElement, on: boolean): void {
  if (on) band.dataset['drawn'] = 'true'
  else delete band.dataset['drawn']
}

/** The control that adds a binding, drawn at the same weight as the others. */
function Plus() {
  return (
    <svg viewBox="0 0 12 12" width="12" height="12">
      <path d="M6 2.5v7M2.5 6h7" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  )
}

/**
 * The place a binding is dropped: the lane the row begins at, which is widened
 * to carry this beside the sash rather than over it. The two never share a
 * pixel, because a press meant for a column boundary must not be able to land
 * on the one control in the table that destroys something — and for the same
 * reason this band reaches no further than itself, unlike the one that adds.
 */
function RemoveControl(
  { row, onRemove, t }: { row: EffectiveRow; onRemove: (ref: KeybindingOverrideRef) => void; t: SectionT },
) {
  const follow = (event: PointerEvent<HTMLButtonElement>) => {
    const band = event.currentTarget
    const bounds = band.getBoundingClientRect()
    const reach = bounds.width / 2

    band.style.setProperty('--dsh-remove-x', `${event.clientX - bounds.left - reach}px`)
    draw(band, true)
  }

  return (
    <button
      type="button"
      className={css.remove}
      aria-label={`${t('binding.remove')}: ${row.label}`}
      onClick={() => { onRemove({ action: row.action, key: row.key }) }}
      onPointerMove={follow}
      onPointerLeave={(event) => { draw(event.currentTarget, false) }}
    >
      <span className={css.removeRule} />
      <span className={classes(css.ghost, css.removeMark)}><Minus /></span>
      <span className={css.removeRule} />
    </button>
  )
}

/**
 * One binding's cells, on the table's columns from the second on. A grid row
 * is as tall as the tallest thing in it, which is the command's own cell
 * whenever its description runs to another line — so anything drawn against
 * the row rather than against these cells lands nowhere near them. This box is
 * what the cells make it, and it is what the place to add a binding hangs off.
 */
function SubRow({ line, children }: { line: number; children: ReactNode }) {
  return (
    <div className={css.subRow} style={{ gridColumn: `${columnLine(1)} / -1`, gridRow: line }}>
      {children}
    </div>
  )
}

/**
 * The place a binding is added: a band of the space no box occupies, drawing
 * the line the new binding would take once the pointer is on it. The band is
 * the control — pressing anywhere along the line adds the binding, rather than
 * only on the mark in the middle of it.
 */
function InsertControl(
  { point, onAdd, t }: { point: InsertPoint; onAdd: (point: InsertPoint) => void; t: SectionT },
) {
  // The line follows the pointer across the band it is drawn in, so it reads
  // as the place the binding would land rather than as a fixture of the row.
  // The band is the only thing that knows where its own middle is, and that
  // changes with every drag of a sash, so it is measured at the move.
  const follow = (event: PointerEvent<HTMLButtonElement>) => {
    const band = event.currentTarget
    const bounds = band.getBoundingClientRect()
    const reach = bounds.height / 2
    const offset = event.clientY - bounds.top - reach

    // Past the band the line holds where it was: a drawn band answers a wider
    // space than it marks, so the pointer can leave the line without losing
    // it, and what it stops doing there is following.
    if (Math.abs(offset) <= reach) band.style.setProperty('--dsh-insert-y', `${offset}px`)
    draw(band, true)
  }

  return (
    <button
      type="button"
      className={css.insert}
      aria-label={`${t('binding.add')}: ${point.label}`}
      onClick={() => { onAdd(point) }}
      onPointerMove={follow}
      onPointerLeave={(event) => { draw(event.currentTarget, false) }}
    >
      <span className={css.insertRule} />
      <span className={classes(css.ghost, css.insertPlus)}><Plus /></span>
      <span className={css.insertRule} />
    </button>
  )
}

/**
 * The sort direction, drawn rather than typed: a glyph's weight depends on
 * whichever font backs it, and this one has to read at 12px beside a heading.
 */
function SortArrow({ direction }: { direction: SortDirection }) {
  const shaft = direction === 'asc' ? 'M6 10.5V2.5' : 'M6 1.5v8'
  const head = direction === 'asc' ? 'M2.5 6L6 2.5 9.5 6' : 'M2.5 6l3.5 3.5L9.5 6'

  return (
    <svg className={css.sortArrow} viewBox="0 0 12 12" width="12" height="12">
      <path
        d={`${shaft} ${head}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * Grid lines of each column and of each sash. The sashes are lanes of the grid
 * rather than ornaments hung inside a column, so a sash belongs to the
 * boundary it divides and can span every row of the table.
 */
const columnLine = (index: number) => 1 + index * 2
const sashLine = (index: number) => 2 + index * 2

/**
 * The same column, addressed from inside a sub-row. A sub-row takes the
 * table's tracks from the second column on, so its own lines start there.
 */
const cellLine = (index: number) => columnLine(index - 1)

/**
 * The grid's tracks for the given column sizes, with the lanes between them.
 * The sizes are exact rather than floored: a floor a drag cannot cross would
 * be space one column could not give up, and the other columns would silently
 * absorb it. What a drag may not cross is measured instead — see `floorsOf`.
 */
function tracks(columns: readonly string[]): string {
  return columns
    .map((column, index) => index === 0 ? column : `${lane(index - 1)} ${column}`)
    .join(' ')
}

/**
 * What each column may not be dragged below: what its own heading measures,
 * which is the label plus the mark's reserved room where one is shown. The
 * rows have no say — their fields clip and their gestures scroll, so letting
 * a clause decide a column's floor would hold a column open for content that
 * has somewhere else to go.
 *
 * It is measured rather than computed from the stylesheet's own numbers: each
 * heading is asked for its narrowest width and restored within the frame, so
 * nothing is painted in between and no constant here can drift from the CSS.
 */
function floorsOf(cells: readonly Element[]): readonly number[] {
  return cells.map((cell) => {
    const styled = (cell as HTMLElement).style
    const restore = styled.width
    styled.width = 'min-content'
    const floor = cell.getBoundingClientRect().width
    styled.width = restore
    return floor
  })
}

/** The lane between two columns; the first one carries the row's gutter too. */
const lane = (index: number) => index === 0 ? 'var(--dsh-first-lane)' : 'var(--dsh-sash-lane)'

/**
 * Drive one boundary between two columns. The shares start from what the
 * columns currently measure, so taking hold of a boundary moves nothing until
 * the pointer does, whatever laid the columns out until then.
 */
function useColumnResize(): {
  widths: readonly number[] | undefined
  onResizeStart: (index: number) => (event: PointerEvent<HTMLElement>) => void
} {
  const [widths, setWidths] = useState<readonly number[] | undefined>(undefined)

  const onResizeStart = (index: number) => (event: PointerEvent<HTMLElement>) => {
    const handle = event.currentTarget
    const table = handle.parentElement
    /* v8 ignore next -- a sash renders as a lane of the table itself */
    if (table === null) return

    // The heading cells are the table's first children, one per column.
    const cells = [...table.children].slice(0, COLUMNS.length)
    const measured = cells.map(node => node.getBoundingClientRect().width)
    // An environment that lays nothing out offers no widths to move between.
    if (measured.every(width => width === 0)) return

    const floors = floorsOf(cells)

    const from = widths ?? measured
    const origin = event.clientX
    // A drag toward the inline end widens the leading column, which is the
    // other direction when the writing direction is.
    const towardEnd = getComputedStyle(table).direction === 'rtl' ? -1 : 1

    // A pointer that started on a sash is dragging it, not selecting the text
    // it crosses, and the cursor stays the drag's for as long as it lasts.
    event.preventDefault()
    const restore = { cursor: document.body.style.cursor, select: document.body.style.userSelect }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    // Capture keeps the drag with the handle once the pointer leaves it, and
    // the mark keeps the sash drawn while it is held rather than only hovered.
    handle.setPointerCapture(event.pointerId)
    handle.dataset['dragging'] = 'true'

    const onMove = (move: globalThis.PointerEvent) => {
      setWidths(resizeWidths(from, floors, index, (move.clientX - origin) * towardEnd))
    }
    const onEnd = () => {
      delete handle.dataset['dragging']
      document.body.style.cursor = restore.cursor
      document.body.style.userSelect = restore.select
      handle.removeEventListener('pointermove', onMove)
      handle.removeEventListener('pointerup', onEnd)
    }
    handle.addEventListener('pointermove', onMove)
    handle.addEventListener('pointerup', onEnd)
  }

  return { widths, onResizeStart }
}

/**
 * The mark a sorted column carries, and the room every column keeps for one.
 * The gap the heading holds clear of it is the mark's own leading padding, so
 * it is reserved along with the mark rather than beside it.
 */
function SortMark({ rank, direction }: { rank: number | undefined; direction: SortDirection }) {
  return (
    <span className={css.sortSlot}>
      <span className={classes(css.ghost, css.sortMark)}>
        {rank !== undefined && <span className={css.sortRank}>{rank}</span>}
        <SortArrow direction={direction} />
      </span>
    </span>
  )
}

/**
 * The widest mark any column can carry: the rank shown when the order consults
 * every column at once. Ranks are digits of a tabular figure, so which digit
 * this is does not matter — only how many.
 */
const WIDEST_RANK = COLUMNS.length

/** One column heading: a click sorts by it, a double click drops it from the order. */
function ColumnHeader(
  { column, line, sorts, onSorts, t }: {
    column: SortableColumn
    line: number
    sorts: readonly ColumnSort[]
    onSorts: (next: readonly ColumnSort[]) => void
    t: SectionT
  },
) {
  const at = sorts.findIndex(sort => sort.id === column.id)
  const sorted = sorts[at]
  const direction = sorted === undefined
    ? undefined
    : t(sorted.direction === 'asc' ? 'sort.ascending' : 'sort.descending')

  return (
    <div className={css.headerCell} style={{ gridColumn: line }}>
      <button
        type="button"
        className={css.header}
        aria-label={direction === undefined ? t(column.label) : `${t(column.label)}: ${direction}`}
        onClick={() => { onSorts(toggleSort(sorts, column)) }}
        onDoubleClick={() => { onSorts(dropSort(sorts, column.id)) }}
      >
        {/* A button is not a layout container: an engine may wrap its contents
            in an anonymous block, which would leave a grid declared on the
            button inert and its children flowing against each other. */}
        <FittedRun
          className={css.headerLayout}
          contentClassName={css.heading}
          reserve={<SortMark rank={WIDEST_RANK} direction="asc" />}
          occupant={sorted === undefined
            ? undefined
            : <SortMark rank={sorts.length > 1 ? at + 1 : undefined} direction={sorted.direction} />}
        >
          {t(column.label)}
        </FittedRun>
      </button>
    </div>
  )
}

/**
 * The Keybindings page: a borderless five-column table over the effective
 * bindings. One command's rows are adjacent and share a single label cell
 * spanning them, so the command reads once over the bindings it owns.
 */
export function KeybindingsSection(
  { useActions, useBindings, setBinding, removeBinding, t }: KeybindingsSectionProps,
) {
  const actions = useActions(value => value)
  const bindings = useBindings(value => value)
  const [sorts, setSorts] = useState<readonly ColumnSort[]>([])
  const { widths, onResizeStart } = useColumnResize()
  const runs = useMemo(
    () => commandRuns(sortRows(keybindingRows(actions, bindings), sorts)),
    [actions, bindings, sorts],
  )

  // The seat a binding was just added to, which is the one recorder that
  // starts armed: an added binding is inert until a gesture is recorded, and
  // asking for it is already the gesture that says one is coming.
  const [added, setAdded] = useState<string | undefined>(undefined)

  // A binding is added by taking a seat of its own: it forks the base of the
  // binding it was added beside and states a gesture nothing can match, so it
  // is the user's from the start and inert until they record one.
  const addBinding = (point: InsertPoint) => {
    setBinding(point.ref, point.base, { strokes: [] })
    setAdded(seatKey(point.ref))
  }
  // A sash spans the heading row and every binding under it.
  const rowCount = runs.reduce((total, run) => total + run.rows.length, 0)

  // One grid over every row, because the command cell spans the rows it owns;
  // a per-row element could not stretch across its siblings. Each control
  // names its own column and command, so the columns need no header semantics.
  return (
    <div
      className={css.table}
      style={widths === undefined ? undefined : { gridTemplateColumns: tracks(widths.map(width => `${width}px`)) }}
    >
      {COLUMNS.map((column, index) => (
        <ColumnHeader key={column.id} column={column} line={columnLine(index)} sorts={sorts} onSorts={setSorts} t={t} />
      ))}
      {COLUMNS.slice(0, -1).map((column, index) => (
        <span
          key={column.id}
          className={css.sash}
          role="separator"
          aria-orientation="vertical"
          aria-label={`${t(column.label)}: ${t('column.resize')}`}
          data-gutter={index === 0 || undefined}
          style={{ gridColumn: sashLine(index), gridRow: `${HEADING_LINE} / span ${1 + rowCount}` }}
          onPointerDown={onResizeStart(index)}
        />
      ))}
      {runs.map(run => (
        <Fragment key={run.id}>
          <div
            className={css.command}
            style={{ gridColumn: columnLine(0), gridRow: `${run.line} / span ${run.rows.length}` }}
          >
            <div>{run.label}</div>
            {run.description !== undefined && <div className={css.description}>{run.description}</div>}
          </div>
          {run.rows.map((row, index) => (
            <SubRow key={contributionKey(row)} line={run.line + index}>
              {row.superseded
                ? <ShippedCells row={row} t={t} />
                : (
                  <>
                    <BindingCells row={row} armed={added === seatKey(row)} setBinding={setBinding} t={t} />
                    {/* Only what the user holds is theirs to drop: a shipped
                        binding and a plugin's contribution are not. */}
                    {row.entry.source === 'user'
                      && <RemoveControl row={row} onRemove={removeBinding} t={t} />}
                  </>
                )}
              {index === run.rows.length - 1
                && <InsertControl point={run.addition} onAdd={addBinding} t={t} />}
            </SubRow>
          ))}
        </Fragment>
      ))}
    </div>
  )
}

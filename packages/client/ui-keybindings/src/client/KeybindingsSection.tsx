/** The Keybindings settings page: one table row per effective binding. */
import { Fragment, useMemo, useRef, useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import {
  dropSort, FittedRun, minContentWidth, runId, runsBy, ScrollingRun, sortRows, Table, TableGroup,
  TableGutter, TableSash, TableSeam, tableColumnLine, tableRunRows, toggleSort, useTableResize,
  type ColumnSort, type SortDirection, type TableColumnFloor, type TableColumnLayout, type TableRun,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import {
  type Keybinding, type KeybindingEdit, type KeybindingOverrideRef, type KeybindingSource,
  type KeyStroke, type SourcedOverride,
} from '../keybinding.ts'
import { parseWhenClause } from '../when-clause.ts'
import type { UiActionDefinition } from './action-registry.ts'
import { useDraft } from './draft.ts'
import { ControlRoom, KeybindingRecorder } from './KeybindingRecorder.tsx'
import {
  forkedKey, keybindingRows, type EffectiveRow, type KeybindingRow, type SupersededRow,
} from './rows.ts'
import { COLUMNS, type SortableColumn } from './sorting.ts'
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

/** The columns as the table lays them out, which is the ordering's own list. */
const LAYOUT: readonly TableColumnLayout[] = COLUMNS.map(
  column => ({ id: column.id, share: column.share }),
)

/** The grid row the headings occupy, above every binding. */
const HEADING_LINE = 1

/** The first grid row a binding stands on. */
const FIRST_ROW_LINE = HEADING_LINE + 1

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
 * What a binding added to a command would be: a fork of the last binding that
 * command owns, which is the one the place to add it hangs under.
 * @param run - the command's run of bindings.
 * @param rows - every row, since a forked key has to miss all of them.
 * @returns the seat the new binding would take.
 */
function additionOf(run: TableRun<KeybindingRow>, rows: readonly KeybindingRow[]): InsertPoint {
  const origin = run.rows[run.rows.length - 1] as KeybindingRow

  return {
    label: run.rows[0].label,
    ref: { action: origin.action, key: forkedKey(rows, origin) },
    base: origin.base,
  }
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

/** The control that adds a binding, drawn at the same weight as the others. */
function Plus() {
  return (
    <svg viewBox="0 0 12 12" width="12" height="12">
      <path d="M6 2.5v7M2.5 6h7" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  )
}

/**
 * The place a binding is dropped: the gutter the row begins at, which the lane
 * carries beyond the sash's grip so the two never share a pixel — a press
 * meant for a column boundary must not be able to land on the one control in
 * the table that destroys something.
 */
function RemoveControl(
  { row, onRemove, t }: { row: EffectiveRow; onRemove: (ref: KeybindingOverrideRef) => void; t: SectionT },
) {
  return (
    <TableGutter
      lane={0}
      className={css.remove}
      label={`${t('binding.remove')}: ${row.label}`}
      onPress={() => { onRemove({ action: row.action, key: row.key }) }}
    >
      <span className={css.removeRule} />
      <span className={classes(css.ghost, css.removeMark)}><Minus /></span>
      <span className={css.removeRule} />
    </TableGutter>
  )
}

/**
 * The place a binding is added: the seam under one command's last binding,
 * where the next command begins. The band is the control — pressing anywhere
 * along the line adds the binding, rather than only on the mark in the middle
 * of it — and the line follows the pointer across the band, so it reads as the
 * place the binding would land rather than as a fixture of the row.
 */
function InsertControl(
  { point, onAdd, t }: { point: InsertPoint; onAdd: (point: InsertPoint) => void; t: SectionT },
) {
  return (
    <TableSeam
      className={css.insert}
      label={`${t('binding.add')}: ${point.label}`}
      onPress={() => { onAdd(point) }}
    >
      <span className={css.insertRule} />
      <span className={classes(css.ghost, css.insertPlus)}><Plus /></span>
      <span className={css.insertRule} />
    </TableSeam>
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
 * The same column, addressed from inside a row's group of cells. A group takes
 * the table's tracks from the second column on, so its own lines start there.
 */
const cellLine = (index: number) => tableColumnLine(index - 1)

/**
 * What each column may not be dragged below: what its own heading measures,
 * which is the label plus the mark's reserved room. The rows have no say —
 * their fields clip and their gestures scroll, so letting a clause decide a
 * column's floor would hold that column open for content that has somewhere
 * else to go. This is the thrifty rule, stated because it is not the general
 * one: a table whose rows are the point wants them counted.
 */
const headingFloor: TableColumnFloor = ({ heading }) => minContentWidth([heading])

/**
 * The mark a sorted column carries, and the room every column keeps for one.
 * The gap the heading holds clear of it is the mark's own leading padding, so
 * it is reserved along with the mark rather than beside it.
 */
function SortMark({ rank, direction }: { rank: number | undefined; direction: SortDirection }) {
  return (
    <span className={css.sortSlot}>
      <span className={css.ghost}>
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

  return (
    <div
      className={css.headerCell}
      style={{ gridColumn: line }}
      data-table-column={column.id}
      data-table-heading=""
      // Which way this column orders is a state a column header publishes, not
      // a phrase folded into its name: a reader hears the label once and the
      // direction as the state it is, and hears it change when it changes.
      aria-sort={sorted === undefined ? 'none' : sorted.direction === 'asc' ? 'ascending' : 'descending'}
    >
      <button
        type="button"
        className={css.header}
        aria-label={t(column.label)}
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
  const grid = useRef<HTMLDivElement>(null)
  const resize = useTableResize({ grid, columns: LAYOUT, floorOf: headingFloor })
  const ordered = useMemo(
    () => sortRows(keybindingRows(actions, bindings), sorts, COLUMNS),
    [actions, bindings, sorts],
  )
  // Adjacent, not gathered: an order that separates a command's bindings
  // separates its runs, and the command then reads once over each of them.
  const runs = useMemo(() => runsBy(ordered, row => row.action), [ordered])

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
  const rows = HEADING_LINE + ordered.length

  // One grid over every row, because the command cell spans the rows it owns;
  // a per-row element could not stretch across its siblings. Each control
  // names its own column and command, so the columns need no header semantics.
  return (
    <Table
      ref={grid}
      className={css.table}
      columns={LAYOUT}
      {...(resize.widths === undefined ? {} : { widths: resize.widths })}
    >
      {COLUMNS.map((column, index) => (
        <ColumnHeader
          key={column.id}
          column={column}
          line={tableColumnLine(index)}
          sorts={sorts}
          onSorts={setSorts}
          t={t}
        />
      ))}
      {COLUMNS.slice(0, -1).map((column, index) => (
        <TableSash
          key={column.id}
          index={index}
          span={rows}
          className={css.sash}
          label={`${t(column.label)}: ${t('column.resize')}`}
          resize={resize}
        />
      ))}
      {runs.map(run => (
        <Fragment key={runId(run)}>
          <div
            className={css.command}
            style={{ gridColumn: tableColumnLine(0), gridRow: tableRunRows(FIRST_ROW_LINE, run) }}
          >
            <div>{run.rows[0].label}</div>
            {run.rows[0].description !== undefined && (
              <div className={css.description}>{run.rows[0].description}</div>
            )}
          </div>
          {run.rows.map((row, index) => (
            <TableGroup
              key={contributionKey(row)}
              line={FIRST_ROW_LINE + run.start + index}
              rows={1}
              from={1}
              className={css.subRow}
            >
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
              {/* One seam per command, not one per boundary: a band belonging
                  to whichever command the pointer was nearer reads as
                  belonging to neither, so the space where two meet is the
                  upper one's. The table cannot see runs, so this is ours. */}
              {index === run.rows.length - 1
                && <InsertControl point={additionOf(run, ordered)} onAdd={addBinding} t={t} />}
            </TableGroup>
          ))}
        </Fragment>
      ))}
    </Table>
  )
}

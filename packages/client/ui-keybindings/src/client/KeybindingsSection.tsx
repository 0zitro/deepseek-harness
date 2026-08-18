/** The Keybindings settings page: one table row per effective binding. */
import { Fragment, useMemo, useState, type PointerEvent } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import {
  type Keybinding, type KeybindingEdit, type KeybindingOverrideRef, type KeybindingSource,
  type KeyStroke, type SourcedOverride,
} from '../keybinding.ts'
import { parseWhenClause } from '../when-clause.ts'
import type { UiActionDefinition } from './action-registry.ts'
import { useDraft } from './draft.ts'
import { KeybindingRecorder } from './KeybindingRecorder.tsx'
import { resizeShares } from './resize.ts'
import { keybindingRows, type KeybindingRow } from './rows.ts'
import {
  COLUMNS, dropSort, sortRows, toggleSort,
  type ColumnSort, type SortableColumn, type SortDirection,
} from './sorting.ts'
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
}

/** Group the ordered rows into runs of one command. */
function commandRuns(rows: readonly KeybindingRow[]): readonly CommandRun[] {
  const runs: CommandRun[] = []

  for (const row of rows) {
    const open = runs[runs.length - 1]
    if (open !== undefined && open.rows[0]?.action === row.action) {
      runs[runs.length - 1] = { ...open, rows: [...open.rows, row] }
      continue
    }
    runs.push({ label: row.label, description: row.description, rows: [row] })
  }
  return runs
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
  { row, setBinding, t }: { row: KeybindingRow; setBinding: KeybindingsSectionInjected['setBinding']; t: SectionT },
) {
  const ref = { action: row.action, key: row.key } as const

  // Each control writes its own field only: a field the user did not touch
  // stays absent from the override and keeps following the default.
  const setStrokes = (strokes: KeyStroke[]) => { setBinding(ref, row.base, { strokes }) }

  return (
    <>
      <div className={classes(css.cell, fieldClass(row.overridden.strokes))} style={{ gridColumn: columnLine(1) }}>
        <KeybindingRecorder
          strokes={row.entry.strokes}
          onStrokesChange={setStrokes}
          label={row.label}
          doneLabel={t('recorder.done')}
        />
      </div>
      <div className={css.cell} style={{ gridColumn: columnLine(2) }}>
        <CellInput
          value={row.entry.when ?? ''}
          storable={storableClause}
          commit={(when) => { setBinding(ref, row.base, { when }) }}
          className={classes(css.clauseInput, fieldClass(row.overridden.when))}
          placeholder={t('when.placeholder')}
          aria-label={`${t('column.when')}: ${row.label}`}
        />
      </div>
      <div className={css.cell} style={{ gridColumn: columnLine(3) }}>
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
      <div className={classes(css.cell, css.source)} style={{ gridColumn: columnLine(4) }}>
        {sourceLabel(row.entry.source, t)}
      </div>
    </>
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

/** The grid's tracks for the given shares; a column still never goes under its content. */
function tracks(shares: readonly number[]): string {
  return shares
    .map(share => `minmax(min-content, ${share}fr)`)
    .join(' var(--dsh-sash-lane) ')
}

/**
 * Drive one boundary between two columns. The shares start from what the
 * columns currently measure, so taking hold of a boundary moves nothing until
 * the pointer does, whatever laid the columns out until then.
 */
function useColumnResize(): {
  shares: readonly number[] | undefined
  onResizeStart: (index: number) => (event: PointerEvent<HTMLElement>) => void
} {
  const [shares, setShares] = useState<readonly number[] | undefined>(undefined)

  const onResizeStart = (index: number) => (event: PointerEvent<HTMLElement>) => {
    const handle = event.currentTarget
    const table = handle.parentElement
    /* v8 ignore next -- a sash renders as a lane of the table itself */
    if (table === null) return

    // The heading cells are the table's first children, one per column.
    const widths = [...table.children].slice(0, COLUMNS.length).map(node => node.getBoundingClientRect().width)
    const pair = widths.slice(index, index + 2).reduce((total, width) => total + width, 0)
    // An environment that lays nothing out offers no width to take a fraction of.
    if (pair === 0) return

    const from = shares ?? widths
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
      setShares(resizeShares(from, index, ((move.clientX - origin) * towardEnd) / pair))
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

  return { shares, onResizeStart }
}

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
        <span className={css.headerLayout} data-sorted={sorted !== undefined || undefined}>
          <span className={css.heading}>{t(column.label)}</span>
          <span className={css.sortSlot} aria-hidden="true">
            {sorted !== undefined && (
              <span className={css.sortMark}>
                {sorts.length > 1 && <span className={css.sortRank}>{at + 1}</span>}
                <SortArrow direction={sorted.direction} />
              </span>
            )}
          </span>
        </span>
      </button>
    </div>
  )
}

/**
 * The Keybindings page: a borderless five-column table over the effective
 * bindings. One command's rows are adjacent and share a single label cell
 * spanning them, so the command reads once over the bindings it owns.
 */
export function KeybindingsSection({ useActions, useBindings, setBinding, t }: KeybindingsSectionProps) {
  const actions = useActions(value => value)
  const bindings = useBindings(value => value)
  const [sorts, setSorts] = useState<readonly ColumnSort[]>([])
  const { shares, onResizeStart } = useColumnResize()
  const runs = useMemo(
    () => commandRuns(sortRows(keybindingRows(actions, bindings), sorts)),
    [actions, bindings, sorts],
  )
  // A sash spans the heading row and every binding under it, so it needs the
  // count: `1 / -1` would stop at the last explicit row, of which there is one.
  const rowCount = runs.reduce((total, run) => total + run.rows.length, 0)

  // One grid over every row, because the command cell spans the rows it owns;
  // a per-row element could not stretch across its siblings. Each control
  // names its own column and command, so the columns need no header semantics.
  return (
    <div className={css.table} style={shares === undefined ? undefined : { gridTemplateColumns: tracks(shares) }}>
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
          style={{ gridColumn: sashLine(index), gridRow: `1 / span ${1 + rowCount}` }}
          onPointerDown={onResizeStart(index)}
        />
      ))}
      {runs.map(run => (
        <Fragment key={run.rows[0]?.action}>
          <div className={css.command} style={{ gridColumn: columnLine(0), gridRow: `span ${run.rows.length}` }}>
            <div>{run.label}</div>
            {run.description !== undefined && <div className={css.description}>{run.description}</div>}
          </div>
          {run.rows.map(row => (
            <BindingCells key={`${row.action}:${row.key}`} row={row} setBinding={setBinding} t={t} />
          ))}
        </Fragment>
      ))}
    </div>
  )
}

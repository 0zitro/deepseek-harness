/** The Keybindings settings page: one table row per effective binding. */
import { Fragment, useMemo, useState } from 'react'
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
import { keybindingRows, type KeybindingRow } from './rows.ts'
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
    inputMode?: 'numeric'
    'aria-label': string
  },
) {
  const [invalid, setInvalid] = useState(false)
  const [draft, setDraft] = useDraft(value)

  const onBlur = () => {
    const fit = storable(draft)
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
      <div className={classes(css.cell, fieldClass(row.overridden.strokes))}>
        <KeybindingRecorder
          strokes={row.entry.strokes}
          onStrokesChange={setStrokes}
          label={row.label}
          doneLabel={t('recorder.done')}
        />
      </div>
      <div className={css.cell}>
        <CellInput
          value={row.entry.when ?? ''}
          storable={storableClause}
          commit={(when) => { setBinding(ref, row.base, { when }) }}
          className={fieldClass(row.overridden.when)}
          placeholder={t('when.placeholder')}
          aria-label={`${t('column.when')}: ${row.label}`}
        />
      </div>
      <div className={css.cell}>
        <CellInput
          value={String(row.prio)}
          storable={storablePrio}
          commit={(prio) => { setBinding(ref, row.base, { prio: Number(prio) }) }}
          className={classes(css.prioInput, fieldClass(row.overridden.prio))}
          inputMode="numeric"
          aria-label={`${t('column.prio')}: ${row.label}`}
        />
      </div>
      <div className={classes(css.cell, css.source)}>{sourceLabel(row.entry.source, t)}</div>
    </>
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
  const runs = useMemo(() => commandRuns(keybindingRows(actions, bindings)), [actions, bindings])

  // One grid over every row, because the command cell spans the rows it owns;
  // a per-row element could not stretch across its siblings. Each control
  // names its own column and command, so the columns need no header semantics.
  return (
    <div className={css.table}>
      <div className={css.header}>{t('column.command')}</div>
      <div className={css.header}>{t('column.stroke')}</div>
      <div className={css.header}>{t('column.when')}</div>
      <div className={css.header}>{t('column.prio')}</div>
      <div className={css.header}>{t('column.source')}</div>
      {runs.map(run => (
        <Fragment key={run.rows[0]?.action}>
          <div className={css.command} style={{ gridRow: `span ${run.rows.length}` }}>
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

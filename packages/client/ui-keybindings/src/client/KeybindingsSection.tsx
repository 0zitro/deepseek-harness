/** The Keybindings settings page: one recorder row plus its when clause per registered action. */
import { useMemo, useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { keybindingOfEntry, type Keybinding, type KeybindingEntry, type KeyStroke } from '../keybinding.ts'
import type { UiActionId } from '../ui-action.ts'
import { parseWhenClause } from '../when-clause.ts'
import type { UiActionDefinition } from './action-registry.ts'
import { KeybindingRecorder } from './KeybindingRecorder.tsx'
import css from './keybindings.module.css'

/** Registration-side preference face. */
export interface KeybindingsSectionInjected {
  hooks: {
    /** Registered actions bound as useActions. */
    actions: SnapshotStore<readonly UiActionDefinition[]>
    /** Persisted entries bound as useBindings. */
    bindings: SnapshotStore<readonly KeybindingEntry[]>
  }
  /** Persist one action's binding. */
  setBinding: (action: UiActionId, next: Keybinding) => void
}

/** Full Settings-page props. */
export type KeybindingsSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'keybindings'>
  & InjectFace<KeybindingsSectionInjected>

/** The section's localized translate face. */
type SectionT = PropsLocale<'keybindings'>['t']

/** One action resolved to its current gesture. */
interface ResolvedAction {
  definition: UiActionDefinition
  binding: Keybinding
}

/** Resolve each action's current gesture, falling back to its default or an empty chord. */
function resolveActions(
  actions: readonly UiActionDefinition[],
  bindings: readonly KeybindingEntry[],
): readonly ResolvedAction[] {
  return actions.map((definition) => {
    const entry = bindings.find(existing => existing.action === definition.id)
    return {
      definition,
      binding: entry === undefined
        ? definition.defaultKeybindings?.[0] ?? { strokes: [] }
        : keybindingOfEntry(entry),
    }
  })
}

/** The when-clause text input, validating the expression on blur. */
function WhenInput({ value, onChange, t }: { value: string; onChange: (when: string) => void; t: SectionT }) {
  const [invalid, setInvalid] = useState(false)

  const onBlur = () => {
    if (value === '') {
      setInvalid(false)
      return
    }
    try {
      parseWhenClause(value)
      setInvalid(false)
    } catch {
      setInvalid(true)
    }
  }

  return (
    <div className={css.whenRow}>
      <div className={css.rowText}>
        <div className={css.title}>{t('when.label')}</div>
        <div className={css.desc}>{t('when.description')}</div>
      </div>
      <input
        className={`${css.whenInput}${invalid ? ` ${css.whenInvalid}` : ''}`}
        value={value}
        placeholder={t('when.placeholder')}
        onChange={(event) => { onChange(event.target.value) }}
        onBlur={onBlur}
        aria-invalid={invalid || undefined}
        spellCheck={false}
      />
    </div>
  )
}

/** One action's recorder and when clause, persisting through the injected setter. */
function ActionRow(
  { action, setBinding, t }: { action: ResolvedAction; setBinding: (action: UiActionId, next: Keybinding) => void; t: SectionT },
) {
  const { definition, binding } = action

  const setStrokes = (strokes: KeyStroke[]) => {
    setBinding(definition.id, { strokes, ...(binding.when === undefined ? {} : { when: binding.when }) })
  }
  const setWhen = (when: string) => {
    setBinding(definition.id, { strokes: binding.strokes, ...(when === '' ? {} : { when }) })
  }

  return (
    <>
      <div className={css.row}>
        <div className={css.rowText}>
          <div className={css.title}>{definition.label}</div>
          {definition.description !== undefined && <div className={css.desc}>{definition.description}</div>}
        </div>
        <KeybindingRecorder strokes={binding.strokes} onStrokesChange={setStrokes} label={definition.label} doneLabel={t('recorder.done')} />
      </div>
      <WhenInput value={binding.when ?? ''} onChange={setWhen} t={t} />
    </>
  )
}

/**
 * The Keybindings page. One row per registered action; the recorder owns the
 * strokes and the input owns the when clause, both persisting through the
 * injected setter.
 */
export function KeybindingsSection({ useActions, useBindings, setBinding, t }: KeybindingsSectionProps) {
  const actions = useActions(value => value)
  const bindings = useBindings(value => value)
  const rows = useMemo(() => resolveActions(actions, bindings), [actions, bindings])

  return (
    <div className={css.section}>
      {rows.map(action => <ActionRow key={action.definition.id} action={action} setBinding={setBinding} t={t} />)}
    </div>
  )
}

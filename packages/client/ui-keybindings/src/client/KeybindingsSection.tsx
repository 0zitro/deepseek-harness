/** The Keybindings settings page: one recorder row plus its when clause per effective binding. */
import { useMemo, useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import {
  keybindingKey, keybindingOfEntry,
  type Keybinding, type KeybindingEdit, type KeybindingKey, type KeybindingOverride,
  type KeybindingOverrideRef, type KeyStroke,
} from '../keybinding.ts'
import { parseWhenClause } from '../when-clause.ts'
import type { UiActionDefinition } from './action-registry.ts'
import { defaultEntry, mergeOverride, topOverride } from './dispatch.ts'
import { KeybindingRecorder } from './KeybindingRecorder.tsx'
import css from './keybindings.module.css'

/** Registration-side preference face. */
export interface KeybindingsSectionInjected {
  hooks: {
    /** Registered actions bound as useActions. */
    actions: SnapshotStore<readonly UiActionDefinition[]>
    /** Persisted partial overrides bound as useBindings. */
    bindings: SnapshotStore<readonly KeybindingOverride[]>
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

/** One effective binding resolved to its merged gesture and the default it merges into. */
interface ResolvedAction {
  definition: UiActionDefinition
  key: KeybindingKey
  base: Keybinding
  binding: Keybinding
}

/** Resolve each default merged with its top override, keyed for the setter. */
function resolveActions(
  actions: readonly UiActionDefinition[],
  overrides: readonly KeybindingOverride[],
): readonly ResolvedAction[] {
  const result: ResolvedAction[] = []
  for (const definition of actions) {
    const defaults = definition.defaultKeybindings ?? []
    if (defaults.length === 0) {
      // An unbound action still gets a row so the user can record a binding.
      result.push({ definition, key: keybindingKey(definition.id), base: { strokes: [] }, binding: { strokes: [] } })
      continue
    }
    for (const def of defaults) {
      const override = topOverride(overrides, definition.id, def.key)
      const entry = override === undefined ? defaultEntry(def, definition.id) : mergeOverride(def, definition.id, override)
      result.push({
        definition,
        key: def.key,
        base: { strokes: def.strokes, ...(def.when === undefined ? {} : { when: def.when }) },
        binding: keybindingOfEntry(entry),
      })
    }
  }
  return result
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

/** One effective binding's recorder and when clause, persisting through the injected setter. */
function ActionRow(
  { action, setBinding, t }: { action: ResolvedAction; setBinding: KeybindingsSectionInjected['setBinding']; t: SectionT },
) {
  const { definition, key, base, binding } = action
  const ref = { action: definition.id, source: 'user', key } as const

  // Each control writes its own field only: a field the user did not touch
  // stays absent from the override and keeps following the default.
  const setStrokes = (strokes: KeyStroke[]) => { setBinding(ref, base, { strokes }) }
  const setWhen = (when: string) => { setBinding(ref, base, { when }) }

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
 * The Keybindings page. One row per effective binding; the recorder owns the
 * strokes and the input owns the when clause, both persisting through the
 * injected setter.
 */
export function KeybindingsSection({ useActions, useBindings, setBinding, t }: KeybindingsSectionProps) {
  const actions = useActions(value => value)
  const bindings = useBindings(value => value)
  const rows = useMemo(() => resolveActions(actions, bindings), [actions, bindings])

  return (
    <div className={css.section}>
      {rows.map(action => <ActionRow key={`${action.definition.id}:${action.key}`} action={action} setBinding={setBinding} t={t} />)}
    </div>
  )
}

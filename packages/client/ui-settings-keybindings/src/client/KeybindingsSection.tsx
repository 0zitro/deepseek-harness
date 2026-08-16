/** The Keybindings settings page: one recorder row plus its when clause per configured action. */
import { useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { parseWhenClause } from '../when-clause.ts'
import type { Keybinding, KeyStroke } from '../keybinding.ts'
import { KeybindingRecorder } from './KeybindingRecorder.tsx'
import css from './keybindings.module.css'

/** Registration-side preference face. */
export interface KeybindingsSectionInjected {
  hooks: {
    /** Persisted send-message binding bound as useSendMessage. */
    sendMessage: SnapshotStore<Keybinding>
  }
  /** Persist a newly recorded send-message binding. */
  setSendMessage: (next: Keybinding) => void
}

/** Full Settings-page props. */
export type KeybindingsSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'keybindings'>
  & InjectFace<KeybindingsSectionInjected>

/** The section's localized translate face. */
type SectionT = PropsLocale<'keybindings'>['t']

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

/**
 * The Keybindings page. A new action adds a hook, a setter, and one row here;
 * the recorder owns the strokes and the input owns the when clause, both
 * persisting through the injected setter.
 */
export function KeybindingsSection({ useSendMessage, setSendMessage, t }: KeybindingsSectionProps) {
  const binding = useSendMessage(value => value)

  const setStrokes = (strokes: KeyStroke[]) => {
    setSendMessage({ strokes, ...(binding.when === undefined ? {} : { when: binding.when }) })
  }
  const setWhen = (when: string) => {
    setSendMessage({ strokes: binding.strokes, ...(when === '' ? {} : { when }) })
  }

  return (
    <div className={css.section}>
      <div className={css.row}>
        <div className={css.rowText}>
          <div className={css.title}>{t('sendMessage.label')}</div>
          <div className={css.desc}>{t('sendMessage.description')}</div>
        </div>
        <KeybindingRecorder strokes={binding.strokes} onStrokesChange={setStrokes} label={t('sendMessage.label')} doneLabel={t('recorder.done')} />
      </div>
      <WhenInput value={binding.when ?? ''} onChange={setWhen} t={t} />
    </div>
  )
}

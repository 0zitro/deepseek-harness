/** The Keybindings settings page: one recorder row per configured action binding. */
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { Keybinding } from '../keybinding.ts'
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

/**
 * The Keybindings page. A new action adds a hook, a setter, and one row here;
 * the recorder is fed the bound value and persists through the injected setter.
 */
export function KeybindingsSection({ useSendMessage, setSendMessage, t }: KeybindingsSectionProps) {
  const binding = useSendMessage(value => value)
  return (
    <div className={css.section}>
      <div className={css.row}>
        <div className={css.rowText}>
          <div className={css.title}>{t('sendMessage.label')}</div>
          <div className={css.desc}>{t('sendMessage.description')}</div>
        </div>
        <KeybindingRecorder binding={binding} onChange={setSendMessage} label={t('sendMessage.label')} />
      </div>
    </div>
  )
}

/**
 * The rich composer surface: one plaintext editable whose text is the full
 * markdown source, decorated live (emphasis, code, links, math) by the ported
 * reference machinery, driving the session shell as its session plane.
 *
 * A chain entry owns its whole chrome — the slot system authorizes child
 * rendering per declaring entry, so the stock bar's chrome slots cannot be
 * re-rendered from here (the same terms every composer takeover in the tree
 * renders under). The chrome this renders is its own: the editable, a trigger
 * menu fed by the input-trigger controller's stores, notices, image intake
 * through the shell, and send/stop.
 */
import { memo, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import type {
  InjectFace, PropsLocale, PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import type {
  ComposerAttachment, InputState, SessionInput,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { InputTriggerController } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import { useStoreOf } from './useStore.ts'
import type { InputSubmitMode, SubmitGesture } from './policy.ts'
import { attach, type ComposerControl } from './editor/attach.ts'
import { TriggerMenu } from './TriggerMenu.tsx'
import type { RichComposerRegistry } from './service.ts'
import { FocusScope } from '@zitro/dsh-oot-ui-actions/client'
import css from './rich-composer.module.css'

/** One surfaced notice, mirroring the shell's notice shape. */
export interface RichNotice {
  readonly level: 'info' | 'error'
  readonly text: string
  readonly seq: number
}

/** A notice store the renderer binds into the `useNotices` selector hook. */
export interface RichNoticeSource {
  subscribe(run: () => void): () => void
  getSnapshot(): RichNotice | null
}

/** The faces this chrome consumes, resolved per session by the entry's inject. */
export interface RichComposerInjected {
  /** Notice store bound into the `useNotices` selector hook by the renderer. */
  hooks: { notices: RichNoticeSource }
  rich: {
    shell: SessionInput
    conversation: {
      createDraftImages(files: readonly File[]): readonly ComposerAttachment[]
      draftImages(ids: InputState['imageIds']): readonly ComposerAttachment[]
      releaseDraftImage(id: InputState['imageIds'][number]): void
    }
    triggers: InputTriggerController | undefined
    /** Publishes the menu-open context key (a when-context contribution). */
    publishMenuOpen: (open: boolean) => void
    /** The action face registry this surface registers its verbs into. */
    service: RichComposerRegistry
    stop: () => void
    resolveMode(running: boolean, gesture: SubmitGesture, steeringAvailable: boolean): InputSubmitMode
  }
}

/** The chain slot props this chrome consumes: the standard kit plus its inject face. */
export type RichComposerProps =
  PropsRuntime<'conversation.composer'>
  & InjectFace<RichComposerInjected>
  & PropsLocale<'rich-composer'>

export const RichComposer = memo(function RichComposer({
  sessionId, session, useInput, useProjection, useNotices,
  rich, t,
}: RichComposerProps) {
  const { shell, conversation, triggers, stop, resolveMode, publishMenuOpen, service } = rich
  const input = useInput(state => state)
  const imageLimits = useProjection('imageLimits')

  const editableRef = useRef<HTMLDivElement | null>(null)
  const controlRef = useRef<ComposerControl | null>(null)
  const [empty, setEmpty] = useState(true)
  // The text this surface last pushed into the shell; adoption ignores echoes.
  const pushed = useRef<string | null>(null)

  const machineBusy = input.phase === 'adjudicating' || input.phase === 'submitting'
  const running = session?.running ?? false
  const attachments = conversation.draftImages(input.imageIds)
  const canSteer = !machineBusy && empty && running && (session?.subagent ?? null) === null
    && input.queue.some(row => row.placement === 'queued')

  // The busy guard the tracking pass reads, kept in a ref so the attach
  // effect below does not re-arm per render.
  const machineBusyRef = useRef(machineBusy)
  machineBusyRef.current = machineBusy

  // Drive the editor: one attach per editable, torn down on unmount. Every
  // edit is pushed into the shell (single writer), and the real caret feeds
  // the trigger pipeline after the shell's own end-of-text tracking ran.
  useEffect(() => {
    const el = editableRef.current
    if (el === null) return
    const control = attach(window, {
      el,
      onEdit: (text) => {
        pushed.current = text
        setEmpty(text === '')
        // false: this surface owns the visible caret; the shell's editor is
        // mounted-hidden behind the chain overlay, and selecting into it
        // would steal focus on every keystroke.
        shell.setDraft(text, false)
      },
      afterDecorate: (text, caret) => {
        if (triggers === undefined) return
        const rev = shell.state.getSnapshot().draftRev
        triggers.track(text, caret ?? text.length, guardOf(machineBusyRef.current), rev)
      },
    })
    controlRef.current = control
    return () => {
      control.dispose()
      controlRef.current = null
    }
  }, [shell, triggers])

  // Unlock (mount / session switch / busy settling) returns focus to the
  // editable — the stock bar's contract, kept: typing continues without a
  // click after a send completes or a session changes.
  useEffect(() => {
    if (machineBusy) return
    editableRef.current?.focus({ preventScroll: true })
  }, [sessionId, machineBusy])

  // Adopt shell-side draft changes this surface did not make: a persisted
  // seed, a pick insert, a send-clear. Replacing the buffer wholesale is the
  // adoption path; the caret lands at the end.
  useEffect(() => {
    if (input.draft === pushed.current) return
    pushed.current = input.draft
    setEmpty(input.draft === '')
    controlRef.current?.adopt(input.draft, false)
  }, [input])

  /** Submit from a keyboard or button gesture, with the delivery mode resolved. */
  const submitWith = (gesture: SubmitGesture): void => {
    if (machineBusy) return
    const steeringAvailable = (session?.subagent ?? null) === null
    if (gesture === 'accelerated' && canSteer) {
      shell.steerQueue()
      return
    }
    if (empty) return
    shell.submit(resolveMode(running, gesture, steeringAvailable))
  }

  const intakeImages = (files: readonly File[]): void => {
    if (files.length === 0 || machineBusy) return
    if (imageLimits !== undefined
      && files.every(file => (imageLimits.mediaTypes as readonly string[]).includes(file.type))) {
      // Format precedes limits: a batch holding a non-image announces the
      // format problem, not a count or size it could never pass anyway.
      if (attachments.length + files.length > imageLimits.maxImagesPerMessage) {
        shell.notify('error', t('imageTooMany', { count: imageLimits.maxImagesPerMessage }))
        return
      }
      if (files.some(file => file.size > imageLimits.maxImageBytes)) {
        shell.notify('error', t('imageTooLarge', { size: bytesText(imageLimits.maxImageBytes) }))
        return
      }
    }
    try {
      const images = conversation.createDraftImages(files)
      if (!shell.addImages(images.map(image => image.id))) {
        for (const image of images) conversation.releaseDraftImage(image.id)
      }
    } catch {
      shell.notify('error', t('imageUnsupported'))
    }
  }

  // The surface's verbs, registered into the service stock keybindings reach.
  // The faces close over live refs, so one registration lasts the mount.
  const facesRef = useRef({ submitWith, machineBusy })
  facesRef.current = { submitWith, machineBusy }
  useEffect(() => {
    if (sessionId === undefined) return
    return service.register(sessionId, {
      send: () => { facesRef.current.submitWith('enter') },
      queue: () => { if (!facesRef.current.machineBusy) shell.submit('queue') },
      steer: () => {
        if (!facesRef.current.machineBusy) shell.submit('steer')
      },
      undo: () => { controlRef.current?.undo() },
      redo: () => { controlRef.current?.redo() },
      dismissPopup: () => { shell.dismissPopup() },
      arbitrate: (key) => { shell.arbitrate(key, false) },
    })
  }, [sessionId, service, shell])

  // The menu-open context key: gated when-clauses read it, this publishes it.
  // The hook is called unconditionally (a closed store where no controller
  // is installed) so the hook order never shifts.
  const menuOpen = useMenuOpen(triggers)
  useEffect(() => { publishMenuOpen(menuOpen) }, [menuOpen, publishMenuOpen])

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const e = event.nativeEvent
    if (e.isComposing || e.defaultPrevented) return
    // The trigger menu owns its keys while it is open; the shell's arbitration
    // delegates to the pipeline and answers 'pass' when none is live.
    const arbitrateKey = e.key === 'ArrowUp' ? 'up'
      : e.key === 'ArrowDown' ? 'down'
        : e.key === 'Enter' ? 'enter'
          : e.key === 'Escape' ? 'escape'
            : e.key === 'Tab' ? 'tab'
              : null
    if (arbitrateKey !== null && shell.arbitrate(arbitrateKey, e.isComposing) !== 'pass') {
      event.preventDefault()
      return
    }
    if (e.key === ' ' && !machineBusy && shell.space()) {
      event.preventDefault()
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      // Shift+Enter is the browser's own line break; the composer draws the line.
      event.preventDefault()
      submitWith(e.ctrlKey || e.metaKey ? 'accelerated' : 'enter')
    }
  }

  const notice = useNotices(value => value)

  return (
    <div className={css.root}>
      {notice !== null && notice.level === 'error' ? (
        <div className={css.notice} role="alert">{notice.text}</div>
      ) : null}
      <div
        className={css.card}
        onDragOver={event => { if (imageLimits !== undefined) event.preventDefault() }}
        onDrop={event => {
          if (imageLimits === undefined) return
          event.preventDefault()
          intakeImages([...event.dataTransfer.files])
        }}
      >
      <FocusScope name="composer">
      <div className={css.editableWrap}>
        <div
          ref={editableRef}
          className={css.editable}
          contentEditable="plaintext-only"
          aria-multiline="true"
          role="textbox"
          aria-label={t('placeholder')}
          spellCheck={false}
          onKeyDown={onKeyDown}
        />
        {empty ? <div className={css.placeholder} aria-hidden="true">{t('placeholder')}</div> : null}
      </div>
      {triggers !== undefined ? <TriggerMenu controller={triggers} /> : null}
      </FocusScope>
      {attachments.length > 0 ? (
        <div className={css.attachments}>
          {attachments.map(attachment => (
            <button
              key={attachment.id}
              type="button"
              className={css.attachment}
              title={attachment.file.name}
              onClick={() => {
                conversation.releaseDraftImage(attachment.id)
                shell.removeImage(attachment.id)
              }}
            >
              <img src={attachment.previewUrl} alt={attachment.file.name} className={css.attachmentThumb} />
            </button>
          ))}
        </div>
      ) : null}
      <div className={css.controls}>
        <div className={css.spring} />
        {running ? (
          <button
            type="button"
            className={css.stop}
            onMouseDown={(event) => { event.preventDefault() }}
            onClick={() => { stop() }}
            aria-label={t('stop')}
          >
            <StopGlyph />
          </button>
        ) : (
          <button
            type="button"
            className={css.send}
            onMouseDown={(event) => { event.preventDefault() }}
            onClick={() => { submitWith('enter') }}
            disabled={machineBusy || empty}
            aria-label={t('send')}
          >
            <SendGlyph />
          </button>
        )}
      </div>
      </div>
    </div>
  )
})

/** A permanently-closed menu, for compositions without a trigger provider. */
const MENU_CLOSED = { open: false, hit: null, generation: 0, groups: [], highlight: null } as const
const closedMenuStore = { subscribe: (): (() => void) => () => {}, getSnapshot: () => MENU_CLOSED }

/**
 * The menu-open state of one session's trigger controller, or of the closed
 * stand-in where none is installed.
 * @param controller - the session's trigger controller, or undefined.
 */
function useMenuOpen(controller: InputTriggerController | undefined): boolean {
  const useMenu = useStoreOf(controller === undefined ? closedMenuStore : controller.menu)
  return useMenu(menu => menu.open)
}

/** The availability tier the trigger pipeline tracks the draft under. */
function guardOf(machineBusy: boolean): { readonly tier: 'plain' | 'claimed' | 'frozen' } {
  return { tier: machineBusy ? 'claimed' : 'plain' }
}

/** One limit in display form, matching the stock bar's byte rounding. */
function bytesText(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

function SendGlyph(): ReactNode {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 13V3M8 3L3.5 7.5M8 3L12.5 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function StopGlyph(): ReactNode {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <rect x="3" y="3" width="10" height="10" rx="1.5" />
    </svg>
  )
}

/**
 * The rich editing surface: the `conversation.composer.editor` seat entry.
 *
 * The stock bar keeps every chrome piece — toolbar, seats, accessory, its own
 * trigger menu — and renders this component where its Lexical editor used to
 * bind. Two modes:
 *
 * - **Enabled** (the takeover): one plaintext editable whose text is the full
 *   markdown source, decorated live by the ported reference machinery. The
 *   surface is the single writer — every edit pushes into the session shell
 *   via `setDraft(text, false)` — and the shell's Lexical editor runs
 *   headless, so its keymap is dormant and nothing steals the caret.
 * - **Disabled** (the settings toggle off): a plain div bound to the shell
 *   editor as its Lexical root — the stock editing behavior, stock keymap
 *   included — with none of the decoration.
 *
 * The `composer.*` actions this plugin registers are responsive here: the
 * keybinding dispatcher claims bound gestures (window capture) before the
 * element handlers run, and the handlers yield on `defaultPrevented`.
 */
import { memo, useEffect, useRef, useLayoutEffect, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import type {
  InjectFace, PropsLocale, PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import type { InputTriggerController } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import { FocusScope } from '@zitro/dsh-oot-ui-actions/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ComposerAttachment, InputState } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { attach, type ComposerControl } from './editor/attach.ts'
import { heldText } from './editor/text.ts'
import type { RichComposerRegistry, SendGesture } from './service.ts'
import { useStoreOf } from './useStore.ts'
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

/** The faces this surface consumes, resolved per session by the entry's inject. */
export interface RichEditorInjected {
  rich: {
    shell: import('@deepseek-ai/dsh-client-ui-conversation/client').SessionInput
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
    /** The live takeover toggle (adopted from the rich-composer settings). */
    enabled: SnapshotStore<boolean>
    /** The busy-Enter delivery rule (the accelerated-chord submit). */
    resolveMode(running: boolean, gesture: 'enter' | 'accelerated', steeringAvailable: boolean): 'queue' | 'steer'
  }
}

/** The editor seat's props: owner share + injected face + the locale seat. */
export type RichEditorProps =
  PropsRuntime<'conversation.composer.editor'>
  & InjectFace<RichEditorInjected>
  & PropsLocale<'rich-composer'>

export const RichEditorSurface = memo(function RichEditorSurface({
  sessionId, editor, editable, editorDisabled, phase, placeholderText,
  workspaceTrigger, workspacePickerOpen, onWorkspaceKeyDown,
  rich, t,
}: RichEditorProps) {
  const { shell, conversation, triggers, resolveMode, publishMenuOpen, service, enabled: enabledStore } = rich
  const enabled = useStoreOf(enabledStore)(value => value)
  const machineBusy = phase === 'adjudicating' || phase === 'submitting'
  // Subscribed shell state: emptiness (placeholder) and the adoption pass.
  const shellState = useStoreOf(shell.state)(value => value)

  const editableRef = useRef<HTMLDivElement | null>(null)
  const controlRef = useRef<ComposerControl | null>(null)
  const machineBusyRef = useRef(machineBusy)
  machineBusyRef.current = machineBusy

  // Drive the editor (enabled mode): one attach per editable. Every edit is
  // pushed into the shell (single writer, caret untouched), and the real
  // caret feeds the trigger pipeline after the shell's own tracking ran.
  useEffect(() => {
    if (!enabled) return
    const el = editableRef.current
    if (el === null) return
    const control = attach(window, {
      el,
      onEdit: (text) => {
        // false: this surface owns the visible caret; the shell's editor is
        // headless here, and any selection it took would land nowhere.
        shell.setDraft(text, false)
      },
      afterDecorate: (text, caret) => {
        if (triggers === undefined) return
        const rev = shell.state.getSnapshot().draftRev
        triggers.track(text, caret ?? text.length, { tier: machineBusyRef.current ? 'claimed' : 'plain' }, rev)
      },
    })
    controlRef.current = control
    return () => {
      control.dispose()
      controlRef.current = null
    }
  }, [enabled, shell, triggers])

  // Adopt shell-side draft changes this surface did not make: a persisted
  // seed, a pick insert, a send-clear. Every own push also bumps the rev, so
  // the rev alone cannot tell echo from external change — the buffer text
  // does: when the surface's held text already says the same thing, the
  // rev bump was the push itself and adopting would slam the caret to the
  // end of a buffer the writer is mid-way through.
  const lastRev = useRef(-1)
  useEffect(() => {
    if (!enabled) return
    if (shellState.draftRev === lastRev.current) return
    lastRev.current = shellState.draftRev
    const el = editableRef.current
    if (el !== null && heldText(el) === shellState.draft) return
    controlRef.current?.adopt(shellState.draft, false)
  }, [shellState, enabled])

  // Disabled mode: bind the shell editor's root to this div — the stock
  // editing surface, stock keymap included.
  useLayoutEffect(() => {
    if (enabled) return
    const el = editableRef.current
    if (el === null || editor === null) return
    editor.setRootElement(el)
    editor.setEditable(editable)
    return () => { editor.setRootElement(null) }
  }, [enabled, editor, editable])

  /** Submit from the accelerated chord (plain Enter is the send action's). */
  const submitWith = (gesture: SendGesture): void => {
    if (machineBusy) return
    const state = shell.state.getSnapshot()
    const empty = state.draft === ''
    if (gesture === 'accelerated' && empty) {
      shell.steerQueue()
      return
    }
    if (empty) return
    shell.submit(resolveMode(false, gesture, true))
  }

  const intakeImages = (files: readonly File[]): void => {
    if (files.length === 0 || machineBusy) return
    try {
      const images = conversation.createDraftImages(files)
      if (!shell.addImages(images.map(image => image.id))) {
        for (const image of images) conversation.releaseDraftImage(image.id)
      }
    } catch {
      shell.notify('error', t('imageUnsupported'))
    }
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const e = event.nativeEvent
    if (e.isComposing || e.defaultPrevented) return
    if (!enabled) return // disabled mode: the stock keymap owns everything
    // The trigger menu's keys are claimed by the palette actions (window
    // capture) while it is open; the arbitration here is the standalone
    // fallback for compositions without the action dispatcher.
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
    if (e.key === 'Enter' && !e.shiftKey && (e.ctrlKey || e.metaKey)) {
      // The accelerated chord is a composer-native gesture: empty draft steers
      // the queue; otherwise submit with the opposite delivery preference.
      // Plain Enter belongs to the `composer.send` binding — unbound, it
      // falls to the browser and breaks the line.
      event.preventDefault()
      submitWith('accelerated')
    }
  }

  // The surface's verbs, registered into the service stock keybindings reach.
  const facesRef = useRef({ submitWith, machineBusy })
  facesRef.current = { submitWith, machineBusy }
  useEffect(() => {
    if (sessionId === undefined) return
    return service.register(sessionId, {
      send: (gesture) => { facesRef.current.submitWith(gesture) },
      queue: () => { if (!facesRef.current.machineBusy) shell.submit('queue') },
      steer: () => {
        if (!facesRef.current.machineBusy) shell.submit('steer')
      },
      undo: () => { controlRef.current?.undo() },
      redo: () => { controlRef.current?.redo() },
      dismissPopup: () => {
        triggers?.dismiss()
        shell.dismissPopup()
      },
      arbitrate: (key) => { shell.arbitrate(key, false) },
    })
  }, [sessionId, service, shell, triggers])

  // The menu-open context key: gated when-clauses read it, this publishes it.
  const menuOpen = triggers !== undefined ? useMenuOpen(triggers) : useMenuOpen(undefined)
  useEffect(() => { publishMenuOpen(menuOpen) }, [menuOpen, publishMenuOpen])

  if (workspaceTrigger) {
    // No-session picker state: the surface IS the workspace trigger (stock
    // semantics, stock styling via the bar's input classes are carried by
    // the class the owner passes through `placeholderText`'s element).
    return (
      <div
        ref={editableRef}
        contentEditable="plaintext-only"
        aria-label={placeholderText}
        aria-haspopup="menu"
        aria-expanded={workspacePickerOpen}
        tabIndex={0}
        className={css.editable}
        onKeyDown={onWorkspaceKeyDown}
      >
        {placeholderText}
      </div>
    )
  }

  const empty = shellState.draft === ''
  return (
    <FocusScope name="composer">
      <div className={css.grow}>
      {empty && (
        <div aria-hidden className={css.placeholder} data-composer-placeholder>
          {placeholderText}
        </div>
      )}
      <div
        ref={editableRef}
        className={css.editable}
        contentEditable="plaintext-only"
        aria-multiline="true"
        role="textbox"
        aria-label={placeholderText}
        aria-disabled={editorDisabled || undefined}
        data-phase={phase}
        data-placeholder={placeholderText}
        spellCheck={false}
        onKeyDown={onKeyDown}
        onPaste={(event) => {
          const files = [...event.nativeEvent.clipboardData?.files ?? []]
          if (files.length > 0) {
            event.preventDefault()
            intakeImages(files)
          }
        }}
        onDragOver={(event) => { event.preventDefault() }}
        onDrop={(event) => {
          event.preventDefault()
          const files = [...event.nativeEvent.dataTransfer?.files ?? []]
          if (files.length > 0) intakeImages(files)
        }}
      />
      </div>
    </FocusScope>
  )
})

/** The menu-open state of one session's trigger controller. */
function useMenuOpen(controller: InputTriggerController | undefined): boolean {
  const closedStore = { subscribe: (): (() => void) => () => {}, getSnapshot: () => false }
  const store = controller === undefined ? closedStore : {
    subscribe: (run: () => void) => controller.menu.subscribe(run),
    getSnapshot: () => controller.menu.getSnapshot().open,
  }
  const useMenu = useStoreOf(store)
  return useMenu(open => open)
}

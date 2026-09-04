/**
 * The rich editing surface: the `conversation.composer.editor` seat entry.
 *
 * The stock bar keeps every chrome piece — toolbar, seats, accessory, its own
 * trigger menu — and renders this component where its Lexical editor used to
 * bind. Two modes:
 *
 * - **Enabled** (the takeover): a CodeMirror 6 editor whose document is the
 *   full markdown source, decorated live by the ported reference machinery.
 *   The browser never edits the buffer — CodeMirror turns input into
 *   transactions — and the surface is the single writer: every document
 *   change pushes into the session shell via `setDraft(text, false)`, while
 *   the shell's Lexical editor runs headless with a dormant keymap.
 * - **Disabled** (the settings toggle off): a plain div bound to the shell
 *   editor as its Lexical root — the stock editing behavior, stock keymap
 *   included — with none of the decoration.
 *
 * The `composer.*` actions this plugin registers are responsive here: the
 * keybinding dispatcher claims bound gestures (window capture) before any
 * CodeMirror handler runs, and the surface's own `onKey` claims the
 * composer-native ones (menu arbitration, space, the accelerated chord) that
 * arrive unclaimed.
 */
import { memo, useEffect, useRef } from 'react'
import type {
  InjectFace, PropsLocale, PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import type { InputTriggerController } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import { FocusScope } from '@zitro/dsh-oot-ui-actions/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ComposerAttachment, InputState } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { createRichSurface, type RichSurface } from './editor/cm/surface.ts'
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
  // Subscribed shell state: the adoption pass reads the draft and its rev.
  const shellState = useStoreOf(shell.state)(value => value)

  const editableRef = useRef<HTMLDivElement | null>(null)
  const controlRef = useRef<RichSurface | null>(null)
  const machineBusyRef = useRef(machineBusy)
  machineBusyRef.current = machineBusy

  /** Submit from the accelerated chord (plain Enter is the send action's). */
  const submitWith = (gesture: SendGesture): void => {
    if (machineBusyRef.current) return
    const state = shell.state.getSnapshot()
    const empty = state.draft === ''
    if (gesture === 'accelerated' && empty) {
      shell.steerQueue()
      return
    }
    if (empty) return
    // Submit first (it captures the draft into its event), then the carried
    // text becomes a history entry and the composer starts a fresh draft.
    shell.submit(resolveMode(false, gesture, true))
    controlRef.current?.sent()
  }

  const intakeImages = (files: readonly File[]): void => {
    if (files.length === 0 || machineBusyRef.current) return
    try {
      const images = conversation.createDraftImages(files)
      if (!shell.addImages(images.map(image => image.id))) {
        for (const image of images) conversation.releaseDraftImage(image.id)
      }
    } catch {
      shell.notify('error', t('imageUnsupported'))
    }
  }

  // Gesture policy, claimed before CodeMirror's handlers. The keybinding
  // dispatcher has already taken everything bound (window capture); what runs
  // here is the standalone fallback for compositions without it, plus the
  // composer-native gestures no binding ever owns.
  const claimKey = (e: KeyboardEvent): boolean => {
    if (e.isComposing) return false
    // The trigger menu's keys are claimed by the palette actions while it is
    // open; this arbitration is the fallback for when no dispatcher did.
    const arbitrateKey = e.key === 'ArrowUp' ? 'up'
      : e.key === 'ArrowDown' ? 'down'
        : e.key === 'Enter' ? 'enter'
          : e.key === 'Escape' ? 'escape'
            : e.key === 'Tab' ? 'tab'
              : null
    if (arbitrateKey !== null && shell.arbitrate(arbitrateKey, e.isComposing) !== 'pass') return true
    if (e.key === ' ' && !machineBusyRef.current && shell.space()) return true
    if (e.key === 'Enter' && !e.shiftKey && (e.ctrlKey || e.metaKey)) {
      // The accelerated chord is a composer-native gesture: empty draft steers
      // the queue; otherwise submit with the opposite delivery preference.
      // Plain Enter belongs to the `composer.send` binding — unbound, it
      // falls to the browser and breaks the line.
      submitWith('accelerated')
      return true
    }
    return false
  }

  // The live values the mounted callbacks must not grow stale on: the surface
  // is created once per editable, the policy under it moves with the render.
  const policy = useRef({ claimKey, intakeImages })
  policy.current = { claimKey, intakeImages }

  // Enabled mode: mount CodeMirror. Declared BEFORE the disabled-mode binding
  // so a mode flip orders correctly — React runs cleanups in declaration
  // order, then the effects, so CodeMirror tears down before the stock editor
  // binds the same div, and the stock editor unbinds before CodeMirror mounts.
  useEffect(() => {
    if (!enabled) return
    const el = editableRef.current
    if (el === null) return
    const control = createRichSurface({
      host: el,
      doc: shell.state.getSnapshot().draft,
      placeholderText,
      ariaLabel: placeholderText,
      onEdit: (text) => {
        // false: this surface owns the visible caret; the shell's editor is
        // headless here, and any selection it took would land nowhere.
        shell.setDraft(text, false)
      },
      onCaret: (text, head) => {
        if (triggers === undefined) return
        const rev = shell.state.getSnapshot().draftRev
        triggers.track(text, head, { tier: machineBusyRef.current ? 'claimed' : 'plain' }, rev)
      },
      onFiles: (files) => { policy.current.intakeImages(files) },
      onKey: (event) => policy.current.claimKey(event),
    })
    controlRef.current = control
    return () => {
      control.dispose()
      controlRef.current = null
    }
  }, [enabled, shell, triggers, placeholderText])

  // Adopt shell-side draft changes this surface did not make: a persisted
  // seed, a pick insert, a send-clear. Every own push also bumps the rev, so
  // the rev alone cannot tell echo from external change — the document does:
  // when the editor already holds the text, the rev bump was the push itself
  // and adopting would slam the caret to the end of a buffer the writer is
  // midway through.
  // The rev the surface last saw; null until the mount sync — the surface
  // is CREATED from the shell's live snapshot, so the first effect run has
  // nothing to adopt. Skipping it is what keeps a mounted-with-seed draft
  // alive: the subscribed snapshot can lag the shell's editor (the seed
  // publishes after the render that mounted this surface captured it), and
  // adopting that stale empty draft would wipe the seed and, through the
  // push-back, the persisted store itself.
  const lastRev = useRef<number | null>(null)
  useEffect(() => {
    if (!enabled) return
    if (lastRev.current === null) {
      lastRev.current = shellState.draftRev
      return
    }
    if (shellState.draftRev === lastRev.current) return
    lastRev.current = shellState.draftRev
    const control = controlRef.current
    if (control !== null && control.held() === shellState.draft) return
    control?.adopt(shellState.draft)
  }, [shellState, enabled])

  // Disabled mode: bind the shell editor's root to this div — the stock
  // editing surface, stock keymap included.
  useEffect(() => {
    if (enabled) return
    const el = editableRef.current
    if (el === null || editor === null) return
    editor.setRootElement(el)
    editor.setEditable(editable)
    return () => { editor.setRootElement(null) }
  }, [enabled, editor, editable])

  // The surface's verbs, registered into the service stock keybindings reach.
  const facesRef = useRef({ submitWith, machineBusy })
  facesRef.current = { submitWith, machineBusy }
  useEffect(() => {
    if (sessionId === undefined) return
    return service.register(sessionId, {
      send: (gesture) => { facesRef.current.submitWith(gesture) },
      queue: () => {
        if (!facesRef.current.machineBusy) {
          shell.submit('queue')
          controlRef.current?.sent()
        }
      },
      steer: () => {
        if (!facesRef.current.machineBusy) {
          shell.submit('steer')
          controlRef.current?.sent()
        }
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

  return (
    <FocusScope name="composer">
      <div className={css.grow}>
        <div
          ref={editableRef}
          className={enabled ? css.surface : css.editable}
          contentEditable={enabled ? undefined : 'plaintext-only'}
          aria-label={placeholderText}
          aria-multiline="true"
          role={enabled ? undefined : 'textbox'}
          aria-disabled={editorDisabled || undefined}
          data-phase={phase}
          spellCheck={false}
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

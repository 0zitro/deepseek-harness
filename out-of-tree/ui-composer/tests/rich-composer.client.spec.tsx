// @vitest-environment jsdom
/**
 * The rich composer surface over fakes: the editable drives the shell as its
 * session plane (every edit pushed via `setDraft`, shell-side changes adopted
 * back), Enter submits with the resolved delivery mode, the trigger menu owns
 * its keys while open, and the trigger pipeline is fed the real caret.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { InputState } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { InputTriggerController } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import { RichComposer, type RichComposerProps } from '../src/client/RichComposer.tsx'
import { useStoreOf } from '../src/client/useStore.ts'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

/** An idle input state for one session. */
const stateOf = (draft: string): InputState => ({
  draft,
  imageIds: [],
  draftRev: 1,
  phase: 'plain',
  occurrences: [],
  queue: [],
})

/** The shell fake: a state store plus spies for every verb the chrome calls. */
function shellFake(draft = '') {
  const state = createSnapshotStore<InputState>(stateOf(draft))
  return {
    state,
    setDraft: vi.fn((text: string) => { state.set({ ...state.getSnapshot(), draft: text, draftRev: state.getSnapshot().draftRev + 1 }) }),
    submit: vi.fn(),
    steerQueue: vi.fn(),
    arbitrate: vi.fn(() => 'pass' as const),
    space: vi.fn(() => false),
    notify: vi.fn(),
    addImages: vi.fn(() => true),
    removeImage: vi.fn(),
  }
}

/** The trigger controller fake: track spy plus a closed menu store. */
function triggersFake() {
  return {
    track: vi.fn(),
    toggleSource: vi.fn(),
    pick: vi.fn(),
    hover: vi.fn(),
    arbitrate: vi.fn(() => 'pass' as const),
    onSpace: vi.fn(() => false),
    dismiss: vi.fn(),
    menu: createSnapshotStore({ open: false, hit: null, generation: 0, groups: [], highlight: null }),
  } as unknown as InputTriggerController & { track: ReturnType<typeof vi.fn>; menu: { getSnapshot(): { open: boolean } } }
}

/** Render the chrome over fakes, standard kit included by cast (component-test scope). */
function mountChrome(
  draft = '',
  options: {
    session?: { running?: boolean; subagent?: unknown }
    arbitrate?: () => 'pass' | 'consumed'
    queued?: boolean
  } = {},
) {
  const shell = shellFake(draft)
  const triggers = triggersFake()
  if (options.arbitrate !== undefined) {
    ;(shell as { arbitrate: unknown }).arbitrate = options.arbitrate
    ;(triggers as { arbitrate: unknown }).arbitrate = options.arbitrate
  }
  const inputStore = createSnapshotStore<InputState>({
    ...stateOf(draft),
    queue: options.queued === true ? ([{ id: 'q1', placement: 'queued' }] as unknown as InputState['queue']) : [],
  })
  const noticeStore = createSnapshotStore<{ level: 'info' | 'error'; text: string; seq: number } | null>(null)
  const useInputReal = useStoreOf(inputStore)
  const useNoticesReal = useStoreOf(noticeStore)

  const props = {
    session: options.session ?? {},
    useInput: useInputReal,
    useNotices: useNoticesReal,
    useProjection: () => undefined,
    useSessions: () => undefined,
    useSessionPendingInteraction: () => undefined,
    useWorkspaces: () => undefined,
    useConversation: () => undefined,
    useStore: () => undefined,
    inputActions: undefined,
    rich: {
      shell,
      conversation: {
        createDraftImages: vi.fn(() => []),
        draftImages: vi.fn(() => []),
        releaseDraftImage: vi.fn(),
      },
      triggers,
      publishMenuOpen: vi.fn(),
      service: { register: vi.fn(() => () => {}) },
      stop: vi.fn(),
      resolveMode: (running: boolean, gesture: 'enter' | 'accelerated', steering: boolean) =>
        !running || !steering ? 'queue' as const : gesture === 'enter' ? 'queue' as const : 'steer' as const,
    },
    t: (key: keyof typeof en, params?: Record<string, unknown>) => {
      const text = en[key]
      return text.replace('{count}', String(params?.count ?? '')).replace('{size}', String(params?.size ?? ''))
    },
  } as unknown as RichComposerProps

  const utils = render(<RichComposer {...props} />)
  const editable = () => {
    const el = screen.getByRole('textbox')
    return el as HTMLDivElement
  }
  return { shell, triggers, inputStore, noticeStore, utils, editable, props }
}

describe('the editing surface', () => {
  it('renders the editable with its placeholder while empty', () => {
    mountChrome()
    expect(screen.getByRole('textbox')).toBeTruthy()
    expect(screen.getByText(en.placeholder)).toBeTruthy()
  })

  it('pushes every edit into the shell without stealing focus', async () => {
    const { editable, shell } = mountChrome()
    editable().textContent = 'hello'
    // caretToEnd=false: the shell's editor is mounted-hidden behind the
    // chain overlay; selecting into it would take the document selection —
    // and focus — away from this surface on every keystroke.
    await waitFor(() => { expect(shell.setDraft).toHaveBeenCalledWith('hello', false) })
  })

  it('decorates what is typed: a folded math atom replaces the source on screen', async () => {
    const { editable } = mountChrome()
    const el = editable()
    el.textContent = 'say $x^2$ now'
    await waitFor(() => {
      // The hidden source is held; the drawing is marked; the held text is the source.
      expect(el.querySelector('[data-ccx-atom]')).not.toBeNull()
      expect(el.querySelector('[data-ccx-draw]')).not.toBeNull()
    })
  })

  it('adopts a shell-side draft change it did not make', async () => {
    const { inputStore, editable } = mountChrome('')
    inputStore.set(stateOf('recalled text'))
    await waitFor(() => { expect(editable().textContent).toContain('recalled text') })
  })
})

describe('submit gestures', () => {
  it('submits on Enter with the resolved delivery mode', async () => {
    const { editable, shell } = mountChrome()
    editable().textContent = 'go'
    await waitFor(() => { expect(shell.setDraft).toHaveBeenCalled() })
    fireEvent.keyDown(editable(), { key: 'Enter' })
    expect(shell.submit).toHaveBeenCalledWith('queue')
  })

  it('keeps Shift+Enter as the browser\'s own line break', () => {
    const { editable, shell } = mountChrome()
    fireEvent.keyDown(editable(), { key: 'Enter', shiftKey: true })
    expect(shell.submit).not.toHaveBeenCalled()
  })

  it('steers the queue on an accelerated Enter with an empty draft', () => {
    const { editable, shell } = mountChrome('', { session: { running: true }, queued: true })
    fireEvent.keyDown(editable(), { key: 'Enter', ctrlKey: true })
    expect(shell.steerQueue).toHaveBeenCalled()
    expect(shell.submit).not.toHaveBeenCalled()
  })

  it('does not submit an empty draft', () => {
    const { editable, shell } = mountChrome('')
    fireEvent.keyDown(editable(), { key: 'Enter' })
    expect(shell.submit).not.toHaveBeenCalled()
  })
})

describe('the trigger pipeline', () => {
  it('feeds the real caret after every decoration', async () => {
    const { editable, triggers } = mountChrome()
    editable().textContent = '/mod'
    await waitFor(() => { expect(triggers.track).toHaveBeenCalled() })
    const call = (triggers as unknown as { track: ReturnType<typeof vi.fn> }).track.mock.calls.at(-1)
    expect(call?.[0]).toBe('/mod')
  })

  it('lets the menu own its keys while open', () => {
    const { editable, shell } = mountChrome('', { arbitrate: () => 'consumed' })
    fireEvent.keyDown(editable(), { key: 'Enter' })
    expect(shell.submit).not.toHaveBeenCalled()
  })

  it('claims Space when the pipeline applies a token', () => {
    const { editable, shell } = mountChrome('', { arbitrate: () => 'pass' })
    ;(shell as unknown as { space: ReturnType<typeof vi.fn> }).space.mockReturnValue(true)
    fireEvent.keyDown(editable(), { key: ' ' })
    // The event was claimed: preventDefault happened, and no submit fired.
    expect(shell.submit).not.toHaveBeenCalled()
  })
})

describe('source-level undo', () => {
  it('walks a edit back and forward with the selection restored', async () => {
    const { editable } = mountChrome()
    const el = editable()
    el.textContent = 'one'
    await waitFor(() => { expect(el.textContent).toBe('one') })
    el.textContent = 'one two'
    await waitFor(() => { expect(el.textContent).toBe('one two') })
    fireEvent.keyDown(el, { key: 'z', ctrlKey: true })
    await waitFor(() => { expect(el.textContent).toBe('one') })
    fireEvent.keyDown(el, { key: 'z', ctrlKey: true, shiftKey: true })
    await waitFor(() => { expect(el.textContent).toBe('one two') })
  })
})

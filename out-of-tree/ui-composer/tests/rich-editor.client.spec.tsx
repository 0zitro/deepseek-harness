// @vitest-environment jsdom
/**
 * The editor surface over fakes: the editable drives the shell as its session
 * plane, shell-side changes are adopted back, the accelerated chord submits,
 * and the surface registers its verbs into the service the actions reach.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { InputState } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { InputTriggerController } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import { RichEditorSurface, type RichEditorProps } from '../src/client/EditorSurface.tsx'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

const stateOf = (draft: string): InputState => ({
  draft, imageIds: [], draftRev: 1, phase: 'plain', occurrences: [], queue: [],
})

function mountSurface(options: { draft?: string; queued?: boolean } = {}) {
  const shell = {
    state: createSnapshotStore<InputState>(stateOf(options.draft ?? '')),
    setDraft: vi.fn((text: string) => {
      const s = shell.state.getSnapshot()
      shell.state.set({ ...s, draft: text, draftRev: s.draftRev + 1 })
    }),
    submit: vi.fn(),
    steerQueue: vi.fn(),
    arbitrate: vi.fn(() => 'pass' as const),
    space: vi.fn(() => false),
    notify: vi.fn(),
    addImages: vi.fn(() => true),
    removeImage: vi.fn(),
    dismissPopup: vi.fn(),
  }
  const inputStore = createSnapshotStore<InputState>({
    ...stateOf(options.draft ?? ''),
    queue: options.queued === true ? ([{ id: 'q1', placement: 'queued' }] as unknown as InputState['queue']) : [],
  })
  const triggers = {
    track: vi.fn(),
    dismiss: vi.fn(),
    menu: createSnapshotStore({ open: false, hit: null, generation: 0, groups: [], highlight: null }),
  } as unknown as InputTriggerController & { track: ReturnType<typeof vi.fn>; menu: { getSnapshot(): { open: boolean } } }
  const enabledStore = createSnapshotStore(true)

  const registered = { faces: undefined as unknown as Record<string, (...args: unknown[]) => unknown> }
  const props = {
    sessionId: 'session-1' as never,
    editor: null,
    editable: true,
    editorDisabled: false,
    phase: 'plain',
    placeholderText: en.placeholder,
    hint: null,
    workspaceTrigger: false,
    workspacePickerOpen: false,
    onWorkspaceKeyDown: undefined,
    useProjection: () => undefined,
    rich: {
      shell,
      conversation: {
        createDraftImages: vi.fn(() => []),
        draftImages: vi.fn(() => []),
        releaseDraftImage: vi.fn(),
      },
      triggers,
      publishMenuOpen: vi.fn(),
      service: {
        register: vi.fn((_id: unknown, faces: Record<string, (...args: unknown[]) => unknown>) => {
          registered.faces = faces
          return () => {}
        }),
      },
      enabled: enabledStore,
      resolveMode: (running: boolean, gesture: string, steering: boolean) =>
        !running || !steering ? 'queue' as const : gesture === 'enter' ? 'queue' as const : 'steer' as const,
    },
    t: (key: keyof typeof en) => en[key],
  } as unknown as RichEditorProps

  render(<RichEditorSurface {...props} />)
  const editable = () => screen.getByRole('textbox') as HTMLDivElement
  return { shell, triggers, inputStore, enabledStore, editable, registered }
}

describe('the rich editor surface', () => {
  it('renders the editable with the stock placeholder copy', () => {
    mountSurface()
    expect(screen.getByRole('textbox')).toBeTruthy()
    expect(screen.getByText(en.placeholder)).toBeTruthy()
  })

  it('pushes every edit into the shell without stealing focus', async () => {
    const { editable, shell } = mountSurface()
    editable().textContent = 'hello'
    await waitFor(() => { expect(shell.setDraft).toHaveBeenCalledWith('hello', false) })
  })

  it('decorates typed maths into a fold with a marked drawing', async () => {
    const { editable } = mountSurface()
    editable().textContent = 'a $x^2$ b'
    await waitFor(() => {
      expect(editable().querySelector('[data-ccx-atom]')).not.toBeNull()
      expect(editable().querySelector('[data-ccx-draw]')).not.toBeNull()
    })
  })

  it('adopts a shell-side draft change it did not make', async () => {
    const { shell, editable } = mountSurface()
    shell.state.set({ ...shell.state.getSnapshot(), draft: 'recalled text', draftRev: 5 })
    await waitFor(() => { expect(editable().textContent).toContain('recalled text') })
  })

  it('plain Enter does nothing at element level: the send action owns it', () => {
    const { editable, shell } = mountSurface()
    fireEvent.keyDown(editable(), { key: 'Enter' })
    expect(shell.submit).not.toHaveBeenCalled()
  })

  it('the accelerated chord steers the queue on an empty draft', () => {
    const { editable, shell } = mountSurface({ queued: true })
    fireEvent.keyDown(editable(), { key: 'Enter', ctrlKey: true })
    expect(shell.steerQueue).toHaveBeenCalled()
    expect(shell.submit).not.toHaveBeenCalled()
  })

  it('registers its verbs into the service the actions reach', () => {
    const { registered } = mountSurface()
    expect(registered.faces.send).toBeTypeOf('function')
    expect(registered.faces.undo).toBeTypeOf('function')
    expect(registered.faces.dismissPopup).toBeTypeOf('function')
  })

  it('dismissPopup closes the trigger menu and the popup shell', () => {
    const { registered, triggers, shell } = mountSurface()
    registered.faces.dismissPopup!()
    expect((triggers as unknown as { dismiss: ReturnType<typeof vi.fn> }).dismiss).toHaveBeenCalled()
    expect(shell.dismissPopup).toHaveBeenCalled()
  })
})

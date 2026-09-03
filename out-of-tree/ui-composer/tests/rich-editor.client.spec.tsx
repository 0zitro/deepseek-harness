// @vitest-environment jsdom
/**
 * The editor seat entry over fakes: it mounts the CodeMirror surface, adopts
 * shell-side draft changes back, leaves an unbound plain Enter to the editor
 * (the send action owns the gesture, not the surface), steers on the
 * accelerated chord, binds the stock editor when the takeover is off, and
 * registers its verbs into the service the actions reach.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { InputState } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { InputTriggerController } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import { RichEditorSurface, type RichEditorProps } from '../src/client/EditorSurface.tsx'
import { en } from '../src/client/locales.ts'

vi.stubGlobal('ResizeObserver', class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
})

// jsdom's Range lacks layout geometry; CodeMirror's measure pass reads it in
// a rAF callback that would otherwise surface as an unhandled rejection.
Range.prototype.getClientRects = function getClientRects(): DOMRectList {
  return [] as unknown as DOMRectList
}

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
  const editor = {
    setRootElement: vi.fn(),
    setEditable: vi.fn(),
  }
  const triggers = {
    track: vi.fn(),
    dismiss: vi.fn(),
    menu: createSnapshotStore({ open: false, hit: null, generation: 0, groups: [], highlight: null }),
  } as unknown as InputTriggerController & { track: ReturnType<typeof vi.fn>; menu: { getSnapshot(): { open: boolean } } }
  const enabledStore = createSnapshotStore(true)

  const registered = { faces: undefined as unknown as Record<string, (...args: unknown[]) => unknown> }
  const props = {
    sessionId: 'session-1' as never,
    editor,
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
  const content = () => document.querySelector('.cm-content') as HTMLElement
  return { shell, triggers, enabledStore, content, registered, editor }
}

describe('the rich editor surface', () => {
  it('mounts the CodeMirror editor with the stock placeholder copy', () => {
    mountSurface()
    expect(document.querySelector('.cm-editor')).not.toBeNull()
    expect(screen.getByText(en.placeholder)).toBeTruthy()
  })

  it('adopts a shell-side draft change it did not make, decorated', async () => {
    const { shell, content } = mountSurface()
    shell.state.set({ ...shell.state.getSnapshot(), draft: 'a $x^2$ b', draftRev: 5 })
    await waitFor(() => {
      // The document carries the source; the drawing stands in for it.
      expect(content().querySelector('[data-ccx-draw]')).not.toBeNull()
      expect(content().querySelector('[data-ccx-atom]')).not.toBeNull()
    })
    expect(content().textContent).not.toContain('$x^2$')
  })

  it('binds the stock editor when the takeover is toggled off', async () => {
    const { enabledStore, editor } = mountSurface()
    enabledStore.set(false)
    await waitFor(() => { expect(editor.setRootElement).toHaveBeenCalled() })
    expect(editor.setEditable).toHaveBeenCalledWith(true)
    expect(document.querySelector('.cm-editor')).toBeNull()
  })

  it('plain Enter is the editor\'s: it breaks the line, and the surface does not send', () => {
    const { shell, content } = mountSurface()
    fireEvent.keyDown(content(), { key: 'Enter' })
    expect(document.querySelectorAll('.cm-line')).toHaveLength(2)
    expect(shell.submit).not.toHaveBeenCalled()
  })

  it('the accelerated chord steers the queue on an empty draft', () => {
    const { shell, content } = mountSurface({ queued: true })
    fireEvent.keyDown(content(), { key: 'Enter', ctrlKey: true })
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

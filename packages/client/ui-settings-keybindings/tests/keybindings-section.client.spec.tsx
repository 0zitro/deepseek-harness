// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-web-react'
import { createSnapshotStore, type SessionListState, type WorkspaceListState } from '@deepseek-ai/dsh-client-runtime/client'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { KeybindingsSection } from '../src/client/KeybindingsSection.tsx'
import type { KeybindingsSectionProps } from '../src/client/KeybindingsSection.tsx'
import { en } from '../src/client/locales.ts'
import { DEFAULT_SEND_KEYBINDING, type Keybinding } from '../src/keybinding.ts'

afterEach(cleanup)

function emptySessions() {
  return bindSnapshotSelector(createSnapshotStore<SessionListState>({
    ids: [], byId: {}, current: undefined, phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined,
  }))
}

function emptyWorkspaces() {
  return bindSnapshotSelector(createSnapshotStore<WorkspaceListState>({
    items: [], archivedSessionIds: [], state: 'idle', phase: 'ready', error: null,
    baselinesReady: true, recentWorkspaceId: undefined,
  }))
}

function mount() {
  const store = createSnapshotStore<Keybinding>(DEFAULT_SEND_KEYBINDING)
  const setSendMessage = vi.fn((next: Keybinding) => { store.set(next) })
  const props: KeybindingsSectionProps = {
    close: () => {},
    useSessions: emptySessions(),
    useWorkspaces: emptyWorkspaces(),
    useSendMessage: bindSnapshotSelector(store),
    setSendMessage,
    t: makeTranslate(en),
  }
  render(<KeybindingsSection {...props} />)
  return { store, setSendMessage }
}

describe('KeybindingsSection', () => {
  it('shows the send-message row, its default binding, and the when input', () => {
    mount()
    expect(screen.getByText('Send message')).toBeDefined()
    expect(screen.getByRole('button', { name: /Enter/ })).toBeDefined()
    expect(screen.getByPlaceholderText('e.g. composerFocused && !agentBusy')).toBeDefined()
  })

  it('persists a when clause through the setter', () => {
    const { setSendMessage } = mount()
    fireEvent.change(screen.getByPlaceholderText('e.g. composerFocused && !agentBusy'), { target: { value: 'agentBusy' } })
    expect(setSendMessage).toHaveBeenCalledWith({ strokes: DEFAULT_SEND_KEYBINDING.strokes, when: 'agentBusy' })
  })

  it('flags an invalid when clause on blur', () => {
    mount()
    const input = screen.getByPlaceholderText('e.g. composerFocused && !agentBusy')
    fireEvent.change(input, { target: { value: 'a &&' } })
    fireEvent.blur(input)
    expect(input.getAttribute('aria-invalid')).toBe('true')
  })

  it('persists a recorded chord through the setter', () => {
    const { setSendMessage } = mount()
    const recorder = screen.getByRole('button', { name: /Send message/ })
    fireEvent.click(recorder)
    fireEvent.keyDown(recorder, { key: 'k', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false })
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(setSendMessage).toHaveBeenCalledWith({ strokes: [{ key: 'k', modifiers: ['ctrl'] }] })
  })

  it('clears the when clause back to undefined', () => {
    const { setSendMessage } = mount()
    const input = screen.getByPlaceholderText('e.g. composerFocused && !agentBusy')
    fireEvent.change(input, { target: { value: 'agentBusy' } })
    fireEvent.change(input, { target: { value: '' } })
    expect(setSendMessage).toHaveBeenLastCalledWith({ strokes: DEFAULT_SEND_KEYBINDING.strokes })
  })

  it('leaves the error state clear on an empty when clause', () => {
    mount()
    const input = screen.getByPlaceholderText('e.g. composerFocused && !agentBusy')
    fireEvent.blur(input)
    expect(input.getAttribute('aria-invalid')).toBeNull()
  })

  it('preserves the when clause while recording a chord', () => {
    const { setSendMessage } = mount()
    const input = screen.getByPlaceholderText('e.g. composerFocused && !agentBusy')
    fireEvent.change(input, { target: { value: 'agentBusy' } })
    const recorder = screen.getByRole('button', { name: /Send message/ })
    fireEvent.click(recorder)
    fireEvent.keyDown(recorder, { key: 'k', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false })
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(setSendMessage).toHaveBeenLastCalledWith({ strokes: [{ key: 'k', modifiers: ['ctrl'] }], when: 'agentBusy' })
  })
})

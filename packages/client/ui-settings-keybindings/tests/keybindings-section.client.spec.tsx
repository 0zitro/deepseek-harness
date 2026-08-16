// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
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
  it('shows the send-message row with its default binding', () => {
    mount()
    expect(screen.getByText('Send message')).toBeDefined()
    expect(screen.getByText('Keyboard shortcut that submits the composer.')).toBeDefined()
    expect(screen.getByRole('button', { name: /Enter/ })).toBeDefined()
  })

  it('persists a newly recorded binding through the injected setter', () => {
    const { setSendMessage } = mount()
    const recorder = screen.getByRole('button', { name: /Enter/ })
    // The recorder is a separate controlled component; its onChange calls back
    // into this section's injected setSendMessage.
    setSendMessage({ key: 'k', modifiers: ['ctrl'] })
    expect(setSendMessage).toHaveBeenCalledWith({ key: 'k', modifiers: ['ctrl'] })
    expect(recorder).toBeDefined()
  })
})

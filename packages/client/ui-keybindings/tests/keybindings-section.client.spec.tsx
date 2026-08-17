// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-web-react'
import { createSnapshotStore, type SessionListState, type WorkspaceListState } from '@deepseek-ai/dsh-client-runtime/client'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { KeybindingsSection } from '../src/client/KeybindingsSection.tsx'
import type { KeybindingsSectionProps } from '../src/client/KeybindingsSection.tsx'
import type { UiActionDefinition } from '../src/client/action-registry.ts'
import { en } from '../src/client/locales.ts'
import { keybindingKey, type Keybinding, type KeybindingOverride, type KeyStroke } from '../src/keybinding.ts'
import { COMPOSER_SEND_ACTION, type UiActionId } from '../src/ui-action.ts'

afterEach(cleanup)

const PREVIEW_ACTION = 'composer.preview' as UiActionId

/** The composer's Enter default, mirroring the stock-actions registration. */
const ENTER: Keybinding = { strokes: [{ key: 'Enter', modifiers: [] }] }
const KEY = keybindingKey('send')
const BASE: Keybinding = { strokes: [{ key: 'Enter', modifiers: [] }] }
const ovr = (strokes: KeyStroke[], when?: string): KeybindingOverride =>
  ({ action: COMPOSER_SEND_ACTION, source: 'user', key: KEY, base: BASE, strokes, ...(when === undefined ? {} : { when }) })

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

function mount(actions: readonly UiActionDefinition[] = [
  { id: COMPOSER_SEND_ACTION, label: 'Send message', defaultKeybindings: [{ key: KEY, ...ENTER }], run: () => {} },
]) {
  const actionsStore = createSnapshotStore<readonly UiActionDefinition[]>(actions)
  const bindingsStore = createSnapshotStore<readonly KeybindingOverride[]>([])
  const setBinding = vi.fn((override: KeybindingOverride) => {
    const keep = (existing: KeybindingOverride) =>
      existing.action !== override.action || existing.key !== override.key || existing.source !== override.source
    bindingsStore.set([...bindingsStore.getSnapshot().filter(keep), override])
  })
  const props: KeybindingsSectionProps = {
    close: () => {},
    useSessions: emptySessions(),
    useWorkspaces: emptyWorkspaces(),
    useActions: bindSnapshotSelector(actionsStore),
    useBindings: bindSnapshotSelector(bindingsStore),
    setBinding,
    t: makeTranslate(en),
  }
  render(<KeybindingsSection {...props} />)
  return { setBinding }
}

describe('KeybindingsSection', () => {
  it('shows the send-message row, its default binding, and the when input', () => {
    mount()
    expect(screen.getByText('Send message')).toBeDefined()
    expect(screen.getByRole('button', { name: /Enter/ })).toBeDefined()
    expect(screen.getByPlaceholderText('e.g. composerFocused && !agentBusy')).toBeDefined()
  })

  it('persists a when clause through the setter', () => {
    const { setBinding } = mount()
    fireEvent.change(screen.getByPlaceholderText('e.g. composerFocused && !agentBusy'), { target: { value: 'agentBusy' } })
    expect(setBinding).toHaveBeenCalledWith(ovr(ENTER.strokes, 'agentBusy'))
  })

  it('shows the description and an empty chord when an action has no default', () => {
    mount([{ id: PREVIEW_ACTION, label: 'Preview', description: 'Toggle the preview pane', run: () => {} }])
    expect(screen.getByText('Preview')).toBeDefined()
    expect(screen.getByText('Toggle the preview pane')).toBeDefined()
    expect(screen.getByRole('button', { name: /Press keys/ })).toBeDefined()
  })

  it('shows a default with its when clause', () => {
    mount([{ id: COMPOSER_SEND_ACTION, label: 'Send message', defaultKeybindings: [{ key: KEY, strokes: ENTER.strokes, when: 'composerActive' }], run: () => {} }])
    expect(screen.getByDisplayValue('composerActive')).toBeDefined()
  })

  it('flags an invalid when clause on blur', () => {
    mount()
    const input = screen.getByPlaceholderText('e.g. composerFocused && !agentBusy')
    fireEvent.change(input, { target: { value: 'a &&' } })
    fireEvent.blur(input)
    expect(input.getAttribute('aria-invalid')).toBe('true')
  })

  it('persists a recorded chord through the setter', () => {
    const { setBinding } = mount()
    const recorder = screen.getByRole('button', { name: /Send message/ })
    fireEvent.click(recorder)
    fireEvent.keyDown(recorder, { key: 'k', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false })
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(setBinding).toHaveBeenCalledWith(ovr([{ key: 'k', modifiers: ['ctrl'] }]))
  })

  it('clears the when clause back to undefined', () => {
    const { setBinding } = mount()
    const input = screen.getByPlaceholderText('e.g. composerFocused && !agentBusy')
    fireEvent.change(input, { target: { value: 'agentBusy' } })
    fireEvent.change(input, { target: { value: '' } })
    expect(setBinding).toHaveBeenLastCalledWith(ovr(ENTER.strokes))
  })

  it('leaves the error state clear on an empty when clause', () => {
    mount()
    const input = screen.getByPlaceholderText('e.g. composerFocused && !agentBusy')
    fireEvent.blur(input)
    expect(input.getAttribute('aria-invalid')).toBeNull()
  })

  it('preserves the when clause while recording a chord', () => {
    const { setBinding } = mount()
    const input = screen.getByPlaceholderText('e.g. composerFocused && !agentBusy')
    fireEvent.change(input, { target: { value: 'agentBusy' } })
    const recorder = screen.getByRole('button', { name: /Send message/ })
    fireEvent.click(recorder)
    fireEvent.keyDown(recorder, { key: 'k', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false })
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(setBinding).toHaveBeenLastCalledWith(ovr([{ key: 'k', modifiers: ['ctrl'] }], 'agentBusy'))
  })
})

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-web-react'
import { createSnapshotStore, type SessionListState, type WorkspaceListState } from '@deepseek-ai/dsh-client-runtime/client'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { KeybindingsSection, sourceLabel } from '../src/client/KeybindingsSection.tsx'
import type { KeybindingsSectionProps } from '../src/client/KeybindingsSection.tsx'
import type { UiActionDefinition } from '../src/client/action-registry.ts'
import { en } from '../src/client/locales.ts'
import {
  keybindingKey, pluginId,
  type Keybinding, type KeybindingEdit, type KeybindingOverrideRef, type SourcedOverride,
} from '../src/keybinding.ts'
import { COMPOSER_SEND_ACTION, type UiActionId } from '../src/ui-action.ts'

afterEach(cleanup)

/** jsdom lays nothing out and captures no pointer, so a drag needs both supplied. */
function stubDragging(table: Element | null | undefined) {
  for (const cell of [...(table?.children ?? [])]) {
    cell.getBoundingClientRect = () =>
      ({ width: 100, height: 20, x: 0, y: 0, top: 0, left: 0, right: 100, bottom: 20, toJSON: () => ({}) })
  }
  for (const handle of [...(table?.querySelectorAll('[role="separator"]') ?? [])]) {
    handle.setPointerCapture = () => {}
  }
}

/** The widths the grid's column tracks carry, in column order. */
const weights = (table: Element | null | undefined) =>
  [...((table as HTMLElement | null)?.style.gridTemplateColumns ?? '').matchAll(/([\d.]+)px/g)]
    .map(match => Number(match[1]))

const PREVIEW_ACTION = 'composer.preview' as UiActionId

/** The composer's Enter default, mirroring the stock-actions registration. */
const ENTER: Keybinding = { strokes: [{ key: 'Enter', modifiers: [] }] }
const KEY = keybindingKey('send')
const BASE: Keybinding = { strokes: [{ key: 'Enter', modifiers: [] }] }
const REF = { action: COMPOSER_SEND_ACTION, key: KEY } as const

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
  const bindingsStore = createSnapshotStore<readonly SourcedOverride[]>([])
  // Mirrors the bound scope: an edit merges into the stored override.
  const setBinding = vi.fn((ref: KeybindingOverrideRef, base: Keybinding, edit: KeybindingEdit) => {
    const addresses = (existing: SourcedOverride) =>
      existing.action === ref.action && existing.key === ref.key
    const stored = bindingsStore.getSnapshot().find(addresses)
    const override: SourcedOverride = { ...(stored ?? { ...ref, base, source: 'user' }), ...edit }
    bindingsStore.set([...bindingsStore.getSnapshot().filter(existing => !addresses(existing)), override])
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
  return { setBinding, bindingsStore }
}

describe('KeybindingsSection', () => {
  it('shows the send-message row, its default binding, and the when input', () => {
    mount()
    expect(screen.getByText('Send message')).toBeDefined()
    expect(screen.getByRole('button', { name: /Enter/ })).toBeDefined()
    expect(screen.getByPlaceholderText('e.g. composerFocused && !agentBusy')).toBeDefined()
  })

  it('persists a when clause on blur, not while typing', () => {
    const { setBinding } = mount()
    const input = screen.getByPlaceholderText('e.g. composerFocused && !agentBusy')

    fireEvent.change(input, { target: { value: 'agentBusy' } })
    expect(setBinding).not.toHaveBeenCalled()

    fireEvent.blur(input)
    expect(setBinding).toHaveBeenCalledWith(REF, BASE, { when: 'agentBusy' })
  })

  it('commits nothing when a blurred field was not edited', () => {
    const { setBinding } = mount()
    fireEvent.blur(screen.getByPlaceholderText('e.g. composerFocused && !agentBusy'))
    expect(setBinding).not.toHaveBeenCalled()
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

  it('flags an invalid when clause on blur and stores nothing', () => {
    const { setBinding } = mount()
    const input = screen.getByPlaceholderText('e.g. composerFocused && !agentBusy')
    fireEvent.change(input, { target: { value: 'a &&' } })
    fireEvent.blur(input)
    expect(input.getAttribute('aria-invalid')).toBe('true')
    // A clause that does not parse resolves false, so storing it would disable the binding.
    expect(setBinding).not.toHaveBeenCalled()
  })

  it('persists a recorded chord through the setter', () => {
    const { setBinding } = mount()
    const recorder = screen.getByRole('button', { name: /Send message/ })
    fireEvent.click(recorder)
    fireEvent.keyDown(recorder, { key: 'k', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false })
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(setBinding).toHaveBeenCalledWith(REF, BASE, { strokes: [{ key: 'k', modifiers: ['ctrl'] }] })
  })

  it('clears the when clause to an empty predicate', () => {
    const { setBinding } = mount()
    const input = screen.getByPlaceholderText('e.g. composerFocused && !agentBusy')
    fireEvent.change(input, { target: { value: 'agentBusy' } })
    fireEvent.blur(input)
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)
    // An empty clause states no predicate, which is how a default's clause is cleared.
    expect(setBinding).toHaveBeenLastCalledWith(REF, BASE, { when: '' })
  })

  it('keeps the binding a seat ships on the page, inert, once an override takes it', () => {
    const { bindingsStore } = mount()
    act(() => {
      bindingsStore.set([{ ...REF, source: 'user', base: BASE, strokes: [{ key: 'k', modifiers: ['ctrl'] }] }])
    })

    // Both gestures read, but only the one that dispatches can be edited: the
    // shipped binding offers no recorder and holds no place to state.
    expect(screen.getByText('Enter')).toBeDefined()
    expect(screen.getByText('K')).toBeDefined()
    expect(screen.getAllByRole('button', { name: /Send message/ })).toHaveLength(1)
    expect(screen.getAllByLabelText('Priority: Send message')).toHaveLength(1)
    expect(screen.getAllByText('System')).toHaveLength(1)
    expect(screen.getByText('User')).toBeDefined()
  })

  it('replaces an untouched draft when the stored clause changes underneath', () => {
    const { bindingsStore } = mount()
    const input = screen.getByPlaceholderText('e.g. composerFocused && !agentBusy')
    fireEvent.change(input, { target: { value: 'half-typed' } })

    // Another client stored a clause while this field was being edited.
    act(() => { bindingsStore.set([{ ...REF, source: 'user', base: BASE, when: 'agentBusy' }]) })

    expect(screen.getByDisplayValue('agentBusy')).toBeDefined()
  })

  it('leaves the error state clear on an empty when clause', () => {
    mount()
    const input = screen.getByPlaceholderText('e.g. composerFocused && !agentBusy')
    fireEvent.blur(input)
    expect(input.getAttribute('aria-invalid')).toBeNull()
  })

  it('records a chord without restating the clause it did not touch', () => {
    const { setBinding } = mount()
    const input = screen.getByPlaceholderText('e.g. composerFocused && !agentBusy')
    fireEvent.change(input, { target: { value: 'agentBusy' } })
    fireEvent.blur(input)
    const recorder = screen.getByRole('button', { name: /Send message/ })
    fireEvent.click(recorder)
    fireEvent.keyDown(recorder, { key: 'k', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false })
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(setBinding).toHaveBeenLastCalledWith(REF, BASE, { strokes: [{ key: 'k', modifiers: ['ctrl'] }] })
    // The clause committed a moment ago survives in the stored override, not in this edit.
    expect(screen.getByDisplayValue('agentBusy')).toBeDefined()
  })

  it('renders one command cell spanning the rows it owns', () => {
    mount([{
      id: COMPOSER_SEND_ACTION,
      label: 'Send message',
      defaultKeybindings: [
        { key: KEY, strokes: ENTER.strokes },
        { key: keybindingKey('send.alt'), strokes: [{ key: 'Enter', modifiers: ['ctrl'] }] },
      ],
      run: () => {},
    }])

    // Two bindings, one command: the label is written once, spanning both.
    expect(screen.getAllByRole('button', { name: /Send message/ })).toHaveLength(2)
    const command = screen.getByText('Send message')
    // Named rows, not auto-placed ones: the headings hold the first, so the
    // first command's bindings stand on the two under it.
    expect(command.parentElement?.style.gridRow).toBe('2 / span 2')
    expect(screen.getAllByLabelText(/When clause: Send message/).map(input =>
      (input.parentElement as HTMLElement).style.gridRow)).toEqual(['2', '3'])
  })

  it('marks an overridden field apart from one still following its default', () => {
    const { bindingsStore } = mount()
    const clause = screen.getByPlaceholderText('e.g. composerFocused && !agentBusy')
    const inherited = clause.className

    act(() => { bindingsStore.set([{ ...REF, source: 'user', base: BASE, when: 'agentBusy' }]) })

    expect(screen.getByDisplayValue('agentBusy').className).not.toBe(inherited)
  })

  it('persists a prio on blur and refuses one that cannot order', () => {
    const { setBinding } = mount()
    const prio = screen.getByRole('spinbutton')

    // A number field holds this; a place in an order cannot.
    fireEvent.change(prio, { target: { value: '1.5' } })
    fireEvent.blur(prio)
    expect(setBinding).not.toHaveBeenCalled()
    expect(prio.getAttribute('aria-invalid')).toBe('true')

    fireEvent.change(prio, { target: { value: '3' } })
    fireEvent.blur(prio)
    expect(setBinding).toHaveBeenCalledWith(REF, BASE, { prio: 3 })
  })

  it('lets a prio stand empty while edited and restores it on blur', () => {
    const { setBinding } = mount()
    const prio = screen.getByRole('spinbutton')

    fireEvent.change(prio, { target: { value: '' } })
    expect((prio as HTMLInputElement).value).toBe('')

    fireEvent.blur(prio)

    // Stating nothing is an abandoned edit, not a mistake.
    expect(setBinding).not.toHaveBeenCalled()
    expect(prio.getAttribute('aria-invalid')).toBeNull()
    expect((prio as HTMLInputElement).value).toBe('0')
  })

  it('names the source, resolving a plugin to its own id', () => {
    const { bindingsStore } = mount()
    expect(screen.getByText('System')).toBeDefined()

    act(() => { bindingsStore.set([{ ...REF, source: 'user', base: BASE, strokes: [{ key: 'k', modifiers: ['ctrl'] }] }]) })
    expect(screen.getByText('User')).toBeDefined()
  })

  it('names a plugin-contributed binding by the plugin', () => {
    // No stored override can claim a plugin: the document holds only the
    // user's. A plugin-contributed default is what will carry this source.
    expect(sourceLabel(pluginId('dsh-demo'), makeTranslate(en))).toBe('dsh-demo')
  })

  it('sorts by a clicked column in the direction its kind reads naturally', () => {
    mount([
      { id: COMPOSER_SEND_ACTION, label: 'Send message', defaultKeybindings: [{ key: KEY, ...ENTER }], run: () => {} },
      { id: PREVIEW_ACTION, label: 'Preview', defaultKeybindings: [{ key: keybindingKey('preview'), strokes: [{ key: 'a', modifiers: [] }] }], run: () => {} },
    ])
    const commands = () => screen.getAllByRole('button', { name: /message|Preview/ }).map(node => node.textContent)

    fireEvent.click(screen.getByRole('button', { name: 'Keybinding' }))

    // 'a' orders before 'Enter', so the preview row leads.
    expect(commands()[0]).toContain('A')
  })

  it('reverses on a second click and drops the column on a double click', () => {
    mount()
    const header = screen.getByRole('button', { name: /^Priority/ })

    fireEvent.click(header)
    expect(screen.getByRole('button', { name: 'Priority: ascending' })).toBeDefined()

    fireEvent.click(header)
    expect(screen.getByRole('button', { name: 'Priority: descending' })).toBeDefined()

    // The clicks composing a double click toggle first; the drop discards that.
    fireEvent.doubleClick(header)
    expect(screen.getByRole('button', { name: 'Priority' })).toBeDefined()
  })

  it('numbers the columns once more than one orders the table', () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Source' }))
    expect(screen.getByRole('button', { name: 'Source: ascending' }).textContent).not.toContain('1')

    fireEvent.click(screen.getByRole('button', { name: 'When clause' }))

    expect(screen.getByRole('button', { name: 'Source: ascending' }).textContent).toContain('1')
    expect(screen.getByRole('button', { name: 'When clause: ascending' }).textContent).toContain('2')
  })

  it('moves a boundary between two columns and leaves the rest', () => {
    mount()
    const handles = screen.getAllByRole('separator')
    // One boundary per pair, so the last column has none.
    expect(handles).toHaveLength(4)

    const table = handles[0]?.parentElement
    stubDragging(table)

    fireEvent.pointerDown(handles[0]!, { clientX: 0, pointerId: 1 })
    fireEvent.pointerMove(handles[0]!, { clientX: 40, pointerId: 1 })
    fireEvent.pointerUp(handles[0]!, { pointerId: 1 })

    const tracks = weights(table)
    expect(tracks).toHaveLength(5)
    // The pair absorbs the drag: the first widens, the second gives way.
    expect(tracks[0]).toBeGreaterThan(100)
    expect(tracks[1]).toBeLessThan(100)
    expect(tracks[2]).toBe(100)
    // What one gained the other gave up, so their total is unchanged.
    expect((tracks[0] ?? 0) + (tracks[1] ?? 0)).toBeCloseTo(200)
  })

  it('ignores a drag it cannot measure', () => {
    mount()
    const handle = screen.getAllByRole('separator')[0]!

    fireEvent.pointerDown(handle, { clientX: 0, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientX: 40, pointerId: 1 })

    // Nothing is laid out here, so there is no width to take a fraction of.
    expect(handle.parentElement?.getAttribute('style')).toBeNull()
  })

  it('holds the drag cursor while a sash is held, and gives it back', () => {
    mount()
    const handles = screen.getAllByRole('separator')
    stubDragging(handles[0]?.parentElement)

    fireEvent.pointerDown(handles[0]!, { clientX: 0, pointerId: 1 })
    expect(document.body.style.cursor).toBe('col-resize')
    expect(document.body.style.userSelect).toBe('none')
    expect(handles[0]?.dataset['dragging']).toBe('true')

    fireEvent.pointerUp(handles[0]!, { pointerId: 1 })

    expect(document.body.style.cursor).toBe('')
    expect(document.body.style.userSelect).toBe('')
    expect(handles[0]?.dataset['dragging']).toBeUndefined()
  })

  it('lets go of the boundary when the pointer does', () => {
    mount()
    const handles = screen.getAllByRole('separator')
    const table = handles[0]?.parentElement
    stubDragging(table)

    fireEvent.pointerDown(handles[0]!, { clientX: 0, pointerId: 1 })
    fireEvent.pointerMove(handles[0]!, { clientX: 40, pointerId: 1 })
    const held = weights(table)

    fireEvent.pointerUp(handles[0]!, { pointerId: 1 })
    fireEvent.pointerMove(handles[0]!, { clientX: 120, pointerId: 1 })

    expect(weights(table)).toEqual(held)
  })

  it('follows the writing direction when it is reversed', () => {
    document.documentElement.dir = 'rtl'
    try {
      mount()
      const handles = screen.getAllByRole('separator')
      const table = handles[0]?.parentElement
      stubDragging(table)

      fireEvent.pointerDown(handles[0]!, { clientX: 0, pointerId: 1 })
      fireEvent.pointerMove(handles[0]!, { clientX: 40, pointerId: 1 })
      fireEvent.pointerUp(handles[0]!, { pointerId: 1 })

      // The same motion widens the other column, because the inline end moved.
      expect(weights(table)[0]).toBeLessThan(100)
    } finally {
      document.documentElement.dir = ''
    }
  })
})

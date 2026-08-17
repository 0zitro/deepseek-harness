// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { ChordMatcher } from '../src/chord.ts'
import { type KeybindingEntry, type KeyStroke } from '../src/keybinding.ts'
import { COMPOSER_SEND_ACTION, type UiActionId } from '../src/ui-action.ts'
import type { WhenContext } from '../src/when-clause.ts'
import type { UiActionDefinition } from '../src/client/action-registry.ts'
import { createKeybindingDispatcher, dispatchKeydown, effectiveEntries, resolveWhen, runMatched } from '../src/client/dispatch.ts'

function entry(strokes: KeyStroke[], action: UiActionId = COMPOSER_SEND_ACTION): KeybindingEntry {
  return { strokes, action }
}

function keydown(key: string, modifiers: KeyboardEventInit = {}): KeyboardEvent {
  return new KeyboardEvent('keydown', { key, ...modifiers })
}

describe('runMatched', () => {
  it('runs the action a matched entry references', () => {
    const run = vi.fn()
    const actions: UiActionDefinition[] = [{ id: COMPOSER_SEND_ACTION, label: 'Send', run }]
    runMatched(entry([{ key: 'Enter', modifiers: [] }]), actions)
    expect(run).toHaveBeenCalledOnce()
  })

  it('no-ops when the action is no longer registered', () => {
    runMatched(entry([{ key: 'Enter', modifiers: [] }]), [])
  })
})

describe('resolveWhen', () => {
  it('treats an absent clause as always active', () => {
    expect(resolveWhen(undefined, {})).toBe(true)
  })

  it('evaluates a clause against the context', () => {
    expect(resolveWhen('composerFocused', { composerFocused: true })).toBe(true)
    expect(resolveWhen('composerFocused', {})).toBe(false)
  })

  it('treats a malformed clause as inactive', () => {
    expect(resolveWhen('a &&', { a: true })).toBe(false)
  })
})

describe('dispatchKeydown', () => {
  it('runs the action when a single-stroke binding matches', () => {
    const run = vi.fn()
    const matcher = new ChordMatcher<KeybindingEntry>([entry([{ key: 'Enter', modifiers: [] }])], () => true)
    const actions: UiActionDefinition[] = [{ id: COMPOSER_SEND_ACTION, label: 'Send', run }]
    dispatchKeydown(matcher, actions, keydown('Enter'), false)
    expect(run).toHaveBeenCalledOnce()
  })

  it('prevents the native default when a binding matches', () => {
    const run = vi.fn()
    const matcher = new ChordMatcher<KeybindingEntry>([entry([{ key: 'Enter', modifiers: [] }])], () => true)
    const actions: UiActionDefinition[] = [{ id: COMPOSER_SEND_ACTION, label: 'Send', run }]
    const event = keydown('Enter')
    const preventDefault = vi.spyOn(event, 'preventDefault')
    dispatchKeydown(matcher, actions, event, false)
    expect(run).toHaveBeenCalledOnce()
    expect(preventDefault).toHaveBeenCalledOnce()
  })

  it('ignores modifier keydowns', () => {
    const run = vi.fn()
    const matcher = new ChordMatcher<KeybindingEntry>([entry([{ key: 'Enter', modifiers: [] }])], () => true)
    const actions: UiActionDefinition[] = [{ id: COMPOSER_SEND_ACTION, label: 'Send', run }]
    dispatchKeydown(matcher, actions, keydown('Control'), false)
    expect(run).not.toHaveBeenCalled()
  })

  it('ignores auto-repeat keydowns', () => {
    const run = vi.fn()
    const matcher = new ChordMatcher<KeybindingEntry>([entry([{ key: 'Enter', modifiers: [] }])], () => true)
    const actions: UiActionDefinition[] = [{ id: COMPOSER_SEND_ACTION, label: 'Send', run }]
    dispatchKeydown(matcher, actions, keydown('Enter', { repeat: true }), false)
    expect(run).not.toHaveBeenCalled()
  })

  it('ignores keydowns during IME composition', () => {
    const run = vi.fn()
    const matcher = new ChordMatcher<KeybindingEntry>([entry([{ key: 'Enter', modifiers: [] }])], () => true)
    const actions: UiActionDefinition[] = [{ id: COMPOSER_SEND_ACTION, label: 'Send', run }]
    dispatchKeydown(matcher, actions, keydown('Enter'), true)
    const legacy = keydown('Enter')
    Object.defineProperty(legacy, 'keyCode', { value: 229 })
    dispatchKeydown(matcher, actions, legacy, false)
    expect(run).not.toHaveBeenCalled()
  })

  it('matches a chord across successive keydowns', () => {
    const run = vi.fn()
    const matcher = new ChordMatcher<KeybindingEntry>([
      entry([{ key: 'k', modifiers: ['ctrl'] }, { key: 's', modifiers: ['ctrl'] }]),
    ], () => true)
    const actions: UiActionDefinition[] = [{ id: COMPOSER_SEND_ACTION, label: 'Send', run }]
    dispatchKeydown(matcher, actions, keydown('k', { ctrlKey: true }), false)
    expect(run).not.toHaveBeenCalled()
    dispatchKeydown(matcher, actions, keydown('s', { ctrlKey: true }), false)
    expect(run).toHaveBeenCalledOnce()
  })

  it('prevents the native default on a chord opening stroke', () => {
    const run = vi.fn()
    const matcher = new ChordMatcher<KeybindingEntry>([
      entry([{ key: 'k', modifiers: ['ctrl'] }, { key: 's', modifiers: ['ctrl'] }]),
    ], () => true)
    const actions: UiActionDefinition[] = [{ id: COMPOSER_SEND_ACTION, label: 'Send', run }]
    const event = keydown('k', { ctrlKey: true })
    const preventDefault = vi.spyOn(event, 'preventDefault')
    dispatchKeydown(matcher, actions, event, false)
    expect(run).not.toHaveBeenCalled()
    expect(preventDefault).toHaveBeenCalledOnce()
  })
})

describe('effectiveEntries', () => {
  it('prefers the persisted override over the default', () => {
    const actions: UiActionDefinition[] = [{
      id: COMPOSER_SEND_ACTION, label: 'Send', run: () => {},
      defaultKeybindings: [{ strokes: [{ key: 'Enter', modifiers: [] }] }],
    }]
    const bindings: KeybindingEntry[] = [
      { strokes: [{ key: 'k', modifiers: ['ctrl'] }], action: COMPOSER_SEND_ACTION },
    ]
    expect(effectiveEntries(actions, bindings)).toEqual(bindings)
  })

  it('falls back to the default binding when no override exists', () => {
    const actions: UiActionDefinition[] = [{
      id: COMPOSER_SEND_ACTION, label: 'Send', run: () => {},
      defaultKeybindings: [{ strokes: [{ key: 'Enter', modifiers: [] }] }],
    }]
    expect(effectiveEntries(actions, [])).toEqual([
      { strokes: [{ key: 'Enter', modifiers: [] }], action: COMPOSER_SEND_ACTION },
    ])
  })

  it('skips an action with neither an override nor a default', () => {
    const actions: UiActionDefinition[] = [{ id: COMPOSER_SEND_ACTION, label: 'Send', run: () => {} }]
    expect(effectiveEntries(actions, [])).toEqual([])
  })

  it('emits every default binding of an action in order', () => {
    const actions: UiActionDefinition[] = [{
      id: COMPOSER_SEND_ACTION, label: 'Send', run: () => {},
      defaultKeybindings: [
        { strokes: [{ key: 'Enter', modifiers: [] }] },
        { strokes: [{ key: 'k', modifiers: ['ctrl'] }] },
      ],
    }]
    expect(effectiveEntries(actions, [])).toEqual([
      { strokes: [{ key: 'Enter', modifiers: [] }], action: COMPOSER_SEND_ACTION },
      { strokes: [{ key: 'k', modifiers: ['ctrl'] }], action: COMPOSER_SEND_ACTION },
    ])
  })

  it('emits every persisted override of an action, dropping the defaults', () => {
    const actions: UiActionDefinition[] = [{
      id: COMPOSER_SEND_ACTION, label: 'Send', run: () => {},
      defaultKeybindings: [{ strokes: [{ key: 'Enter', modifiers: [] }] }],
    }]
    const bindings: KeybindingEntry[] = [
      { strokes: [{ key: 'a', modifiers: [] }], action: COMPOSER_SEND_ACTION },
      { strokes: [{ key: 'b', modifiers: [] }], action: COMPOSER_SEND_ACTION },
    ]
    expect(effectiveEntries(actions, bindings)).toEqual(bindings)
  })
})

describe('createKeybindingDispatcher', () => {
  it('dispatches a persisted binding to its action and disposes cleanly', () => {
    const bindings = createSnapshotStore<readonly KeybindingEntry[]>([])
    const actions = createSnapshotStore<readonly UiActionDefinition[]>([])
    const context = createSnapshotStore<WhenContext>({})
    const run = vi.fn()
    actions.set([{ id: COMPOSER_SEND_ACTION, label: 'Send', run }])
    const dispose = createKeybindingDispatcher(bindings, actions, context)
    bindings.set([{ strokes: [{ key: 'Enter', modifiers: [] }], action: COMPOSER_SEND_ACTION }])
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(run).toHaveBeenCalledOnce()
    dispose()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(run).toHaveBeenCalledOnce()
  })

  it('skips a binding whose when clause does not hold', () => {
    const bindings = createSnapshotStore<readonly KeybindingEntry[]>([])
    const actions = createSnapshotStore<readonly UiActionDefinition[]>([])
    const context = createSnapshotStore<WhenContext>({ composerFocused: false })
    const run = vi.fn()
    actions.set([{ id: COMPOSER_SEND_ACTION, label: 'Send', run }])
    createKeybindingDispatcher(bindings, actions, context)
    bindings.set([{ strokes: [{ key: 'Enter', modifiers: [] }], action: COMPOSER_SEND_ACTION, when: 'composerFocused' }])
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(run).not.toHaveBeenCalled()
  })

  it('dispatches a default binding when no override exists', () => {
    const bindings = createSnapshotStore<readonly KeybindingEntry[]>([])
    const actions = createSnapshotStore<readonly UiActionDefinition[]>([])
    const context = createSnapshotStore<WhenContext>({})
    const run = vi.fn()
    actions.set([{
      id: COMPOSER_SEND_ACTION, label: 'Send', run,
      defaultKeybindings: [{ strokes: [{ key: 'Enter', modifiers: [] }] }],
    }])
    createKeybindingDispatcher(bindings, actions, context)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(run).toHaveBeenCalledOnce()
  })

  it('suppresses dispatch during composition and recovers after compositionend', () => {
    vi.useFakeTimers()
    try {
      const bindings = createSnapshotStore<readonly KeybindingEntry[]>([])
      const actions = createSnapshotStore<readonly UiActionDefinition[]>([])
      const context = createSnapshotStore<WhenContext>({})
      const run = vi.fn()
      actions.set([{
        id: COMPOSER_SEND_ACTION, label: 'Send', run,
        defaultKeybindings: [{ strokes: [{ key: 'Enter', modifiers: [] }] }],
      }])
      createKeybindingDispatcher(bindings, actions, context)
      window.dispatchEvent(new Event('compositionstart'))
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
      expect(run).not.toHaveBeenCalled()
      window.dispatchEvent(new Event('compositionend'))
      window.dispatchEvent(new Event('compositionstart'))
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
      expect(run).not.toHaveBeenCalled()
      window.dispatchEvent(new Event('compositionend'))
      vi.advanceTimersByTime(10)
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
      expect(run).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  it('clears a pending composition timer on disposal', () => {
    vi.useFakeTimers()
    try {
      const bindings = createSnapshotStore<readonly KeybindingEntry[]>([])
      const actions = createSnapshotStore<readonly UiActionDefinition[]>([])
      const context = createSnapshotStore<WhenContext>({})
      const run = vi.fn()
      actions.set([{
        id: COMPOSER_SEND_ACTION, label: 'Send', run,
        defaultKeybindings: [{ strokes: [{ key: 'Enter', modifiers: [] }] }],
      }])
      const dispose = createKeybindingDispatcher(bindings, actions, context)
      window.dispatchEvent(new Event('compositionstart'))
      window.dispatchEvent(new Event('compositionend'))
      dispose()
      vi.advanceTimersByTime(10)
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
      expect(run).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})

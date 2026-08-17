// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { ChordMatcher } from '../src/chord.ts'
import {
  keybindingKey, pluginId,
  type Keybinding, type KeybindingEntry, type KeybindingOverride, type KeybindingSource,
  type KeyStroke, type SourcedOverride,
} from '../src/keybinding.ts'
import { COMPOSER_SEND_ACTION, type UiActionId } from '../src/ui-action.ts'
import type { WhenContext } from '../src/when-clause.ts'
import type { UiActionDefinition } from '../src/client/action-registry.ts'
import {
  assignOrder, createKeybindingDispatcher, dispatchKeydown, effectiveEntries,
  reconcileBases, resolveWhen, runMatched, sourceRank,
} from '../src/client/dispatch.ts'

function entry(strokes: KeyStroke[], action: UiActionId = COMPOSER_SEND_ACTION): KeybindingEntry {
  return { strokes, action, source: 'user' }
}

/** An override as the pipeline sees it: the user's document stamps every one it holds. */
function over(strokes: KeyStroke[], when?: string, source: KeybindingSource = 'user'): SourcedOverride {
  return { action: COMPOSER_SEND_ACTION, key: keybindingKey('send'), source, base: { strokes: [{ key: 'Enter', modifiers: [] }] }, strokes, ...(when === undefined ? {} : { when }) }
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
  const KEY = keybindingKey('send')
  const base = { strokes: [{ key: 'Enter', modifiers: [] }] }
  const action = (): UiActionDefinition => ({
    id: COMPOSER_SEND_ACTION, label: 'Send', run: () => {},
    defaultKeybindings: [{ key: KEY, ...base }],
  })

  it('emits the system default when no override exists', () => {
    expect(effectiveEntries([action()], [])).toEqual([
      { ...base, action: COMPOSER_SEND_ACTION, source: 'system' },
    ])
  })

  it('merges a partial override into the default', () => {
    const overrides: SourcedOverride[] = [
      { action: COMPOSER_SEND_ACTION, key: KEY, source: 'user', base, strokes: [{ key: 'k', modifiers: ['ctrl'] }] },
    ]
    expect(effectiveEntries([action()], overrides)).toEqual([
      { strokes: [{ key: 'k', modifiers: ['ctrl'] }], action: COMPOSER_SEND_ACTION, source: 'user' },
    ])
  })

  it('keeps the first of two same-source overrides for one key', () => {
    const overrides: SourcedOverride[] = [
      { action: COMPOSER_SEND_ACTION, key: KEY, source: 'user', base, strokes: [{ key: 'a', modifiers: [] }] },
      { action: COMPOSER_SEND_ACTION, key: KEY, source: 'user', base, strokes: [{ key: 'b', modifiers: [] }] },
    ]
    expect(effectiveEntries([action()], overrides)).toEqual([
      { strokes: [{ key: 'a', modifiers: [] }], action: COMPOSER_SEND_ACTION, source: 'user' },
    ])
  })

  it('merges an orphaned override into its retained base', () => {
    const overrides: SourcedOverride[] = [
      { action: COMPOSER_SEND_ACTION, key: keybindingKey('gone'), source: 'user', base, prio: 3 },
    ]
    const withOtherKey: UiActionDefinition = {
      id: COMPOSER_SEND_ACTION, label: 'Send', run: () => {},
      defaultKeybindings: [{ key: keybindingKey('other'), strokes: [{ key: 'k', modifiers: ['ctrl'] }] }],
    }
    expect(effectiveEntries([withOtherKey], overrides)).toEqual([
      { strokes: [{ key: 'k', modifiers: ['ctrl'] }], action: COMPOSER_SEND_ACTION, source: 'system' },
      { ...base, action: COMPOSER_SEND_ACTION, source: 'user', prio: 3 },
    ])
  })

  it('emits the system default with its when clause', () => {
    const withWhen: UiActionDefinition = {
      id: COMPOSER_SEND_ACTION, label: 'Send', run: () => {},
      defaultKeybindings: [{ key: KEY, strokes: base.strokes, when: 'composerActive' }],
    }
    expect(effectiveEntries([withWhen], [])).toEqual([
      { strokes: base.strokes, action: COMPOSER_SEND_ACTION, source: 'system', when: 'composerActive' },
    ])
  })

  it('reconciles an override whose key matches a different action as an orphan', () => {
    const other: UiActionDefinition = {
      id: 'other.action' as UiActionId, label: 'Other', run: () => {},
      defaultKeybindings: [{ key: KEY, strokes: [{ key: 'k', modifiers: ['ctrl'] }] }],
    }
    const overrides: SourcedOverride[] = [
      { action: COMPOSER_SEND_ACTION, key: KEY, source: 'user', base, strokes: [{ key: 'x', modifiers: [] }] },
    ]
    expect(effectiveEntries([{ id: COMPOSER_SEND_ACTION, label: 'Send', run: () => {} }, other], overrides)).toEqual([
      { strokes: [{ key: 'k', modifiers: ['ctrl'] }], action: 'other.action', source: 'system' },
      { strokes: [{ key: 'x', modifiers: [] }], action: COMPOSER_SEND_ACTION, source: 'user' },
    ])
  })

  it('skips an action with neither a default nor an override', () => {
    expect(effectiveEntries([{ id: COMPOSER_SEND_ACTION, label: 'Send', run: () => {} }], [])).toEqual([])
  })
})

describe('reconcileBases', () => {
  const KEY = keybindingKey('send')
  const SNAPSHOT: Keybinding = { strokes: [{ key: 'Enter', modifiers: [] }] }
  const stored = (base: Keybinding): KeybindingOverride =>
    ({ action: COMPOSER_SEND_ACTION, key: KEY, base, strokes: [{ key: 'k', modifiers: ['ctrl'] }] })
  const shipping = (def: Keybinding): UiActionDefinition =>
    ({ id: COMPOSER_SEND_ACTION, label: 'Send', run: () => {}, defaultKeybindings: [{ key: KEY, ...def }] })

  it('returns the same list when every base matches its default', () => {
    const overrides = [stored({ ...SNAPSHOT })]
    expect(reconcileBases(overrides, [shipping({ ...SNAPSHOT })])).toBe(overrides)
  })

  it('reuptakes a default whose gesture or clause moved', () => {
    const moved: Keybinding = { strokes: [{ key: 'Enter', modifiers: ['shift'] }], when: 'composerActive' }
    const [reconciled] = reconcileBases([stored({ ...SNAPSHOT })], [shipping(moved)])
    expect(reconciled?.base).toEqual(moved)
    // The overridden fields are untouched: only the snapshot they merge with moved.
    expect(reconciled?.strokes).toEqual([{ key: 'k', modifiers: ['ctrl'] }])
  })

  it('settles: a reconciled list reconciles to itself', () => {
    const moved: Keybinding = { strokes: [{ key: 'Enter', modifiers: ['shift'] }] }
    const once = reconcileBases([stored({ ...SNAPSHOT })], [shipping(moved)])
    expect(reconcileBases(once, [shipping({ ...moved })])).toBe(once)
  })

  it('retains the base of an override whose default is unavailable', () => {
    const overrides = [stored({ ...SNAPSHOT })]
    expect(reconcileBases(overrides, [])).toBe(overrides)
  })
})

describe('assignOrder', () => {
  const orderEntry = (strokes: KeyStroke[], prio?: number, source: KeybindingSource = 'user'): KeybindingEntry =>
    ({ strokes, action: COMPOSER_SEND_ACTION, source, ...(prio === undefined ? {} : { prio }) })

  it('seeds every collision scope from zero', () => {
    const a = orderEntry([{ key: 'a', modifiers: [] }])
    const b = orderEntry([{ key: 'b', modifiers: [] }])
    // Different gestures never compete, so neither is ordered behind the other.
    expect(assignOrder([a, b])).toEqual([
      { ...a, prio: 0 },
      { ...b, prio: 0 },
    ])
  })

  it('numbers the entries sharing one gesture and source', () => {
    const first = orderEntry([{ key: 'a', modifiers: [] }])
    const second = orderEntry([{ key: 'a', modifiers: ['ctrl'] }])
    const third = orderEntry([{ key: 'a', modifiers: [] }])
    expect(assignOrder([first, second, third]).map(entry => entry.prio)).toEqual([0, 0, 1])
  })

  it('seeds into the lowest slot a stated prio has not claimed', () => {
    const stated = orderEntry([{ key: 'a', modifiers: [] }], 2)
    const seeded = orderEntry([{ key: 'a', modifiers: [] }])
    expect(assignOrder([stated, seeded])).toEqual([
      { ...seeded, prio: 0 },
      { ...stated, prio: 2 },
    ])
  })

  it('steps over a claimed slot rather than landing on it', () => {
    const stated = orderEntry([{ key: 'a', modifiers: [] }], 0)
    const first = orderEntry([{ key: 'a', modifiers: [] }])
    const second = orderEntry([{ key: 'a', modifiers: [] }])
    // 0 is spoken for, so the two unstated entries take 1 and 2 and the scope
    // holds three distinct values.
    expect(assignOrder([stated, first, second]).map(entry => entry.prio)).toEqual([0, 1, 2])
  })

  it('orders user before system across sources regardless of prio', () => {
    const user = orderEntry([{ key: 'a', modifiers: [] }], 9, 'user')
    const sys = orderEntry([{ key: 'b', modifiers: [] }], 0, 'system')
    expect(assignOrder([sys, user])).toEqual([
      { ...user, prio: 9 },
      { ...sys, prio: 0 },
    ])
  })
})

describe('sourceRank', () => {
  it('ranks user before plugin before system', () => {
    expect(sourceRank('user')).toBe(0)
    expect(sourceRank(pluginId('acme'))).toBe(1)
    expect(sourceRank('system')).toBe(2)
  })
})

describe('createKeybindingDispatcher', () => {
  it('dispatches a persisted binding to its action and disposes cleanly', () => {
    const bindings = createSnapshotStore<readonly SourcedOverride[]>([])
    const actions = createSnapshotStore<readonly UiActionDefinition[]>([])
    const context = createSnapshotStore<WhenContext>({})
    const run = vi.fn()
    actions.set([{ id: COMPOSER_SEND_ACTION, label: 'Send', run }])
    const dispose = createKeybindingDispatcher(bindings, actions, context)
    bindings.set([over([{ key: 'Enter', modifiers: [] }])])
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(run).toHaveBeenCalledOnce()
    dispose()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(run).toHaveBeenCalledOnce()
  })

  it('skips a binding whose when clause does not hold', () => {
    const bindings = createSnapshotStore<readonly SourcedOverride[]>([])
    const actions = createSnapshotStore<readonly UiActionDefinition[]>([])
    const context = createSnapshotStore<WhenContext>({ composerFocused: false })
    const run = vi.fn()
    actions.set([{ id: COMPOSER_SEND_ACTION, label: 'Send', run }])
    createKeybindingDispatcher(bindings, actions, context)
    bindings.set([over([{ key: 'Enter', modifiers: [] }], 'composerFocused')])
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(run).not.toHaveBeenCalled()
  })

  it('dispatches a default binding when no override exists', () => {
    const bindings = createSnapshotStore<readonly SourcedOverride[]>([])
    const actions = createSnapshotStore<readonly UiActionDefinition[]>([])
    const context = createSnapshotStore<WhenContext>({})
    const run = vi.fn()
    actions.set([{
      id: COMPOSER_SEND_ACTION, label: 'Send', run,
      defaultKeybindings: [{ key: keybindingKey('send'), strokes: [{ key: 'Enter', modifiers: [] }] }],
    }])
    createKeybindingDispatcher(bindings, actions, context)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(run).toHaveBeenCalledOnce()
  })

  it('suppresses dispatch during composition and recovers after compositionend', () => {
    vi.useFakeTimers()
    try {
      const bindings = createSnapshotStore<readonly SourcedOverride[]>([])
      const actions = createSnapshotStore<readonly UiActionDefinition[]>([])
      const context = createSnapshotStore<WhenContext>({})
      const run = vi.fn()
      actions.set([{
        id: COMPOSER_SEND_ACTION, label: 'Send', run,
        defaultKeybindings: [{ key: keybindingKey('send'), strokes: [{ key: 'Enter', modifiers: [] }] }],
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
      const bindings = createSnapshotStore<readonly SourcedOverride[]>([])
      const actions = createSnapshotStore<readonly UiActionDefinition[]>([])
      const context = createSnapshotStore<WhenContext>({})
      const run = vi.fn()
      actions.set([{
        id: COMPOSER_SEND_ACTION, label: 'Send', run,
        defaultKeybindings: [{ key: keybindingKey('send'), strokes: [{ key: 'Enter', modifiers: [] }] }],
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

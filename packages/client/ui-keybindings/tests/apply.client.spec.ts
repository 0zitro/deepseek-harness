// @vitest-environment jsdom
/** Keybindings orchestrator registration: the action registry, slot injection, and the bound list. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { usePinnedBrowserLanguages } from '@deepseek-ai/dsh-client-test-runtime'
import { apply, inject } from '@deepseek-ai/dsh-client-ui-keybindings/client'
import { KeybindingsSection } from '../src/client/KeybindingsSection.tsx'
import type { KeybindingsSectionInjected } from '../src/client/KeybindingsSection.tsx'
import {
  keybindingKey,
  type Keybinding, type KeybindingOverride, type KeyStroke, type SourcedOverride,
} from '../src/keybinding.ts'
import { DEFAULT_KEYBINDING_ENTRIES, type KeybindingsSettings } from '../src/keybinding-settings.ts'
import { COMPOSER_SEND_ACTION, type UiActionId } from '../src/ui-action.ts'

usePinnedBrowserLanguages('zh-CN')

/** A second action id, used to prove other entries survive a send edit. */
const PREVIEW_ACTION = 'composer.preview' as UiActionId

/** The composer's Enter default, mirroring the stock-actions registration. */
const ENTER: Keybinding = { strokes: [{ key: 'Enter', modifiers: [] }] }

const KEY = keybindingKey('send')
const BASE: Keybinding = { strokes: [{ key: 'Enter', modifiers: [] }] }
const ovr = (strokes: KeyStroke[], when?: string, action: UiActionId = COMPOSER_SEND_ACTION): KeybindingOverride =>
  ({ action, key: KEY, base: BASE, strokes, ...(when === undefined ? {} : { when }) })

/** The same override as the store publishes it: stamped by the document it came from. */
const sourced = (...args: Parameters<typeof ovr>): SourcedOverride => ({ ...ovr(...args), source: 'user' })

/** The override the section's controls address. */
const REF = { action: COMPOSER_SEND_ACTION, key: KEY } as const

/** A default carrying a clause, as the composer's send default does. */
const WITH_WHEN: Keybinding = { strokes: [{ key: 'Enter', modifiers: [] }], when: 'composerActive' }

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  const set = vi.fn(() => Promise.resolve())
  let section: KeybindingsSettings | undefined = { bindings: DEFAULT_KEYBINDING_ENTRIES }
  const listeners: Array<() => void> = []
  const scope = {
    getSnapshot: () => ({ value: section }),
    subscribe: (cb: () => void) => { listeners.push(cb); return () => {} },
    set,
  }
  ctx.provide('settingsScope', { bind: () => scope })
  const publish = (next: KeybindingsSettings | undefined) => {
    section = next
    for (const listener of listeners) listener()
  }
  return { ctx, slots: ctx.get('slots') as SlotRegistry, set, publish }
}

function declare(slots: SlotRegistry): () => void {
  return slots.register(
    { name: 'root', children: { 'settings.section': { kind: 'list', scope: 'root' } } } as never,
    () => null,
  )
}

async function mount() {
  const b = await bench()
  declare(b.slots)
  const fiber = b.ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  const entry = b.slots.entries('settings.section')[0]!
  const injected = entry.inject as unknown as () => KeybindingsSectionInjected
  return { ...b, fiber, face: injected() }
}

describe('ui-keybindings apply', () => {
  it('declares the services it uses', () => {
    expect(inject).toEqual(['slots', 'settingsScope', 'locale'])
  })

  it('registers the keybindings nav entry with a locale-following label', async () => {
    const b = await bench()
    declare(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const entry = b.slots.entries('settings.section')[0]!
    expect(entry.component).toBe(KeybindingsSection)
    expect(entry.options).toMatchObject({ id: 'keybindings', order: 25 })
    expect(resolveSlotLabel(entry.options.label)).toBe('快捷键')
  })

  it('persists a binding through setBinding', async () => {
    const { face, set } = await mount()
    face.setBinding(REF, BASE, { strokes: [{ key: 'k', modifiers: ['ctrl'] }], when: 'agentBusy' })
    expect(set).toHaveBeenCalledWith('bindings', [ovr([{ key: 'k', modifiers: ['ctrl'] }], 'agentBusy')])
  })

  it('shows an edit only once it is stored', async () => {
    const { face, publish } = await mount()
    const strokes: KeyStroke[] = [{ key: 'k', modifiers: ['ctrl'] }]
    const edited = ovr(strokes)

    face.setBinding(REF, BASE, { strokes })
    expect(face.hooks.bindings.getSnapshot()).toEqual(DEFAULT_KEYBINDING_ENTRIES)

    publish({ bindings: [edited] })
    expect(face.hooks.bindings.getSnapshot()).toEqual([{ ...edited, source: 'user' }])
  })

  it('stores only the field the user changed', async () => {
    const { face, set } = await mount()

    face.setBinding(REF, WITH_WHEN, { strokes: [{ key: 'Enter', modifiers: ['ctrl'] }] })

    // Recording a stroke must not freeze the clause the default carries, or a
    // later change to that clause would never reach the merged binding.
    expect(set).toHaveBeenCalledWith('bindings', [{
      action: COMPOSER_SEND_ACTION,
      key: KEY,
      base: WITH_WHEN,
      strokes: [{ key: 'Enter', modifiers: ['ctrl'] }],
    }])
  })

  it('accumulates a second edit onto the stored override', async () => {
    const { face, set, publish } = await mount()
    publish({ bindings: [{ ...REF, base: WITH_WHEN, strokes: [{ key: 'Enter', modifiers: ['ctrl'] }] }] })

    face.setBinding(REF, WITH_WHEN, { when: '' })

    expect(set).toHaveBeenCalledWith('bindings', [{
      action: COMPOSER_SEND_ACTION,
      key: KEY,
      base: WITH_WHEN,
      strokes: [{ key: 'Enter', modifiers: ['ctrl'] }],
      when: '',
    }])
  })

  it('adopts a durable binding change pushed from the settings scope', async () => {
    const { face, publish } = await mount()
    publish({ bindings: [ovr([{ key: 'j', modifiers: ['meta'] }], 'agentBusy')] })
    expect(face.hooks.bindings.getSnapshot()).toEqual([sourced([{ key: 'j', modifiers: ['meta'] }], 'agentBusy')])
  })

  it('does not persist an unchanged binding', async () => {
    const { face, set, publish } = await mount()
    publish({ bindings: [ovr(ENTER.strokes)] })
    face.setBinding(REF, BASE, { strokes: [{ key: 'Enter', modifiers: [] }] })
    expect(set).not.toHaveBeenCalled()
  })

  it('writes a field the stored override does not carry yet', async () => {
    const { face, set, publish } = await mount()
    publish({ bindings: [{ ...REF, base: WITH_WHEN, when: 'agentBusy' }] })

    face.setBinding(REF, WITH_WHEN, { strokes: [{ key: 'Enter', modifiers: ['ctrl'] }] })

    expect(set).toHaveBeenCalledWith('bindings', [
      { ...REF, base: WITH_WHEN, when: 'agentBusy', strokes: [{ key: 'Enter', modifiers: ['ctrl'] }] },
    ])
  })

  it('does not persist a prio or clause the override already carries', async () => {
    const { face, set, publish } = await mount()
    publish({ bindings: [{ ...REF, base: WITH_WHEN, when: 'agentBusy', prio: 2 }] })

    face.setBinding(REF, WITH_WHEN, { prio: 2 })
    face.setBinding(REF, WITH_WHEN, { when: 'agentBusy' })
    expect(set).not.toHaveBeenCalled()

    face.setBinding(REF, WITH_WHEN, { prio: 0 })
    expect(set).toHaveBeenCalledWith('bindings', [{ ...REF, base: WITH_WHEN, when: 'agentBusy', prio: 0 }])
  })

  it('reuptakes a moved default into the stored base, once', async () => {
    const { ctx, set, publish } = await mount()
    publish({ bindings: [{ ...REF, base: WITH_WHEN, strokes: [{ key: 'k', modifiers: ['ctrl'] }] }] })

    const moved: Keybinding = { strokes: [{ key: 'Enter', modifiers: ['shift'] }], when: 'composerActive' }
    ctx.uiActions.register({
      id: COMPOSER_SEND_ACTION,
      label: 'Send',
      defaultKeybindings: [{ key: KEY, ...moved }],
      run: () => {},
    })

    expect(set).toHaveBeenCalledWith('bindings', [
      { ...REF, base: moved, strokes: [{ key: 'k', modifiers: ['ctrl'] }] },
    ])

    // Storing the reconciled list republishes it; the second pass finds nothing to do.
    set.mockClear()
    publish({ bindings: [{ ...REF, base: moved, strokes: [{ key: 'k', modifiers: ['ctrl'] }] }] })
    expect(set).not.toHaveBeenCalled()
  })

  it('leaves the base of an override whose default is unavailable', async () => {
    const { set, publish } = await mount()

    publish({ bindings: [{ ...REF, base: WITH_WHEN, strokes: [{ key: 'k', modifiers: ['ctrl'] }] }] })

    expect(set).not.toHaveBeenCalled()
  })

  it('reconciles nothing while the stored list is unavailable', async () => {
    const { set, publish } = await mount()
    publish({ bindings: [{ ...REF, base: WITH_WHEN, strokes: [{ key: 'k', modifiers: ['ctrl'] }] }] })

    publish(undefined)

    expect(set).not.toHaveBeenCalled()
  })

  it('stops reconciling once the fiber is disposed', async () => {
    const { ctx, fiber, set, publish } = await mount()
    ctx.uiActions.register({
      id: COMPOSER_SEND_ACTION,
      label: 'Send',
      defaultKeybindings: [{ key: KEY, strokes: [{ key: 'Enter', modifiers: ['shift'] }] }],
      run: () => {},
    })
    const drifted: KeybindingsSettings = {
      bindings: [{ ...REF, base: WITH_WHEN, strokes: [{ key: 'k', modifiers: ['ctrl'] }] }],
    }

    publish(drifted)
    expect(set).toHaveBeenCalledOnce()

    set.mockClear()
    await fiber.dispose()
    publish(drifted)

    expect(set).not.toHaveBeenCalled()
  })

  it('places a stated prio and moves the scope back one', async () => {
    const { ctx, face, set, publish } = await mount()
    const other = 'composer.other' as UiActionId
    for (const id of [COMPOSER_SEND_ACTION, other]) {
      ctx.uiActions.register({ id, label: id, defaultKeybindings: [{ key: KEY, ...ENTER }], run: () => {} })
    }
    publish({ bindings: [
      { ...REF, base: BASE, prio: 0 },
      { action: other, key: KEY, base: BASE, prio: 1 },
    ] })

    face.setBinding(REF, BASE, { prio: 1 })

    // Both bindings hold Enter, so placing one at 1 moves the other to 2.
    expect(set).toHaveBeenCalledWith('bindings', [
      { ...REF, base: BASE, prio: 1 },
      { action: other, key: KEY, base: BASE, prio: 2 },
    ])
  })

  it('keeps an override that states nothing once its prio retires', async () => {
    const { ctx, face, set, publish } = await mount()
    const gone = 'composer.gone' as UiActionId
    ctx.uiActions.register({ id: COMPOSER_SEND_ACTION, label: 'Send', defaultKeybindings: [{ key: KEY, ...ENTER }], run: () => {} })
    publish({ bindings: [
      { ...REF, base: BASE, prio: 2 },
      { action: gone, key: KEY, base: BASE, prio: 1 },
    ] })

    face.setBinding(REF, BASE, { prio: 1 })

    // The unregistered command cannot use a place, so it gives the priority
    // up — but not the seat: an override stating no field at all still makes
    // the binding the user's, which is a rank and a scope of its own.
    expect(set).toHaveBeenCalledWith('bindings', [
      { ...REF, base: BASE, prio: 1 },
      { action: gone, key: KEY, base: BASE },
    ])
  })

  it('keeps an override that still states something after its prio retires', async () => {
    const { ctx, face, set, publish } = await mount()
    const gone = 'composer.gone' as UiActionId
    ctx.uiActions.register({ id: COMPOSER_SEND_ACTION, label: 'Send', defaultKeybindings: [{ key: KEY, ...ENTER }], run: () => {} })
    publish({ bindings: [
      { ...REF, base: BASE, prio: 2 },
      { action: gone, key: KEY, base: BASE, when: 'agentBusy', prio: 1 },
    ] })

    face.setBinding(REF, BASE, { prio: 1 })

    // Its clause is still the user's; only the place it cannot use goes.
    expect(set).toHaveBeenCalledWith('bindings', [
      { ...REF, base: BASE, prio: 1 },
      { action: gone, key: KEY, base: BASE, when: 'agentBusy' },
    ])
  })

  it('refuses a write with no stored list to derive from', async () => {
    const { ctx, face, set, publish } = await mount()
    const error = vi.spyOn(ctx.logger, 'error').mockImplementation(() => {})
    publish(undefined)

    face.setBinding(REF, BASE, { strokes: [{ key: 'k', modifiers: ['ctrl'] }] })

    // Writing the whole list off an unread one would drop every override it never saw.
    expect(set).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalledOnce()
  })

  it('preserves entries for other actions while editing the send action', async () => {
    const { face, set, publish } = await mount()
    publish({ bindings: [
      ovr([{ key: 'Enter', modifiers: [] }]),
      ovr([{ key: 'p', modifiers: ['ctrl'] }], undefined, PREVIEW_ACTION),
    ] })
    face.setBinding(REF, BASE, { strokes: [{ key: 'k', modifiers: ['ctrl'] }] })
    expect(set).toHaveBeenCalledWith('bindings', [
      ovr([{ key: 'k', modifiers: ['ctrl'] }]),
      ovr([{ key: 'p', modifiers: ['ctrl'] }], undefined, PREVIEW_ACTION),
    ])
  })
})

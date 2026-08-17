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
import { keybindingKey, type Keybinding, type KeybindingOverride, type KeyStroke } from '../src/keybinding.ts'
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
  ({ action, source: 'user', key: KEY, base: BASE, strokes, ...(when === undefined ? {} : { when }) })

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
  await b.ctx.plugin({ inject: [...inject], apply }).await()
  const entry = b.slots.entries('settings.section')[0]!
  const injected = entry.inject as unknown as () => KeybindingsSectionInjected
  return { ...b, face: injected() }
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
    face.setBinding(ovr([{ key: 'k', modifiers: ['ctrl'] }], 'agentBusy'))
    expect(set).toHaveBeenCalledWith('bindings', [ovr([{ key: 'k', modifiers: ['ctrl'] }], 'agentBusy')])
  })

  it('shows an edit only once it is stored', async () => {
    const { face, publish } = await mount()
    const edited = ovr([{ key: 'k', modifiers: ['ctrl'] }])

    face.setBinding(edited)
    expect(face.hooks.bindings.getSnapshot()).toEqual(DEFAULT_KEYBINDING_ENTRIES)

    publish({ bindings: [edited] })
    expect(face.hooks.bindings.getSnapshot()).toEqual([edited])
  })

  it('adopts a durable binding change pushed from the settings scope', async () => {
    const { face, publish } = await mount()
    publish({ bindings: [ovr([{ key: 'j', modifiers: ['meta'] }], 'agentBusy')] })
    expect(face.hooks.bindings.getSnapshot()).toEqual([ovr([{ key: 'j', modifiers: ['meta'] }], 'agentBusy')])
  })

  it('does not persist an unchanged binding', async () => {
    const { face, set, publish } = await mount()
    publish({ bindings: [ovr(ENTER.strokes)] })
    face.setBinding(ovr(ENTER.strokes))
    expect(set).not.toHaveBeenCalled()
  })

  it('refuses a write with no stored list to derive from', async () => {
    const { ctx, face, set, publish } = await mount()
    const error = vi.spyOn(ctx.logger, 'error').mockImplementation(() => {})
    publish(undefined)

    face.setBinding(ovr([{ key: 'k', modifiers: ['ctrl'] }]))

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
    face.setBinding(ovr([{ key: 'k', modifiers: ['ctrl'] }]))
    expect(set).toHaveBeenCalledWith('bindings', [
      ovr([{ key: 'k', modifiers: ['ctrl'] }]),
      ovr([{ key: 'p', modifiers: ['ctrl'] }], undefined, PREVIEW_ACTION),
    ])
  })
})

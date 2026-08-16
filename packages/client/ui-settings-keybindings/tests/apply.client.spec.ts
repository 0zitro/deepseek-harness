/** Keybindings section registration: slot injection, locale-following label, and the bound send-message face. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { usePinnedBrowserLanguages } from '@deepseek-ai/dsh-client-test-runtime'
import { apply, inject } from '@deepseek-ai/dsh-client-ui-settings-keybindings/client'
import { KeybindingsSection } from '../src/client/KeybindingsSection.tsx'
import type { KeybindingsSectionInjected } from '../src/client/KeybindingsSection.tsx'
import { DEFAULT_SEND_KEYBINDING } from '../src/keybinding.ts'
import { DEFAULT_KEYBINDING_ENTRIES, type KeybindingsSettings } from '../src/keybinding-settings.ts'
import { COMPOSER_SEND_ACTION, type UiActionId } from '../src/ui-action.ts'

usePinnedBrowserLanguages('zh-CN')

/** A second action id, used to prove other entries survive a send edit. */
const PREVIEW_ACTION = 'composer.preview' as UiActionId

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

describe('ui-settings-keybindings apply', () => {
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

  it('adopts the durable binding and persists through setSendMessage', async () => {
    const { face, set } = await mount()
    expect(face.hooks.sendMessage.getSnapshot()).toEqual(DEFAULT_SEND_KEYBINDING)
    face.setSendMessage({ strokes: [{ key: 'k', modifiers: ['ctrl'] }], when: 'agentBusy' })
    expect(face.hooks.sendMessage.getSnapshot()).toEqual({ strokes: [{ key: 'k', modifiers: ['ctrl'] }], when: 'agentBusy' })
    expect(set).toHaveBeenCalledWith('bindings', [{
      strokes: [{ key: 'k', modifiers: ['ctrl'] }],
      action: COMPOSER_SEND_ACTION,
      when: 'agentBusy',
    }])
  })

  it('adopts a durable binding change pushed from the settings scope', async () => {
    const { face, publish } = await mount()
    publish({ bindings: [{ strokes: [{ key: 'j', modifiers: ['meta'] }], action: COMPOSER_SEND_ACTION, when: 'agentBusy' }] })
    expect(face.hooks.sendMessage.getSnapshot()).toEqual({ strokes: [{ key: 'j', modifiers: ['meta'] }], when: 'agentBusy' })
  })

  it('does not persist an unchanged binding', async () => {
    const { face, set } = await mount()
    face.setSendMessage(DEFAULT_SEND_KEYBINDING)
    expect(set).not.toHaveBeenCalled()
  })

  it('keeps the fallback when the send entry is absent', async () => {
    const { face, publish } = await mount()
    publish({ bindings: [] })
    expect(face.hooks.sendMessage.getSnapshot()).toEqual(DEFAULT_SEND_KEYBINDING)
  })

  it('persists against the default list when the document is not yet loaded', async () => {
    const { face, set, publish } = await mount()
    publish(undefined)
    face.setSendMessage({ strokes: [{ key: 'k', modifiers: ['ctrl'] }] })
    expect(set).toHaveBeenCalledWith('bindings', [{
      strokes: [{ key: 'k', modifiers: ['ctrl'] }],
      action: COMPOSER_SEND_ACTION,
    }])
  })

  it('preserves entries for other actions while editing the send action', async () => {
    const { face, set, publish } = await mount()
    publish({ bindings: [
      { strokes: [{ key: 'Enter', modifiers: [] }], action: COMPOSER_SEND_ACTION },
      { strokes: [{ key: 'p', modifiers: ['ctrl'] }], action: PREVIEW_ACTION },
    ] })
    face.setSendMessage({ strokes: [{ key: 'k', modifiers: ['ctrl'] }] })
    expect(set).toHaveBeenCalledWith('bindings', [
      { strokes: [{ key: 'k', modifiers: ['ctrl'] }], action: COMPOSER_SEND_ACTION },
      { strokes: [{ key: 'p', modifiers: ['ctrl'] }], action: PREVIEW_ACTION },
    ])
  })
})

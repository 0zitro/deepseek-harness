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
import { DEFAULT_SEND_KEYBINDING, type Keybinding } from '../src/keybinding.ts'

usePinnedBrowserLanguages('zh-CN')

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  const set = vi.fn(() => Promise.resolve())
  let section: { sendMessage: Keybinding } = { sendMessage: DEFAULT_SEND_KEYBINDING }
  const listeners: Array<() => void> = []
  const scope = {
    getSnapshot: () => ({ value: section }),
    subscribe: (cb: () => void) => { listeners.push(cb); return () => {} },
    set,
  }
  ctx.provide('settingsScope', { bind: () => scope })
  const mutateSection = (next: { sendMessage: Keybinding }) => {
    section = next
    for (const listener of listeners) listener()
  }
  return { ctx, slots: ctx.get('slots') as SlotRegistry, set, mutateSection }
}

function declare(slots: SlotRegistry): () => void {
  return slots.register(
    { name: 'root', children: { 'settings.section': { kind: 'list', scope: 'root' } } } as never,
    () => null,
  )
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
    const b = await bench()
    declare(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const entry = b.slots.entries('settings.section')[0]!
    const injected = entry.inject as unknown as () => KeybindingsSectionInjected
    const face = injected()
    expect(face.hooks.sendMessage.getSnapshot()).toEqual(DEFAULT_SEND_KEYBINDING)
    face.setSendMessage({ strokes: [{ key: 'k', modifiers: ['ctrl'] }] })
    expect(face.hooks.sendMessage.getSnapshot()).toEqual({ strokes: [{ key: 'k', modifiers: ['ctrl'] }] })
    expect(b.set).toHaveBeenCalledWith('sendMessage', { strokes: [{ key: 'k', modifiers: ['ctrl'] }] })
  })

  it('adopts a durable binding change pushed from the settings scope', async () => {
    const b = await bench()
    declare(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const entry = b.slots.entries('settings.section')[0]!
    const injected = entry.inject as unknown as () => KeybindingsSectionInjected
    const face = injected()
    b.mutateSection({ sendMessage: { strokes: [{ key: 'j', modifiers: ['meta'] }] } })
    expect(face.hooks.sendMessage.getSnapshot()).toEqual({ strokes: [{ key: 'j', modifiers: ['meta'] }] })
  })

  it('does not persist an unchanged binding', async () => {
    const b = await bench()
    declare(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const entry = b.slots.entries('settings.section')[0]!
    const injected = entry.inject as unknown as () => KeybindingsSectionInjected
    const face = injected()
    face.setSendMessage(DEFAULT_SEND_KEYBINDING)
    expect(b.set).not.toHaveBeenCalled()
  })
})

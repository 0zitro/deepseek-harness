// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { usePinnedBrowserLanguages } from '@deepseek-ai/dsh-client-test-runtime'
import type { UiActionDefinition } from '@zitro/dsh-oot-ui-actions/client'
import { apply, inject } from '../src/client/index.ts'

usePinnedBrowserLanguages('zh-CN')

async function mount() {
  const ctx = new Context()
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  const register = vi.fn((_definition: UiActionDefinition) => () => {})
  ctx.provide('uiActions', { register })
  const overlays = { closeTop: vi.fn() }
  ctx.provide('overlays', overlays)
  const composer = {
    send: vi.fn(), queue: vi.fn(), steer: vi.fn(), undo: vi.fn(), redo: vi.fn(),
    dismissPopup: vi.fn(), arbitrate: vi.fn(),
  }
  ctx.provide('composer', composer)
  await ctx.plugin({ inject: [...inject], apply }).await()
  return { register, overlays, composer }
}

describe('ui-stock-actions apply', () => {
  it('declares the services it uses', () => {
    expect(inject).toEqual(['uiActions', 'locale', 'overlays', 'composer'])
  })

  it('registers send with its default binding', async () => {
    const { register } = await mount()
    expect(register).toHaveBeenCalledWith(expect.objectContaining({
      id: 'composer.send',
      label: '发送消息',
      defaultKeybindings: [{ key: 'composer.send', strokes: [{ key: 'Enter', modifiers: [] }], when: 'composerActive && !commandMenuOpen' }],
    }))
  })

  it('registers undo and redo with default chords', async () => {
    const { register } = await mount()
    expect(register).toHaveBeenCalledWith(expect.objectContaining({
      id: 'composer.undo',
      label: '撤销',
      defaultKeybindings: [{ key: 'composer.undo', strokes: [{ key: 'z', modifiers: ['ctrl'] }], when: 'composerActive' }],
    }))
    expect(register).toHaveBeenCalledWith(expect.objectContaining({
      id: 'composer.redo',
      label: '重做',
      defaultKeybindings: [{ key: 'composer.redo', strokes: [{ key: 'z', modifiers: ['ctrl', 'shift'] }], when: 'composerActive' }],
    }))
  })

  it('registers queue and steer unbound', async () => {
    const { register } = await mount()
    expect(register).toHaveBeenCalledWith(expect.objectContaining({ id: 'composer.queue', label: '排队发送' }))
    expect(register).toHaveBeenCalledWith(expect.objectContaining({ id: 'composer.steer', label: '转向发送' }))
  })

  it('registers overlay close with Escape', async () => {
    const { register } = await mount()
    expect(register).toHaveBeenCalledWith(expect.objectContaining({
      id: 'overlay.close',
      label: '关闭浮层',
      defaultKeybindings: [{ key: 'overlay.close', strokes: [{ key: 'Escape', modifiers: [] }], when: 'overlayOpen' }],
    }))
  })

  it('registers the command palette gestures gated on commandMenuOpen', async () => {
    const { register } = await mount()
    expect(register).toHaveBeenCalledWith(expect.objectContaining({
      id: 'commandPalette.select',
      defaultKeybindings: [{ key: 'commandPalette.select', strokes: [{ key: 'Enter', modifiers: [] }], when: 'commandMenuOpen' }],
    }))
  })

  it('routes each action to its composer verb', async () => {
    const { register, composer, overlays } = await mount()
    const definitions = register.mock.calls.map(call => call[0])
    const runOf = (id: string) => definitions.find(def => def.id === id)?.run
    runOf('composer.send')?.()
    runOf('composer.queue')?.()
    runOf('composer.steer')?.()
    runOf('composer.undo')?.()
    runOf('composer.redo')?.()
    runOf('composer.dismissPopup')?.()
    runOf('commandPalette.focusNext')?.()
    runOf('commandPalette.focusPrevious')?.()
    runOf('commandPalette.select')?.()
    runOf('overlay.close')?.()
    expect(composer.send).toHaveBeenCalledOnce()
    expect(composer.queue).toHaveBeenCalledOnce()
    expect(composer.steer).toHaveBeenCalledOnce()
    expect(composer.undo).toHaveBeenCalledOnce()
    expect(composer.redo).toHaveBeenCalledOnce()
    expect(composer.dismissPopup).toHaveBeenCalledOnce()
    expect(composer.arbitrate).toHaveBeenNthCalledWith(1, 'down')
    expect(composer.arbitrate).toHaveBeenNthCalledWith(2, 'up')
    expect(composer.arbitrate).toHaveBeenNthCalledWith(3, 'enter')
    expect(overlays.closeTop).toHaveBeenCalledOnce()
  })
})

import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { usePinnedBrowserLanguages } from '@deepseek-ai/dsh-client-test-runtime'
import type { UiActionDefinition } from '@deepseek-ai/dsh-client-ui-keybindings/client'
import { apply, inject } from '@deepseek-ai/dsh-client-ui-stock-actions/client'

usePinnedBrowserLanguages('zh-CN')

async function mount() {
  const ctx = new Context()
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  const register = vi.fn((_definition: UiActionDefinition) => () => {})
  ctx.provide('uiActions', { register })
  const composer = { send: vi.fn(), queue: vi.fn(), steer: vi.fn(), undo: vi.fn(), redo: vi.fn() }
  ctx.provide('composer', composer)
  const overlays = { closeTop: vi.fn() }
  ctx.provide('overlays', overlays)
  await ctx.plugin({ inject: [...inject], apply }).await()
  return { register, composer, overlays }
}

describe('ui-stock-actions apply', () => {
  it('declares the services it uses', () => {
    expect(inject).toEqual(['uiActions', 'locale', 'composer', 'overlays'])
  })

  it('registers send with its default binding', async () => {
    const { register } = await mount()
    expect(register).toHaveBeenCalledWith(expect.objectContaining({
      id: 'composer.send',
      label: '发送消息',
      description: '提交输入框的按键组合。',
      defaultKeybinding: { strokes: [{ key: 'Enter', modifiers: [] }], when: 'composerActive && !commandMenuOpen' },
    }))
  })

  it('registers undo and redo with default chords', async () => {
    const { register } = await mount()
    expect(register).toHaveBeenCalledWith(expect.objectContaining({
      id: 'composer.undo',
      label: '撤销',
      defaultKeybinding: { strokes: [{ key: 'z', modifiers: ['ctrl'] }], when: 'composerActive' },
    }))
    expect(register).toHaveBeenCalledWith(expect.objectContaining({
      id: 'composer.redo',
      label: '重做',
      defaultKeybinding: { strokes: [{ key: 'z', modifiers: ['ctrl', 'shift'] }], when: 'composerActive' },
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
      defaultKeybinding: { strokes: [{ key: 'Escape', modifiers: [] }], when: 'overlayOpen' },
    }))
  })

  it('routes each action to its composer method', async () => {
    const { register, composer, overlays } = await mount()
    const definitions = register.mock.calls.map(call => call[0])
    const runOf = (id: string) => definitions.find(def => def.id === id)?.run
    runOf('composer.send')?.()
    runOf('composer.queue')?.()
    runOf('composer.steer')?.()
    runOf('composer.undo')?.()
    runOf('composer.redo')?.()
    runOf('overlay.close')?.()
    expect(composer.send).toHaveBeenCalledOnce()
    expect(composer.queue).toHaveBeenCalledOnce()
    expect(composer.steer).toHaveBeenCalledOnce()
    expect(composer.undo).toHaveBeenCalledOnce()
    expect(composer.redo).toHaveBeenCalledOnce()
    expect(overlays.closeTop).toHaveBeenCalledOnce()
  })
})

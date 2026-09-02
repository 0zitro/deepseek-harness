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
  await ctx.plugin({ inject: [...inject], apply }).await()
  return { register, overlays }
}

describe('ui-stock-actions apply', () => {
  it('declares the services it uses', () => {
    expect(inject).toEqual(['uiActions', 'locale', 'overlays'])
  })

  it('registers overlay close with Escape', async () => {
    const { register } = await mount()
    expect(register).toHaveBeenCalledWith(expect.objectContaining({
      id: 'overlay.close',
      label: '关闭浮层',
      defaultKeybindings: [{ key: 'overlay.close', strokes: [{ key: 'Escape', modifiers: [] }], when: 'overlayOpen' }],
    }))
  })

  it('routes overlay close to the manager', async () => {
    const { register, overlays } = await mount()
    const definitions = register.mock.calls.map(call => call[0])
    definitions.find(def => def.id === 'overlay.close')?.run()
    expect(overlays.closeTop).toHaveBeenCalledOnce()
  })
})

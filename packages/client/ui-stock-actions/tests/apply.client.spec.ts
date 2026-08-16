import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { usePinnedBrowserLanguages } from '@deepseek-ai/dsh-client-test-runtime'
import { apply, inject } from '@deepseek-ai/dsh-client-ui-stock-actions/client'

usePinnedBrowserLanguages('zh-CN')

describe('ui-stock-actions apply', () => {
  it('declares the services it uses', () => {
    expect(inject).toEqual(['uiActions', 'locale'])
  })

  it('registers the composer send action with its default', async () => {
    const ctx = new Context()
    const locale = new LocaleRuntime(ctx)
    ctx.provide('locale', locale)
    const register = vi.fn(() => () => {})
    ctx.provide('uiActions', { register })
    await ctx.plugin({ inject: [...inject], apply }).await()
    expect(register).toHaveBeenCalledWith({
      id: 'composer.send',
      label: '发送消息',
      description: '提交输入框的按键组合。',
      defaultKeybinding: { strokes: [{ key: 'Enter', modifiers: [] }] },
    })
  })
})

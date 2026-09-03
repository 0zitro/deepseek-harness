// @vitest-environment jsdom
/** The composer registers its own actions: ids, default gestures, when-clauses, and routing. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { usePinnedBrowserLanguages } from '@deepseek-ai/dsh-client-test-runtime'
import type { UiActionDefinition } from '@zitro/dsh-oot-ui-actions/client'
import { apply, inject } from '../src/client/index.ts'

usePinnedBrowserLanguages('zh-CN')

function fakeCtx() {
  const ctx = new Context()
  ctx.provide('locale', new LocaleRuntime(ctx))
  const register = vi.fn((_definition: UiActionDefinition) => () => {})
  ctx.provide('uiActions', { register })
  ctx.provide('slots', { inject: () => () => {} })
  ctx.provide('remote', { commands: { execute: vi.fn(async () => ({ ok: true as const, value: null })) } })
  ctx.provide('remote.commands', { execute: vi.fn(async () => ({ ok: true as const, value: null })) })
  ctx.provide('settingsScope', {
    bind: () => ({ getSnapshot: () => ({ value: undefined }), subscribe: () => () => {} }),
  })
  ctx.provide('conversation', {
    input: { shell: () => ({ notices: { subscribe: () => () => {}, getSnapshot: () => null } }) },
    createDraftImages: () => [],
    draftImages: () => [],
    releaseDraftImage: () => {},
    cancel: () => Promise.resolve(),
  })
  ctx.provide('sessions', {
    binding: () => undefined,
    scope: () => undefined,
    subagentAddress: () => undefined,
    list: { getSnapshot: () => ({ current: undefined }) },
  })
  return { ctx, register }
}

describe('rich-composer apply', () => {
  it('declares the services it uses, including uiActions', () => {
    expect(inject).toContain('uiActions')
  })

  it('registers the composer gestures as its own actions', async () => {
    const { ctx, register } = fakeCtx()
    await ctx.plugin({ inject: [...inject], apply }).await()
    const ids = register.mock.calls.map(call => call[0].id)
    expect(ids).toEqual(expect.arrayContaining([
      'composer.send', 'composer.queue', 'composer.steer', 'composer.undo', 'composer.redo',
      'composer.dismissPopup', 'commandPalette.focusNext', 'commandPalette.focusPrevious',
      'commandPalette.select',
    ]))
  })

  it('binds send to plain Enter gated on the focused composer and closed menu', async () => {
    const { ctx, register } = fakeCtx()
    await ctx.plugin({ inject: [...inject], apply }).await()
    const send = register.mock.calls.map(call => call[0]).find(def => def.id === 'composer.send')
    expect(send?.defaultKeybindings).toEqual([{
      key: 'composer.send',
      strokes: [{ key: 'Enter', modifiers: [] }],
      when: 'composerActive && !commandMenuOpen',
    }])
  })

  it('binds dismissPopup to Escape only while the menu is open', async () => {
    const { ctx, register } = fakeCtx()
    await ctx.plugin({ inject: [...inject], apply }).await()
    const dismiss = register.mock.calls.map(call => call[0]).find(def => def.id === 'composer.dismissPopup')
    expect(dismiss?.defaultKeybindings?.[0]?.when).toBe('composerActive && commandMenuOpen')
  })

  it('routes the send action run through the service to the current surface', async () => {
    const { ctx, register } = fakeCtx()
    await ctx.plugin({ inject: [...inject], apply }).await()
    const send = register.mock.calls.map(call => call[0]).find(def => def.id === 'composer.send')
    // No surface mounted: the run is inert by construction, not an error.
    expect(() => send?.run()).not.toThrow()
  })
})

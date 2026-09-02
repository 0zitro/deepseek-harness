import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { apply, inject } from '@deepseek-ai/dsh-client-ui-overlay/client'

describe('ui-overlay apply', () => {
  it('requires nothing, publishing into keybindings rather than using them', () => {
    expect(inject).toEqual([])
  })

  it('mounts the overlay manager', async () => {
    const ctx = new Context()
    ctx.provide('uiWhenContext', { set: vi.fn(() => () => {}) })
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await expect(fiber.await()).resolves.toBeDefined()
  })

  it('mounts where nothing provides the when-context', async () => {
    // The composition an overlay may legitimately appear in: overlays and no
    // keybindings. A declared injection would have suspended this forever.
    const fiber = new Context().plugin({ inject: [...inject], apply })
    await expect(fiber.await()).resolves.toBeDefined()
  })
})

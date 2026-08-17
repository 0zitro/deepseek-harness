import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { apply, inject } from '@deepseek-ai/dsh-client-ui-overlay/client'

describe('ui-overlay apply', () => {
  it('declares the services it uses', () => {
    expect(inject).toEqual(['uiWhenContext'])
  })

  it('mounts the overlay manager', async () => {
    const ctx = new Context()
    ctx.provide('uiWhenContext', { set: vi.fn(() => () => {}) })
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await expect(fiber.await()).resolves.toBeDefined()
  })
})

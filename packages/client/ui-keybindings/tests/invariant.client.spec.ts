import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import * as KeybindingsInvariant from '@deepseek-ai/dsh-client-ui-keybindings/invariant'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import { apply } from '../src/index.ts'

describe('invariant companion', () => {
  it('registers under the package name with an empty installer', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    await expect(ctx.plugin(KeybindingsInvariant).await()).resolves.toBeDefined()
  })
})

describe('host apply', () => {
  it('registers the ui-keybindings settings namespace', () => {
    const register = vi.fn()
    const ctx = {
      inject: (_deps: string[], callback: (settingsCtx: unknown) => void) => {
        callback({ settings: { register } })
      },
    }
    apply(ctx as never)
    expect(register).toHaveBeenCalledTimes(1)
    expect(register.mock.calls[0]?.[1]).toBeDefined()
  })
})

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import * as StockActionsInvariant from '@deepseek-ai/dsh-client-ui-stock-actions/invariant'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import { apply } from '../src/index.ts'

describe('invariant companion', () => {
  it('registers under the package name with an empty installer', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    await expect(ctx.plugin(StockActionsInvariant).await()).resolves.toBeDefined()
  })
})

describe('host apply', () => {
  it('is a no-op', () => {
    expect(() => { apply() }).not.toThrow()
  })
})

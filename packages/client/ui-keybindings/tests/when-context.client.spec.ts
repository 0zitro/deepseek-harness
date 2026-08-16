import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { UiWhenContext } from '../src/client/when-context.ts'

describe('UiWhenContext', () => {
  it('starts empty and is updated in place', () => {
    const context = new UiWhenContext(new Context())
    expect(context.context.getSnapshot()).toEqual({})
    context.context.update((map) => { map.composerFocused = true })
    expect(context.context.getSnapshot()).toEqual({ composerFocused: true })
  })
})

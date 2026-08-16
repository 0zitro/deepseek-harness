// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import type { ISessions } from '@deepseek-ai/dsh-client-runtime/client'
import type { InputSubmitMode } from '../src/client/contract/composer-submission.ts'
import { ComposerSubmission } from '../src/client/input/composer-submission.ts'
import type { SessionInputShell } from '../src/client/input/facade.ts'
import type { InputHub } from '../src/client/input/hub.ts'
import type { ComposerSubmissionPolicy } from '../src/client/input/submission-policy.ts'

function mount(summary: { running: boolean; origin?: 'subagent' } | undefined) {
  const submit = vi.fn()
  const shell = { submit } as unknown as SessionInputShell
  const inputHub = { shell: vi.fn(() => shell) } as unknown as InputHub
  const resolve = vi.fn((_running: boolean, _gesture: string, _steering: boolean): InputSubmitMode => 'queue')
  const policy = { resolve } as unknown as ComposerSubmissionPolicy
  const sessions = {
    list: {
      getSnapshot: () => ({
        current: summary === undefined ? undefined : 's1',
        byId: summary === undefined ? {} : { s1: summary },
      }),
    },
  } as unknown as ISessions
  const service = new ComposerSubmission(new Context(), { inputHub, policy, sessions })
  return { submit, resolve, service }
}

describe('ComposerSubmission', () => {
  it('send resolves the mode via the preference', () => {
    const { submit, resolve, service } = mount({ running: false })
    service.send()
    expect(resolve).toHaveBeenCalledWith(false, 'enter', true)
    expect(submit).toHaveBeenCalledWith('queue')
  })

  it('send flags a subagent session as not steerable', () => {
    const { resolve, service } = mount({ running: true, origin: 'subagent' })
    service.send()
    expect(resolve).toHaveBeenCalledWith(true, 'enter', false)
  })

  it('queue and steer submit raw modes', () => {
    const { submit, resolve, service } = mount({ running: false })
    service.queue()
    service.steer()
    expect(submit).toHaveBeenNthCalledWith(1, 'queue')
    expect(submit).toHaveBeenNthCalledWith(2, 'steer')
    expect(resolve).not.toHaveBeenCalled()
  })

  it('no-ops without a current session', () => {
    const { submit, service } = mount(undefined)
    service.send()
    service.queue()
    expect(submit).not.toHaveBeenCalled()
  })
})

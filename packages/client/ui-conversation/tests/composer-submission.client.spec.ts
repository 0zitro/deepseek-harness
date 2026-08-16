// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import type { ISessions } from '@deepseek-ai/dsh-client-runtime/client'
import type { InputSubmitMode } from '../src/client/contract/composer-submission.ts'
import { ComposerSubmission } from '../src/client/input/composer-submission.ts'
import type { SessionInputShell } from '../src/client/input/facade.ts'
import type { InputHub } from '../src/client/input/hub.ts'
import type { ComposerSubmissionPolicy } from '../src/client/input/submission-policy.ts'

function mount(
  summary: { running: boolean; origin?: 'subagent' } | undefined,
  over: { draft?: string; queue?: readonly { placement: 'queued' | 'steering' }[] } = {},
) {
  const submit = vi.fn()
  const steerQueue = vi.fn()
  const shell = {
    submit,
    steerQueue,
    state: { getSnapshot: () => ({ draft: over.draft ?? 'hello', queue: over.queue ?? [] }) },
  } as unknown as SessionInputShell
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
  return { submit, steerQueue, resolve, service }
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

  it('steers the whole queue on an empty draft', () => {
    const { submit, steerQueue, service } = mount({ running: true }, { draft: '', queue: [{ placement: 'queued' }] })
    service.steer()
    expect(steerQueue).toHaveBeenCalledOnce()
    expect(submit).not.toHaveBeenCalled()
  })

  it('steer submits the draft for a subagent session', () => {
    const { submit, steerQueue, service } = mount(
      { running: true, origin: 'subagent' },
      { draft: '', queue: [{ placement: 'queued' }] },
    )
    service.steer()
    expect(steerQueue).not.toHaveBeenCalled()
    expect(submit).toHaveBeenCalledWith('steer')
  })

  it('no-ops without a current session', () => {
    const { submit, service } = mount(undefined)
    service.send()
    service.queue()
    service.steer()
    expect(submit).not.toHaveBeenCalled()
  })
})

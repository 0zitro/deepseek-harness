/** The busy-Enter delivery rule, restated out-of-tree against the stock preference. */

import { describe, expect, it } from 'vitest'
import { resolveMode } from '../src/client/policy.ts'

describe('resolveMode', () => {
  it('queues outside steer-capable busy state', () => {
    expect(resolveMode('steer', false, 'enter', true)).toBe('queue')
    expect(resolveMode('steer', true, 'enter', false)).toBe('queue')
  })

  it('follows the preference on plain Enter while busy', () => {
    expect(resolveMode('queue', true, 'enter', true)).toBe('queue')
    expect(resolveMode('steer', true, 'enter', true)).toBe('steer')
  })

  it('takes the preference\'s opposite on the accelerated chord', () => {
    expect(resolveMode('queue', true, 'accelerated', true)).toBe('steer')
    expect(resolveMode('steer', true, 'accelerated', true)).toBe('queue')
  })
})

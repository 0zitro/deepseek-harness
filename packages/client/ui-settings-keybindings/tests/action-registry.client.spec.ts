import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { UiActionRegistry } from '../src/client/action-registry.ts'
import { COMPOSER_SEND_ACTION, type UiActionId } from '../src/ui-action.ts'

const PREVIEW_ACTION = 'composer.preview' as UiActionId

describe('UiActionRegistry', () => {
  it('publishes registered actions in registration order', () => {
    const registry = new UiActionRegistry(new Context())
    registry.register({ id: COMPOSER_SEND_ACTION, label: 'Send', run: () => {} })
    registry.register({ id: PREVIEW_ACTION, label: 'Preview', run: () => {} })
    expect(registry.actions.getSnapshot()).toMatchObject([
      { id: COMPOSER_SEND_ACTION, label: 'Send' },
      { id: PREVIEW_ACTION, label: 'Preview' },
    ])
  })

  it('removes an action through the returned disposer', () => {
    const registry = new UiActionRegistry(new Context())
    const dispose = registry.register({ id: COMPOSER_SEND_ACTION, label: 'Send', run: () => {} })
    dispose()
    expect(registry.actions.getSnapshot()).toEqual([])
  })
})

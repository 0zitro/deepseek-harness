import { describe, expect, it } from 'vitest'
import {
  DEFAULT_KEYBINDING_ENTRIES, KEYBINDINGS_SETTINGS_NAMESPACE, KeybindingsSettingsSchema,
} from '../src/keybinding-settings.ts'
import { COMPOSER_SEND_ACTION } from '../src/ui-action.ts'

describe('keybinding settings', () => {
  it('uses the ui-keybindings namespace', () => {
    expect(KEYBINDINGS_SETTINGS_NAMESPACE).toBe('ui-keybindings')
  })

  it('defaults the list to empty', () => {
    expect(DEFAULT_KEYBINDING_ENTRIES).toEqual([])
  })

  it('accepts a list of entries with a when clause', () => {
    expect(KeybindingsSettingsSchema({
      bindings: [{
        strokes: [{ key: 'k', modifiers: ['ctrl'] }, { key: 's', modifiers: ['ctrl'] }],
        action: COMPOSER_SEND_ACTION, source: 'user',
        when: 'agentBusy',
      }],
    })).toEqual({
      bindings: [{
        strokes: [{ key: 'k', modifiers: ['ctrl'] }, { key: 's', modifiers: ['ctrl'] }],
        action: COMPOSER_SEND_ACTION, source: 'user',
        when: 'agentBusy',
      }],
    })
  })
})

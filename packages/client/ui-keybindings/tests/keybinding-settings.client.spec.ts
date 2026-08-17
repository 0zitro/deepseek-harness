import { describe, expect, it } from 'vitest'
import {
  DEFAULT_KEYBINDING_ENTRIES, KEYBINDINGS_SETTINGS_NAMESPACE, KeybindingsSettingsSchema,
} from '../src/keybinding-settings.ts'
import { keybindingKey, type KeybindingOverride } from '../src/keybinding.ts'
import { COMPOSER_SEND_ACTION } from '../src/ui-action.ts'

describe('keybinding settings', () => {
  it('uses the ui-keybindings namespace', () => {
    expect(KEYBINDINGS_SETTINGS_NAMESPACE).toBe('ui-keybindings')
  })

  it('defaults the list to empty', () => {
    expect(DEFAULT_KEYBINDING_ENTRIES).toEqual([])
  })

  it('accepts a list of overrides with a when clause', () => {
    const entry: KeybindingOverride = {
      action: COMPOSER_SEND_ACTION,
      key: keybindingKey('send'),
      base: { strokes: [{ key: 'k', modifiers: ['ctrl'] }, { key: 's', modifiers: ['ctrl'] }] },
      strokes: [{ key: 'k', modifiers: ['ctrl'] }, { key: 's', modifiers: ['ctrl'] }],
      when: 'agentBusy',
    }
    expect(KeybindingsSettingsSchema({ bindings: [entry] })).toEqual({ bindings: [entry] })
  })
})

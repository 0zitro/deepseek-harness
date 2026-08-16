import { describe, expect, it } from 'vitest'
import { KEYBINDINGS_SETTINGS_NAMESPACE, KeybindingsSettingsSchema } from '../src/keybinding-settings.ts'

describe('keybinding settings', () => {
  it('uses the ui-keybindings namespace', () => {
    expect(KEYBINDINGS_SETTINGS_NAMESPACE).toBe('ui-keybindings')
  })

  it('accepts a chord with a when clause', () => {
    expect(KeybindingsSettingsSchema({
      sendMessage: {
        strokes: [{ key: 'k', modifiers: ['ctrl'] }, { key: 's', modifiers: ['ctrl'] }],
        when: 'agentBusy',
      },
    })).toEqual({
      sendMessage: {
        strokes: [{ key: 'k', modifiers: ['ctrl'] }, { key: 's', modifiers: ['ctrl'] }],
        when: 'agentBusy',
      },
    })
  })
})

import { describe, expect, it } from 'vitest'
import { KEYBINDINGS_SETTINGS_NAMESPACE, KeybindingsSettingsSchema } from '../src/keybinding-settings.ts'

describe('keybinding settings', () => {
  it('uses the ui-keybindings namespace', () => {
    expect(KEYBINDINGS_SETTINGS_NAMESPACE).toBe('ui-keybindings')
  })

  it('accepts a custom binding', () => {
    expect(KeybindingsSettingsSchema({ sendMessage: { key: 'k', modifiers: ['ctrl', 'shift'] } }))
      .toEqual({ sendMessage: { key: 'k', modifiers: ['ctrl', 'shift'] } })
  })
})

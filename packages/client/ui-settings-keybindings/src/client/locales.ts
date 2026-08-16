/** Keybindings settings copy. */

export const NS = 'keybindings'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  title: '快捷键',
  'sendMessage.label': '发送消息',
  'sendMessage.description': '提交输入框的快捷键。',
} satisfies Record<string, string>

export type KeybindingsKey = keyof typeof zh

export const en = {
  title: 'Keybindings',
  'sendMessage.label': 'Send message',
  'sendMessage.description': 'Keyboard shortcut that submits the composer.',
} satisfies Record<KeybindingsKey, string>

/** Keybindings settings copy. */

export const NS = 'keybindings'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  title: '快捷键',
  'sendMessage.label': '发送消息',
  'sendMessage.description': '提交输入框的按键组合。',
  'when.label': '激活条件',
  'when.description': '可选的 VSCode 风格 when 子句，例如 agentBusy。',
  'when.placeholder': '例如 composerFocused && !agentBusy',
  'recorder.done': '完成',
} satisfies Record<string, string>

export type KeybindingsKey = keyof typeof zh

export const en = {
  title: 'Keybindings',
  'sendMessage.label': 'Send message',
  'sendMessage.description': 'Keyboard chord that submits the composer.',
  'when.label': 'When clause',
  'when.description': 'Optional VSCode-style when clause, for example agentBusy.',
  'when.placeholder': 'e.g. composerFocused && !agentBusy',
  'recorder.done': 'Done',
} satisfies Record<KeybindingsKey, string>

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Keybindings settings copy. */
    keybindings: KeybindingsKey
  }
}

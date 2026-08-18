/** Keybindings settings copy. */

export const NS = 'keybindings'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  title: '快捷键',
  'column.command': '命令',
  'column.stroke': '按键',
  'column.when': '激活条件',
  'column.prio': '优先级',
  'column.source': '来源',
  'when.placeholder': '例如 composerFocused && !agentBusy',
  'column.resize': '调整列宽',
  'sort.ascending': '升序',
  'sort.descending': '降序',
  'recorder.done': '完成',
  'recorder.clear': '清除快捷键',
  'binding.add': '添加快捷键',
  'source.system': '系统',
  'source.user': '用户',
} satisfies Record<string, string>

export type KeybindingsKey = keyof typeof zh

export const en = {
  title: 'Keybindings',
  'column.command': 'Command',
  'column.stroke': 'Keybinding',
  'column.when': 'When clause',
  'column.prio': 'Priority',
  'column.source': 'Source',
  'when.placeholder': 'e.g. composerFocused && !agentBusy',
  'column.resize': 'resize column',
  'sort.ascending': 'ascending',
  'sort.descending': 'descending',
  'recorder.done': 'Done',
  'recorder.clear': 'Clear the keybinding',
  'binding.add': 'Add a keybinding',
  'source.system': 'System',
  'source.user': 'User',
} satisfies Record<KeybindingsKey, string>

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Keybindings settings copy. */
    keybindings: KeybindingsKey
  }
}

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
  // 数值而非次序：0 最优先，所以调大数值反而让绑定排得更靠后。
  'prio.increment': '增大优先级数值',
  'prio.decrement': '减小优先级数值',
  'column.resize': '调整列宽',
  'sort.ascending': '升序',
  'sort.descending': '降序',
  'recorder.done': '完成',
  'recorder.clear': '清除快捷键',
  'binding.add': '添加快捷键',
  'binding.remove': '删除快捷键',
  'source.system': '系统',
  'source.user': '用户',
} satisfies Record<string, string>

/** Every copy key the Keybindings section holds. */
export type KeybindingsKey = keyof typeof zh

/** English dictionary, complete against the key-set source of truth. */
export const en = {
  title: 'Keybindings',
  'column.command': 'Command',
  'column.stroke': 'Keybinding',
  'column.when': 'When clause',
  'column.prio': 'Priority',
  'column.source': 'Source',
  'when.placeholder': 'e.g. composerFocused && !agentBusy',
  // The value, not the rank: 0 is highest, so raising the value orders a
  // binding later. A label promising higher priority would be backwards.
  'prio.increment': 'Increase the priority value',
  'prio.decrement': 'Decrease the priority value',
  'column.resize': 'resize column',
  'sort.ascending': 'ascending',
  'sort.descending': 'descending',
  'recorder.done': 'Done',
  'recorder.clear': 'Clear the keybinding',
  'binding.add': 'Add a keybinding',
  'binding.remove': 'Remove the keybinding',
  'source.system': 'System',
  'source.user': 'User',
} satisfies Record<KeybindingsKey, string>

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Keybindings settings copy. */
    keybindings: KeybindingsKey
  }
}

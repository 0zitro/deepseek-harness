/** Built-in UI actions copy. */

export const NS = 'stock-actions'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'composerSend.label': '发送消息',
  'composerSend.description': '提交输入框的按键组合。',
} satisfies Record<string, string>

export type StockActionsKey = keyof typeof zh

export const en = {
  'composerSend.label': 'Send message',
  'composerSend.description': 'Keyboard chord that submits the composer.',
} satisfies Record<StockActionsKey, string>

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'stock-actions': StockActionsKey
  }
}

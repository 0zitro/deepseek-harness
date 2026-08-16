/** Built-in UI actions copy. */

export const NS = 'stock-actions'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'composerSend.label': '发送消息',
  'composerSend.description': '提交输入框的按键组合。',
  'composerQueue.label': '排队发送',
  'composerQueue.description': '始终排队发送，忽略忙碌时的发送偏好。',
  'composerSteer.label': '转向发送',
  'composerSteer.description': '始终转向发送，忽略忙碌时的发送偏好。',
} satisfies Record<string, string>

export type StockActionsKey = keyof typeof zh

export const en = {
  'composerSend.label': 'Send message',
  'composerSend.description': 'Keyboard chord that submits the composer.',
  'composerQueue.label': 'Queue send',
  'composerQueue.description': 'Always send in queue mode, ignoring the busy preference.',
  'composerSteer.label': 'Steer send',
  'composerSteer.description': 'Always send in steer mode, ignoring the busy preference.',
} satisfies Record<StockActionsKey, string>

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'stock-actions': StockActionsKey
  }
}

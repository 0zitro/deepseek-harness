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
  'composerUndo.label': '撤销',
  'composerUndo.description': '撤销输入框的上一步编辑。',
  'composerRedo.label': '重做',
  'composerRedo.description': '重做输入框最近撤销的编辑。',
  'overlayClose.label': '关闭浮层',
  'overlayClose.description': '关闭最上层的浮层（菜单、对话框、弹窗等）。',
} satisfies Record<string, string>

export type StockActionsKey = keyof typeof zh

export const en = {
  'composerSend.label': 'Send message',
  'composerSend.description': 'Keyboard chord that submits the composer.',
  'composerQueue.label': 'Queue send',
  'composerQueue.description': 'Always send in queue mode, ignoring the busy preference.',
  'composerSteer.label': 'Steer send',
  'composerSteer.description': 'Always send in steer mode, ignoring the busy preference.',
  'composerUndo.label': 'Undo',
  'composerUndo.description': 'Undo the last composer edit.',
  'composerRedo.label': 'Redo',
  'composerRedo.description': 'Redo the last undone composer edit.',
  'overlayClose.label': 'Close overlay',
  'overlayClose.description': 'Close the topmost overlay (menu, dialog, popover).',
} satisfies Record<StockActionsKey, string>

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'stock-actions': StockActionsKey
  }
}

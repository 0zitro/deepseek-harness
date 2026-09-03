/** Built-in UI actions copy. */

export const NS = 'stock-actions'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'overlayClose.label': '关闭浮层',
  'overlayClose.description': '关闭最上层的浮层（菜单、对话框、弹窗等）。',
} satisfies Record<string, string>

/** Every copy key the stock actions register themselves with. */
export type StockActionsKey = keyof typeof zh

/** English dictionary, complete against the key-set source of truth. */
export const en = {
  'overlayClose.label': 'Close overlay',
  'overlayClose.description': 'Close the topmost overlay (menu, dialog, popover).',
} satisfies Record<StockActionsKey, string>

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'stock-actions': StockActionsKey
  }
}

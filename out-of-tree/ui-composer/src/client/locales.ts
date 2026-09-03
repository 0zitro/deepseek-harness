/** Rich composer chrome copy. */

export const NS = 'rich-composer'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'placeholder': '输入消息，Markdown 与 $数学$ 实时渲染…',
  'send': '发送',
  'stop': '停止',
  'imageUnsupported': '不支持的图片类型。',
  'imageTooMany': '图片数量超出上限（最多 {count} 张）。',
  'imageTooLarge': '图片过大（最大 {size}）。',
} satisfies Record<string, string>

/** Every copy key the rich composer registers. */
export type RichComposerKey = keyof typeof zh

/** English dictionary, complete against the key-set source of truth. */
export const en = {
  'placeholder': 'Type a message — Markdown and $math$ render live…',
  'send': 'Send',
  'stop': 'Stop',
  'imageUnsupported': 'Unsupported image type.',
  'imageTooMany': 'Too many images (at most {count}).',
  'imageTooLarge': 'Image too large (max {size}).',
} satisfies Record<RichComposerKey, string>

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'rich-composer': RichComposerKey
  }
}

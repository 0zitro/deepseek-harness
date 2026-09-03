/** The browser-suite page entry: attaches the editor to the harness editable. */
import { attach } from '../../src/client/editor/attach.ts'
import { heldText } from '../../src/client/editor/text.ts'
import { selectionOffsets } from '../../src/client/editor/selection.ts'

const el = document.querySelector<HTMLDivElement>('#composer')
if (el !== null) {
  attach(window, { el, onEdit: () => {} })
  el.focus()
}

declare global {
  interface Window {
    __ccxState(): string
    __ccxText(): string
    __ccxSel(): unknown
    __ccxFocus(): void
    __ccxSeed(text: string): void
    __ccxBox(selector: string): { x: number; y: number; width: number; height: number } | null
  }
}

window.__ccxText = () => heldText(el ?? document.body)
window.__ccxSel = () => el === null ? null : selectionOffsets(window, el)
window.__ccxFocus = () => { el?.focus() }
window.__ccxSeed = (text) => {
  if (el === null) return
  el.textContent = text
  el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))
}

/** The browser-suite page entry: mounts the CodeMirror surface into the harness host. */
import { createRichSurface, type RichSurface } from '../../src/client/editor/cm/surface.ts'

declare global {
  interface Window {
    __ccxState(): string
    __ccxFocus(): void
    __ccxSeed(text: string): void
    __ccxBox(selector: string): { x: number; y: number; width: number; height: number } | null
  }
}

const el = document.querySelector<HTMLDivElement>('#composer')
if (el !== null) {
  const surface = createRichSurface({
    host: el,
    doc: '',
    placeholderText: '',
    ariaLabel: 'composer',
    onEdit: () => {},
    onCaret: () => {},
    onFiles: () => {},
    // The keybinding dispatcher is absent in this standalone harness; the
    // editor's native keymap (undo/redo chords included) owns everything.
    onKey: () => false,
  })
  surface.focus()
  ;(window as unknown as { __ccxControl?: RichSurface }).__ccxControl = surface
}

const surface = (): RichSurface | undefined =>
  (window as unknown as { __ccxControl?: RichSurface }).__ccxControl

window.__ccxState = () => JSON.stringify({
  text: surface()?.held() ?? '',
  head: surface()?.view.state.selection.main.head ?? 0,
})
window.__ccxFocus = () => { surface()?.focus() }
window.__ccxSeed = (text) => { surface()?.adopt(text) }

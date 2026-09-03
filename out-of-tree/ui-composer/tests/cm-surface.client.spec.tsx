// @vitest-environment jsdom
/**
 * The CodeMirror surface over a plain host: document changes push out as the
 * single writer's text, adoptions replace the buffer in one transaction, the
 * claimed keys never reach CodeMirror's handlers, and files arrive by paste.
 * Layout, real keys, and pointer math live in the CDP browser suite.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRichSurface, type RichSurface, type RichSurfaceOptions } from '../src/client/editor/cm/surface.ts'

vi.stubGlobal('ResizeObserver', class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
})

// jsdom's Range lacks layout geometry; CodeMirror's measure pass reads it in
// a rAF callback that would otherwise surface as an unhandled rejection.
Range.prototype.getClientRects = function getClientRects(): DOMRectList {
  return [] as unknown as DOMRectList
}

/** Everything the callbacks saw, in order. */
interface Ledger {
  edits: string[]
  cares: Array<[string, number]>
  files: Array<readonly File[]>
  keys: string[]
  claims: Array<boolean>
}

afterEach(() => { document.body.innerHTML = '' })

function mount(options: { doc?: string; claim?: (event: KeyboardEvent) => boolean } = {}): {
  host: HTMLDivElement
  surface: RichSurface
  calls: Ledger
} {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const calls: Ledger = { edits: [], cares: [], files: [], keys: [], claims: [] }
  const opts: RichSurfaceOptions = {
    host,
    doc: options.doc ?? '',
    placeholderText: 'Say something',
    ariaLabel: 'composer',
    onEdit: (text) => { calls.edits.push(text) },
    onCaret: (text, head) => { calls.cares.push([text, head]) },
    onFiles: (files) => { calls.files.push(files) },
    onKey: (event) => {
      calls.keys.push(event.key)
      const claimed = options.claim?.(event) ?? false
      calls.claims.push(claimed)
      return claimed
    },
  }
  return { host, surface: createRichSurface(opts), calls }
}

describe('the CodeMirror surface', () => {
  it('mounts the editor into the host and shows the placeholder while empty', () => {
    const { host, surface } = mount()
    expect(host.querySelector('.cm-editor')).not.toBeNull()
    expect(host.querySelector('.cm-placeholder')?.textContent).toBe('Say something')
    surface.adopt('x')
    expect(host.querySelector('.cm-placeholder')).toBeNull()
  })

  it('feeds the caret once at mount with the document and its head', () => {
    const { calls } = mount({ doc: 'seed' })
    expect(calls.cares[0]).toEqual(['seed', 4])
    expect(calls.edits).toEqual([])
  })

  it('pushes every document change out as the single writer\'s text', () => {
    const { surface, calls } = mount()
    surface.view.dispatch({ changes: { from: 0, insert: 'hello' } })
    expect(calls.edits).toEqual(['hello'])
    expect(surface.held()).toBe('hello')
  })

  it('adopts a text it did not type in one transaction, caret to the end', () => {
    const { surface, calls } = mount({ doc: 'old' })
    surface.adopt('recalled')
    expect(surface.held()).toBe('recalled')
    expect(surface.view.state.selection.main.head).toBe(8)
    expect(calls.edits).toEqual(['recalled'])
    // Adopting the text already held is a no-op: no echo edit, no caret move.
    surface.view.dispatch({ selection: { anchor: 3 } })
    surface.adopt('recalled')
    expect(calls.edits).toEqual(['recalled'])
    expect(surface.view.state.selection.main.head).toBe(3)
  })

  it('walks the history: one undo per group, redo restores it', () => {
    const { surface } = mount()
    surface.view.dispatch({ changes: { from: 0, insert: 'hello world' } })
    surface.undo()
    expect(surface.held()).toBe('')
    surface.redo()
    expect(surface.held()).toBe('hello world')
  })

  it('claims a keydown before CodeMirror\'s handlers and the editor ignores it', () => {
    const { host } = mount({ claim: (event) => event.key === 'Enter' && (event.ctrlKey || event.metaKey) })
    const content = host.querySelector('.cm-content') as HTMLElement
    const claimed = new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true })
    content.dispatchEvent(claimed)
    expect(claimed.defaultPrevented).toBe(true)
    expect(host.querySelectorAll('.cm-line')).toHaveLength(1)
    // Unclaimed, the same key is CodeMirror's: a plain Enter breaks the line.
    content.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    expect(host.querySelectorAll('.cm-line')).toHaveLength(2)
  })

  it('takes files from a paste and never lets them into the buffer', () => {
    const { host, calls, surface } = mount()
    const content = host.querySelector('.cm-content') as HTMLElement
    const file = new File(['x'], 'x.png', { type: 'image/png' })
    const paste = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(paste, 'clipboardData', { value: { files: [file] } })
    content.dispatchEvent(paste)
    expect(calls.files).toEqual([[file]])
    expect(surface.held()).toBe('')
  })

  it('tears the editor out of the host on dispose', () => {
    const { host, surface } = mount()
    surface.dispose()
    expect(host.querySelector('.cm-editor')).toBeNull()
  })
})

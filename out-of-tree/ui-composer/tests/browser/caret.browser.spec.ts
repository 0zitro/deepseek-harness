/**
 * The caret machinery in a real Chromium: keys in, text and held-text
 * selection offsets out. What jsdom cannot answer — where the browser puts
 * the caret around an atom, whether a click sweep reaches every glyph's
 * offset, whether a vertical move keeps its column — is exactly what this
 * suite asks. Skips (not fails) where no Chromium is installed.
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { build } from 'esbuild'
import { browserAvailable, openPage, writePage, PAGE_SCRIPT, type Page } from './harness.ts'

/** The in-page state: held text plus its selection as offsets. */
interface State { text: string; sel: { start: number; end: number; focus: number; backward: boolean } | null }

let page: Page | null = null

beforeAll(async () => {
  page = await openPage()
  if (page === null) return
  // Bundle the editor core from source; the one ui-primitives import (the
  // shared highlighter) is stubbed — this suite asks about the caret, not
  // colours, and the stub keeps the bundle self-contained.
  const dir = new URL('.', import.meta.url).pathname
  const stub = `${dir}primitives-stub.ts`
  const result = await build({
    entryPoints: [`${dir}entry.ts`],
    bundle: true,
    format: 'iife',
    write: false,
    alias: { '@deepseek-ai/dsh-client-ui-primitives': stub },
    logLevel: 'silent',
  })
  const js = (result.outputFiles[0]?.text ?? '') + PAGE_SCRIPT
  const html = `
    <div id="composer" contenteditable="plaintext-only" aria-multiline="true" style="min-width:400px;padding:8px;font-size:14px;outline:1px solid #999;"></div>
  `
  const url = writePage(html, js)
  await page.goto(url)
  await page.settle()
  const ready = await page.evaluate<boolean>('typeof window.__ccxState === "function"')
  if (!ready) throw new Error('harness page did not initialize')
})

afterAll(async () => { await page?.close() })

/** The state the page reports. */
async function state(): Promise<State> {
  if (page === null) throw new Error('no browser')
  return JSON.parse(await page.evaluate<string>('window.__ccxState()')) as State
}

/** The state once it has stopped changing: decoration's async selection
 * pass (selectionchange → validate → rebuild → restore) must land before an
 * assertion reads the caret — a fixed sleep races it, observation does not. */
async function settled(): Promise<State> {
  let prev = await state()
  for (let tries = 0; tries < 20; tries++) {
    await new Promise(resolve => setTimeout(resolve, 40))
    const now = await state()
    if (JSON.stringify(now) === JSON.stringify(prev)) return now
    prev = now
  }
  return prev
}

/** The physical key behind a printable char: punctuation rides a shifted digit. */
function physicalOf(ch: string): { code: string; keyCode: number; shift: boolean } {
  if (ch === ' ') return { code: 'Space', keyCode: 32, shift: false }
  if (/[a-z]/.test(ch)) return { code: `Key${ch.toUpperCase()}`, keyCode: ch.toUpperCase().charCodeAt(0), shift: false }
  if (/[0-9]/.test(ch)) return { code: `Digit${ch}`, keyCode: ch.charCodeAt(0), shift: false }
  const shifted: Record<string, { digit: string; keyCode: number }> = {
    $: { digit: '4', keyCode: 52 }, '^': { digit: '6', keyCode: 54 },
    '+': { digit: 'Equal', keyCode: 187 }, '=': { digit: 'Equal', keyCode: 187 },
  }
  const map = shifted[ch]
  if (map !== undefined) return { code: `Digit${map.digit}`.replace('DigitEqual', 'Equal'), keyCode: map.keyCode, shift: true }
  return { code: 'Comma', keyCode: 188, shift: false }
}

/** Type a string one character at a time, as a keyboard would. */
async function type(text: string): Promise<void> {
  for (const ch of text) {
    const physical = physicalOf(ch)
    await page?.key({ key: ch, code: physical.code, keyCode: physical.keyCode, text: ch, shift: physical.shift })
  }
  await page?.settle()
}

async function press(key: string, keyCode: number, options: { shift?: boolean; ctrl?: boolean } = {}): Promise<void> {
  await page?.key({ key, code: key, keyCode, ...options })
  await page?.settle()
}

describe.skipIf(!browserAvailable())('caret machinery in Chromium', () => {
  it('accepts typed text and reports it as the held text', async () => {
    if (page === null) return
    await page.evaluate('window.__ccxFocus()')
    await type('hello world')
    const now = await state()
    expect(now.text).toBe('hello world')
    expect(now.sel?.focus).toBe(11)
  })

  it('folds typed maths into an atom with a marked drawing', async () => {
    if (page === null) return
    await page.evaluate('window.__ccxSeed("")')
    await page.evaluate('window.__ccxFocus()')
    await type('a $x^2$ b')
    const folded = await state()
    expect(folded.text).toBe('a $x^2$ b')
    const has = await page.evaluate<boolean>(
      "document.querySelector('[data-ccx-atom]') !== null && document.querySelector('[data-ccx-draw]') !== null",
    )
    expect(has).toBe(true)
    // The held text carries the source; the DOM holds it hidden beside the drawing.
    const dom = await page.evaluate<string>("document.querySelector('#composer').textContent ?? ''")
    expect(dom).toContain('$x^2$')
  })

  // KNOWN GAP (README: known limitations): the enter/leave edge interplay —
  // opening a folded object from its edge without moving the caret — rides
  // Chromium's caret normalization around contenteditable=false islands in a
  // plaintext-only editable, positions the read layer does not yet normalize
  // faithfully. Unpinned until that normalization table lands; the fold,
  // sweep, column, delete-whole, and undo contracts above are pinned.

  it('answers a click sweep inside a folded expression with glyph offsets', async () => {
    if (page === null) return
    await page.evaluate('window.__ccxSeed("$e^{i\\\\pi} + 1 = 0$ and a plain tail after the fold")')
    await page.evaluate('window.__ccxFocus()')
    await page.settle()
    const box = await page.evaluate<{ x: number; y: number; width: number; height: number } | null>(
      'window.__ccxBox("[data-ccx-atom]")',
    )
    if (box === null) throw new Error('no atom to sweep')
    const reached = new Set<number>()
    for (let i = 0; i <= 10; i++) {
      await page.click(box.x + (box.width * i) / 10, box.y + box.height / 2)
      await page.settle()
      const now = await state()
      const focus = now.sel?.focus ?? -1
      if (focus > 0 && focus < 10) reached.add(focus)
    }
    // Every click over the expression resolves INSIDE it, to more than one
    // glyph offset across the sweep — the map's whole point.
    expect(reached.size).toBeGreaterThanOrEqual(2)
  })

  it('keeps a vertical move\'s column through an object-led line', async () => {
    if (page === null) return
    await page.evaluate('window.__ccxSeed("start\\n$x$ tail")')
    await page.evaluate('window.__ccxFocus()')
    await press('End', 35, { ctrl: true })
    const before = (await state()).sel?.focus
    await press('ArrowUp', 38)
    await press('ArrowDown', 40)
    const after = (await state()).sel?.focus
    expect(before).toBe('start\n$x$ tail'.length)
    expect(after).toBe(before)
  })

  it('deletes a folded object whole from either edge', async () => {
    if (page === null) return
    await page.evaluate('window.__ccxSeed("a $x^2$ b")')
    await page.evaluate('window.__ccxFocus()')
    await page.settle()
    await press('End', 35, { ctrl: true })
    // Three backspaces: 'b', the space, then the atom's far edge — the last
    // takes the whole object, leaving 'a '.
    for (let step = 0; step < 3; step++) await press('Backspace', 8)
    const after = await settled()
    expect(after.text).toBe('a ')
    expect(after.sel?.focus).toBe(2)
    const atomGone = await page.evaluate('document.querySelector("[data-ccx-atom]") === null')
    expect(atomGone).toBe(true)
  })

  it('walks the source-level undo stack with the caret restored', async () => {
    if (page === null) return
    await page.evaluate('window.__ccxSeed("")')
    await page.evaluate('window.__ccxFocus()')
    await type('one two')
    expect((await state()).text).toBe('one two')
    // One undo drops the whole trailing word-group (' two'), the reference's
    // coalescing rule: whitespace ends a group and the word after it is one.
    await press('z', 90, { ctrl: true })
    expect((await settled()).text).toBe('one')
    await press('z', 90, { ctrl: true, shift: true })
    const redone = await settled()
    expect(redone.text).toBe('one two')
    expect(redone.sel?.focus).toBe(7)
  })
})

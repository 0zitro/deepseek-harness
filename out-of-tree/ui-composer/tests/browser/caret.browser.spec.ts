/**
 * The editing surface in a real Chromium: real keys in, document text and
 * caret head out. What jsdom cannot answer — whether the browser's own line
 * breaks survive, whether a fold is atomic to the keys, whether a click sweep
 * reaches glyph offsets — is exactly what this suite asks, pinned as
 * regressions for the glitches the decorate-in-place core shipped with.
 * Skips (not fails) where no Chromium is installed.
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import { browserAvailable, openPage, writePage, PAGE_SCRIPT, type Page } from './harness.ts'

/** The in-page state: document text plus the caret head. */
interface State { text: string; head: number }

let page: Page | null = null

beforeAll(async () => {
  page = await openPage()
  if (page === null) return
  // Bundle the surface from source; the one ui-primitives import (the shared
  // highlighter) is stubbed — this suite asks about the caret, not colours,
  // and the stub keeps the bundle self-contained.
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
  // KaTeX's own stylesheet, so the drawings lay out as they do in the app —
  // without it the script stacks collapse onto one band and a two-dimensional
  // layout never exists to read.
  const katexCss = createRequire(import.meta.url).resolve('katex/dist/katex.min.css')
  const html = `
    <link rel="stylesheet" href="file://${katexCss}">
    <div id="composer" style="min-width:400px;padding:8px;font-size:14px;outline:1px solid #999;"></div>
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
  const reported = await page.evaluate<string | undefined>('window.__ccxState()')
  if (reported === undefined) {
    const errors = await page.evaluate<string[]>('window.__ccxErrs ?? []')
    throw new Error(`__ccxState failed: ${errors.join(' | ') || 'no page error recorded'}`)
  }
  return JSON.parse(reported) as State
}

/** The physical key behind a printable char: punctuation rides a shifted digit. */
function physicalOf(ch: string): { code: string; keyCode: number; shift: boolean } {
  if (ch === ' ') return { code: 'Space', keyCode: 32, shift: false }
  if (/[a-z]/.test(ch)) return { code: `Key${ch.toUpperCase()}`, keyCode: ch.toUpperCase().charCodeAt(0), shift: false }
  if (/[0-9]/.test(ch)) return { code: `Digit${ch}`, keyCode: ch.charCodeAt(0), shift: false }
  const shifted: Record<string, { code: string; keyCode: number }> = {
    $: { code: 'Digit4', keyCode: 52 },
    '^': { code: 'Digit6', keyCode: 54 },
    '+': { code: 'Equal', keyCode: 187 },
    '=': { code: 'Equal', keyCode: 187 },
    '`': { code: 'Backquote', keyCode: 192 },
  }
  const map = shifted[ch]
  if (map !== undefined) return { ...map, shift: true }
  return { code: 'Comma', keyCode: 188, shift: false }
}

/** Type a string one character at a time, as a keyboard would. */
async function type(text: string): Promise<void> {
  for (const ch of text) {
    if (ch === '\n') {
      await press('Enter', 13)
      continue
    }
    const physical = physicalOf(ch)
    await page?.key({ key: ch, code: physical.code, keyCode: physical.keyCode, text: ch, shift: physical.shift })
  }
  await page?.settle()
}

async function press(key: string, keyCode: number, options: { shift?: boolean; ctrl?: boolean } = {}): Promise<void> {
  // As a real keyboard reports them: a shifted letter's key value is its
  // uppercase (what chord bindings resolve through), its code is Key<name>.
  const reported = options.shift === true && /^[a-z]$/.test(key) ? key.toUpperCase() : key
  const code = /^[a-zA-Z]$/.test(key) ? `Key${key.toUpperCase()}` : key
  await page?.key({ key: reported, code, keyCode, ...options })
  await page?.settle()
}

/** One editor-history group gap: the default newGroupDelay is 500ms. */
const groupGap = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 650))

describe.skipIf(!browserAvailable())('the CodeMirror surface in Chromium', () => {
  it('accepts typed text and reports it as the document with the caret at its end', async () => {
    if (page === null) return
    await page.evaluate('window.__ccxSeed("")')
    await page.evaluate('window.__ccxFocus()')
    await type('hello world')
    const now = await state()
    expect(now.text).toBe('hello world')
    expect(now.head).toBe(11)
  })

  it('breaks the line on a plain Enter and types on past it (the x-Enter-y regression)', async () => {
    if (page === null) return
    await page.evaluate('window.__ccxSeed("")')
    await page.evaluate('window.__ccxFocus()')
    await type('x')
    await press('Enter', 13)
    const broke = await state()
    expect(broke.text).toBe('x\n')
    expect(broke.head).toBe(2)
    await type('y')
    const after = await state()
    expect(after.text).toBe('x\ny')
    expect(after.head).toBe(3)
  })

  it('opens a fence with Enter and types its body (the ```-Enter regression)', async () => {
    if (page === null) return
    await page.evaluate('window.__ccxSeed("")')
    await page.evaluate('window.__ccxFocus()')
    await type('```')
    await press('Enter', 13)
    const opened = await state()
    expect(opened.text).toBe('```\n')
    expect(opened.head).toBe(4)
    await type('js\nconst x = 1')
    await press('Enter', 13)
    await type('```')
    const fenced = await state()
    expect(fenced.text).toBe('```\njs\nconst x = 1\n```')
    expect(fenced.head).toBe(fenced.text.length)
  })

  it('keeps a trailing line through caret moves (the ephemeral-line regression)', async () => {
    if (page === null) return
    await page.evaluate('window.__ccxSeed("```js\\nconst \\n```\\n")')
    await page.evaluate('window.__ccxFocus()')
    await page.settle()
    const seed = await state()
    expect(seed.text).toBe('```js\nconst \n```\n')
    expect(seed.head).toBe(seed.text.length)
    await press('ArrowLeft', 37)
    const left = await state()
    expect(left.text).toBe(seed.text)
    expect(left.head).toBe(seed.text.length - 1)
    await press('ArrowRight', 39)
    const back = await state()
    expect(back.text).toBe(seed.text)
    expect(back.head).toBe(seed.text.length)
  })

  it('types into the middle line of a fence without the caret jumping', async () => {
    if (page === null) return
    await page.evaluate('window.__ccxSeed("```js\\nconst \\n```")')
    await page.evaluate('window.__ccxFocus()')
    await page.settle()
    await press('ArrowUp', 38)
    // Column 3 of the closing fence line lands mid-'const '; End finishes the line.
    const reached = await state()
    expect(reached.head).toBe('```js\ncon'.length)
    await press('End', 35)
    const lined = await state()
    expect(lined.head).toBe('```js\nconst '.length)
    await type('x = 1')
    const typed = await state()
    expect(typed.text).toBe('```js\nconst x = 1\n```')
    expect(typed.head).toBe('```js\nconst x = 1'.length)
  })

  it('folds typed maths into a drawing that stands in for the source', async () => {
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
    // The document carries the source; the drawing replaced it on the screen.
    const dom = await page.evaluate<string>("document.querySelector('#composer .cm-content')?.textContent ?? ''")
    expect(dom).not.toContain('$x^2$')
  })

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
      const head = now.head
      if (head > 0 && head < 18) reached.add(head)
    }
    // Every click over the expression opens it INSIDE, to more than one glyph
    // offset across the sweep — the map's whole point.
    expect(reached.size).toBeGreaterThanOrEqual(2)
  })

  it('keeps a vertical move\'s column through an object-led line', async () => {
    if (page === null) return
    await page.evaluate('window.__ccxSeed("start\\n$x$ tail")')
    await page.evaluate('window.__ccxFocus()')
    await press('End', 35, { ctrl: true })
    const before = (await state()).head
    await press('ArrowUp', 38)
    await press('ArrowDown', 40)
    const after = (await state()).head
    expect(before).toBe('start\n$x$ tail'.length)
    expect(after).toBe(before)
  })

  it('deletes a folded object whole from its far edge', async () => {
    if (page === null) return
    await page.evaluate('window.__ccxSeed("a $x^2$ b")')
    await page.evaluate('window.__ccxFocus()')
    await page.settle()
    await press('End', 35, { ctrl: true })
    // Three backspaces: 'b', the space, then the atom's far edge — the last
    // takes the whole object, leaving 'a '.
    for (let step = 0; step < 3; step++) await press('Backspace', 8)
    const after = await state()
    expect(after.text).toBe('a ')
    expect(after.head).toBe(2)
    const atomGone = await page.evaluate('document.querySelector("[data-ccx-atom]") === null')
    expect(atomGone).toBe(true)
  })

  it('opens a folded maths from either edge with plain arrows, and refolds on leaving', async () => {
    if (page === null) return
    await page.evaluate('window.__ccxSeed("a $x^2$ b")')
    await page.evaluate('window.__ccxFocus()')
    await page.settle()
    await press('Home', 36)
    await press('ArrowRight', 39)
    await press('ArrowRight', 39)
    expect((await state()).head).toBe(2) // the span's left edge, still folded
    await press('ArrowRight', 39)
    const entered = await state()
    expect(entered.head).toBe(3) // the LaTeX's first character
    const opened = await page.evaluate('document.querySelector("[data-ccx-atom]") === null')
    expect(opened).toBe(true)
    await press('ArrowRight', 39)
    await press('ArrowRight', 39)
    await press('ArrowRight', 39)
    expect((await state()).head).toBe(6) // the LaTeX's last character
    await press('ArrowRight', 39)
    expect((await state()).head).toBe(7) // the span's right edge — left, so refolded
    const folded = await page.evaluate('document.querySelector("[data-ccx-atom]") !== null')
    expect(folded).toBe(true)
    await press('ArrowLeft', 37)
    const reentered = await state()
    expect(reentered.head).toBe(6)
  })

  it('takes a group move past a whole link without stopping inside it', async () => {
    if (page === null) return
    await page.evaluate('window.__ccxSeed("x [label](/t \\"ti\\") y")')
    await page.evaluate('window.__ccxFocus()')
    await page.settle()
    await press('Home', 36)
    const heads: number[] = []
    for (let step = 0; step < 4; step++) {
      await press('ArrowRight', 39, { ctrl: true })
      heads.push((await state()).head)
    }
    // From 0: the word `x` (1), then the whole link in one step, never inside (2, 18).
    expect(heads[1]).toBe(18)
    for (const head of heads) {
      expect(head <= 2 || head >= 18).toBe(true)
    }
  })

  it('opens a display maths with a vertical move whose column strikes it', async () => {
    if (page === null) return
    await page.evaluate('window.__ccxSeed("top\\n$e^{i\\\\pi} + 1 = 0$\\ntail")')
    await page.evaluate('window.__ccxFocus()')
    await page.settle()
    await press('End', 35, { ctrl: true })
    expect((await state()).head).toBe('top\n$e^{i\\pi} + 1 = 0$\ntail'.length)
    await press('ArrowUp', 38)
    const landed = await state()
    // Strictly inside the span, at a glyph the column struck — never an edge.
    expect(landed.head).toBeGreaterThan(4)
    expect(landed.head).toBeLessThan(20)
    const opened = await page.evaluate('document.querySelector("[data-ccx-atom]") === null')
    expect(opened).toBe(true)
  })

  it('lands a vertical move at the source boundary the column strikes', async () => {
    if (page === null) return
    await page.evaluate('window.__ccxSeed("abcdefghijklin\\n$ \\\\LaTeX \\\\; rulez $\\nabcdefghijklin")')
    await page.evaluate('window.__ccxFocus()')
    await page.settle()
    // From the line below, column by column: every landing opens the span, the
    // heads never run backwards as the column advances, and the widest column
    // (the line's end) lands past the last glyph the drawing owns.
    const heads: number[] = []
    for (let column = 0; column <= 14; column += 2) {
      // Each ArrowUp leaves the caret inside the span; come back to the line below.
      await press('End', 35, { ctrl: true })
      await press('Home', 36)
      for (let step = 0; step < column; step++) await press('ArrowRight', 39)
      const before = (await state()).head
      expect(before).toBe(35 + column) // the caret walks the line below the span
      await press('ArrowUp', 38)
      const landed = (await state()).head
      expect(landed).toBeGreaterThan(15)
      expect(landed).toBeLessThan(35)
      heads.push(landed)
    }
    // The end-of-line column lands deep in the tail glyphs (past `r`): the
    // sweep's widest landing reaches past the drawing's middle.
    expect(Math.max(...heads)).toBeGreaterThan(28)
  }, 30000)

  it('maps a column into the trailing spacing commands, not just past the last glyph', async () => {
    if (page === null) return
    // The span is [15, 41): latex ` \LaTeX \; rulez \;\;\; ` with after-`z` at 32;
    // the ` \;\;\; ` tail is (32, 41). The line below is one char wider than the
    // drawing, so its widest columns may honestly land past the span on ` x`.
    await page.evaluate('window.__ccxSeed("abcdefghijklin\\n$ \\\\LaTeX \\\\; rulez \\\\;\\\\;\\\\; $ x\\nabcdefghijklinnn")')
    await page.evaluate('window.__ccxFocus()')
    await page.settle()
    const heads: number[] = []
    for (let column = 0; column <= 15; column++) {
      await press('End', 35, { ctrl: true })
      await press('Home', 36)
      for (let step = 0; step < column; step++) await press('ArrowRight', 39)
      await press('ArrowUp', 38)
      const head = (await state()).head
      console.log('DBGT', column, head)
      // Every landing is either opened inside the span or honestly past it.
      expect(head > 15 && head < 41 || head >= 41).toBe(true)
      heads.push(head)
    }
    // Columns over the spacing tail land at the last glyph's far corner —
    // the sweep's widest interior landing reaches past the drawing's middle.
    expect(Math.max(...heads.filter((one) => one < 41))).toBeGreaterThanOrEqual(32)
    // Atomicity: no landing ever stands inside a command — not within the
    // `\;`s (34, 36, 38), not within `\LaTeX` (18-22). Commands are whole.
    for (const head of heads) {
      expect(head !== 34 && head !== 36 && head !== 38 && !(head > 17 && head < 23)).toBe(true)
    }
  }, 30000)

  it('reads the near row of a stacked layout: the scripts of a big operator', async () => {
    if (page === null) return
    // Inline mode stacks the sub- and superscript BESIDE the operator; the
    // span is [15, 64) with the subscript's glyphs at 33-40, the superscript
    // (`\infty`) at 43-48 drawn ABOVE them, and the body `{x^2}` at 49-53.
    await page.evaluate('window.__ccxSeed("abcdefghijklin\\n$ \\\\LaTeX \\\\; \\\\sum_{x\\\\:=\\\\:0}^{\\\\infty}{x^2} \\\\;\\\\;\\\\; $ zz\\nabcdefghijknisurtwyz")')
    await page.evaluate('window.__ccxFocus()')
    await page.settle()
    const heads: number[] = []
    for (let column = 0; column <= 18; column++) {
      await press('End', 35, { ctrl: true })
      await press('Home', 36)
      for (let step = 0; step < column; step++) await press('ArrowRight', 39)
      await press('ArrowUp', 38)
      const head = (await state()).head
      // Every landing is either opened inside the span or honestly past it.
      expect(head > 15 && head < 64 || head >= 64).toBe(true)
      heads.push(head)
    }
    // From below, the column reads through the near row: the subscript's
    // glyphs are reached (33-40) and so is the body (`{x^2}` at 49-54).
    expect(heads.some((one) => one >= 33 && one <= 40)).toBe(true)
    expect(heads.some((one) => one >= 49 && one <= 54)).toBe(true)
    // From above, the argmin reads the superscript: some column lands on
    // each of `\infty`'s two edges — its glyph owns only the command's own
    // characters (43 and 49), never the `}^{`…`{` structure around them.
    const fromAbove: number[] = []
    for (let column = 0; column <= 13; column++) {
      // The bottom sweep left the caret inside the span: come back to the top.
      await press('Home', 36, { ctrl: true })
      for (let step = 0; step < column; step++) await press('ArrowRight', 39)
      await press('ArrowDown', 40)
      const head = (await state()).head
      expect(head > 15 && head < 64 || head >= 64).toBe(true)
      fromAbove.push(head)
    }
    expect(fromAbove.includes(43)).toBe(true)
    expect(fromAbove.includes(49)).toBe(true)
    // Atomicity survives the stack: nothing inside `\sum` (28-30), `\infty`
    // (44-47), the `\:`s (35, 38 — their edges 34/37 are legal stops), or
    // the `\LaTeX` logo (18-22).
    for (const head of heads) {
      const inside = (head > 27 && head < 31) || (head > 43 && head < 48)
        || head === 35 || head === 38 || (head > 17 && head < 23)
      expect(inside).toBe(false)
    }
  }, 30000)

  it('renders a link whose label holds $$ without a malformed fold', async () => {
    if (page === null) return
    await page.evaluate('window.__ccxSeed("[$$](#test2 \\"$ \\\\LaTeX $\\")")')
    await page.evaluate('window.__ccxFocus()')
    await page.settle()
    // Dollar runs match only where they begin: the second `$` of the label once
    // re-opened as width-1 maths across the link and drew a KaTeX error in three lines.
    expect(await page.evaluate('document.querySelector(".katex-error") === null')).toBe(true)
    expect(await page.evaluate('document.querySelector("[data-ccx-atom]") === null')).toBe(true)
    expect(await page.evaluate('document.querySelectorAll(".cm-line").length')).toBe(1)
  })

  it('keeps the editor live through an unclosed display maths', async () => {
    if (page === null) return
    await page.evaluate('window.__ccxSeed("")')
    await page.evaluate('window.__ccxFocus()')
    await type('$$')
    await press('Enter', 13)
    await type('\\LaTeX')
    await press('Enter', 13)
    await type('$')
    const typed = await state()
    expect(typed.text).toBe('$$\n\\LaTeX\n$')
    expect(typed.head).toBe(typed.text.length)
    expect(await page.evaluate('document.querySelectorAll(".cm-line").length')).toBe(3)
    // The wedged state this sequence once produced: arrows dead, the trailing
    // `$` eaten by a DOM readback. Both stays and moves.
    await press('ArrowUp', 38)
    const up = await state()
    expect(up.text).toBe('$$\n\\LaTeX\n$')
    expect(up.head).toBeLessThan(up.text.length)
    await press('ArrowUp', 38)
    const top = await state()
    expect(top.text).toBe('$$\n\\LaTeX\n$')
    expect(top.head).toBeLessThan(up.head)
  })

  it('leaves an open maths span by the render: the column is the glyphs\', not the source\'s', async () => {
    if (page === null) return
    // The span is open (caret inside at its closing `$`); LaTeX is more
    // text-verbose than what it draws, so the RENDER — not the source
    // column — must decide where the caret lands in the line below.
    const text = 'abcdefghi\n$ \\LaTeX \\; \\sum_{x}^{2}$\nabcdefghp'
    await page.evaluate(`window.__ccxSeed(${JSON.stringify(text)})`)
    await page.evaluate('window.__ccxFocus()')
    await page.settle()
    await page.evaluate(`window.__ccxCaret(${text.length - 1})`) // just before the closing `$`
    await press('ArrowDown', 40)
    const landed = JSON.parse(await page.evaluate<string>('window.__ccxState()')) as { text: string; head: number }
    const below = text.indexOf('\n', text.indexOf('\n') + 1) + 1
    expect(landed.head).toBeGreaterThanOrEqual(below)
    // The landed column in 'abcdefghp' is the drawing's width — the source
    // column there would be 14+; the render is compact.
    expect(landed.head - below).toBeLessThan(13)
  }, 30000)

  it('mirrors: equal adjacent spans land the same column via the render', async () => {
    if (page === null) return
    // source_pos → render corner → column, twice over equal spans: the
    // same inside offset lands the same column in equal lines.
    const text = 'abcdefgh\n$ \\LaTeX $\nmiddle text\n$ \\LaTeX $\nmiddle text'
    await page.evaluate(`window.__ccxSeed(${JSON.stringify(text)})`)
    await page.evaluate('window.__ccxFocus()')
    await page.settle()
    const inside = '$ \\La'.length
    const firstSpan = 'abcdefgh\n'.length + inside
    const secondSpan = 'abcdefgh\n$ \\LaTeX $\nmiddle text\n'.length + inside
    const xOf = async (head: number): Promise<number> => {
      if (page === null) return -1
      return page.evaluate<number>(`(() => {
        const control = window.__ccxControl
        if (control === undefined) return -1
        const coords = control.view.coordsAtPos(${head})
        return coords === null ? -1 : Math.round(coords.left)
      })()`)
    }
    await page.evaluate(`window.__ccxCaret(${firstSpan})`)
    await press('ArrowDown', 40)
    const first = JSON.parse(await page.evaluate<string>('window.__ccxState()')) as { head: number }
    await page.evaluate(`window.__ccxCaret(${secondSpan})`)
    await press('ArrowDown', 40)
    const second = JSON.parse(await page.evaluate<string>('window.__ccxState()')) as { head: number }
    const x1 = await xOf(first.head)
    const x2 = await xOf(second.head)
    expect(x1).toBeGreaterThanOrEqual(0)
    expect(Math.abs(x1 - x2)).toBeLessThanOrEqual(2)
  }, 30000)

  it('walks the history by word groups, the caret restored', async () => {
    if (page === null) return
    await page.evaluate('window.__ccxSeed("")')
    await page.evaluate('window.__ccxFocus()')
    await type('one')
    await groupGap()
    await type(' two')
    expect((await state()).text).toBe('one two')
    await press('z', 90, { ctrl: true })
    expect((await state()).text).toBe('one')
    await press('z', 90, { ctrl: true, shift: true })
    const redone = await state()
    expect(redone.text).toBe('one two')
    expect(redone.head).toBe(7)
  })
})

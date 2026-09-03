/**
 * Real-Chromium harness over the DevTools Protocol, after the reference
 * composer's doctrine: layout, caret normalisation, and key handling are
 * every question the editor turns on, and a DOM model has none of them.
 * Zero new dependencies — Node's own WebSocket and a Chromium binary.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'

/** The explicitly-pointed Chromium, read through the index signature the
 * client-build environment narrows `env` to. */
const CHROME_PATH = (process.env as Record<string, string | undefined>).CHROME_PATH

/** Candidate Chromium binaries, in order. */
const BROWSER_CANDIDATES = [
  CHROME_PATH,
  '/usr/sbin/chromium',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome-stable',
].filter((one): one is string => one !== undefined)

/** Whether a Chromium binary exists to drive. */
export function browserAvailable(): boolean {
  return BROWSER_CANDIDATES.some(one => existsSync(one))
}

/** A live CDP session with one attached page. */
export interface Page {
  /** Navigate to a URL and wait for the load event. */
  goto(url: string): Promise<void>
  /** Evaluate an expression in the page, returning its JSON value. */
  evaluate<T>(expression: string): Promise<T>
  /** Send one key event (keyDown with text produces input). */
  key(options: {
    key: string
    code?: string
    keyCode?: number
    text?: string
    shift?: boolean
    ctrl?: boolean
  }): Promise<void>
  /** Click at viewport coordinates. */
  click(x: number, y: number): Promise<void>
  /** Wait for a settle (decoration is synchronous; one frame is enough). */
  settle(): Promise<void>
  /** Close the browser. */
  close(): Promise<void>
}

interface CdpMessage { id: number; method: string; params: unknown }
interface CdpEvent { method: string; params: unknown }

/** Launch Chromium and open one blank page; null where no browser exists. */
export async function openPage(): Promise<Page | null> {
  const binary = BROWSER_CANDIDATES[0]
  if (binary === undefined) return null
  let child: ChildProcess
  try {
    child = spawn(binary, [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--remote-debugging-port=0',
      '--allow-file-access-from-files',
      'about:blank',
    ], { stdio: ['ignore', 'pipe', 'pipe'] })
  } catch {
    return null
  }

  const wsUrl = await new Promise<string | null>((resolve) => {
    let buffer = ''
    const read = (chunk: Buffer): void => {
      buffer += chunk.toString()
      const match = /ws:\/\/\S+/.exec(buffer)
      if (match !== null) {
        child.stderr?.off('data', read)
        resolve(match[0])
      }
    }
    child.stderr?.on('data', read)
    child.once('exit', () => resolve(null))
    setTimeout(() => resolve(null), 10_000)
  })
  if (wsUrl === null) {
    child.kill()
    return null
  }

  const ws = new WebSocket(wsUrl)
  await once(ws, 'open')
  let seq = 0
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
  const listeners: ((event: CdpEvent) => void)[] = []
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data)) as CdpMessage & { result?: unknown; error?: unknown }
    if (message.id !== undefined) {
      const waiter = pending.get(message.id)
      if (waiter !== undefined) {
        pending.delete(message.id)
        if (message.error !== undefined) waiter.reject(new Error(String(message.error)))
        else waiter.resolve(message.result)
      }
      return
    }
    for (const listener of listeners) listener(message as CdpEvent)
  })

  const send = (method: string, params: unknown = {}, sessionId?: string): Promise<unknown> =>
    new Promise((resolve, reject) => {
      const id = ++seq
      pending.set(id, { resolve, reject })
      ws.send(JSON.stringify(sessionId === undefined ? { id, method, params } : { id, method, params, sessionId }))
    })

  const waitEvent = <T>(method: string): Promise<T> =>
    new Promise((resolve) => {
      const listener = (event: CdpEvent): void => {
        if (event.method === method) {
          listeners.splice(listeners.indexOf(listener), 1)
          resolve(event.params as T)
        }
      }
      listeners.push(listener)
    })

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' }) as { targetId: string }
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true }) as { sessionId: string }
  const page = (method: string, params: unknown = {}): Promise<unknown> =>
    send(method, params, sessionId)

  await page('Runtime.enable')
  await page('Page.enable')

  const load = (): Promise<void> => waitEvent('Page.loadEventFired').then(() => {})

  return {
    async goto(url: string): Promise<void> {
      const loaded = load()
      await page('Page.navigate', { url })
      await Promise.race([loaded, new Promise<void>(resolve => setTimeout(resolve, 5000))])
    },
    async evaluate<T>(expression: string): Promise<T> {
      const result = await page('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      }) as { result: { value: T } }
      return result.result.value
    },
    async key(options): Promise<void> {
      const modifiers = (options.shift === true ? 8 : 0) | (options.ctrl === true ? 2 : 0)
      await page('Input.dispatchKeyEvent', {
        type: options.text !== undefined && options.key.length === 1 ? 'keyDown' : 'rawKeyDown',
        key: options.key,
        code: options.code ?? '',
        windowsVirtualKeyCode: options.keyCode ?? 0,
        text: options.text,
        modifiers,
      })
      await page('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: options.key,
        code: options.code ?? '',
        windowsVirtualKeyCode: options.keyCode ?? 0,
        modifiers,
      })
    },
    async click(x, y): Promise<void> {
      for (const type of ['mousePressed', 'mouseReleased'] as const) {
        await page('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 })
      }
    },
    async settle(): Promise<void> {
      await new Promise((resolve) => setTimeout(resolve, 60))
    },
    async close(): Promise<void> {
      ws.close()
      child.kill()
    },
  }
}

/** The page the editor drives: one host div plus the state reporter. */
export const PAGE_SCRIPT = `
window.__ccxErrs = []
window.addEventListener('error', (e) => window.__ccxErrs.push(String(e.message) + ' @ ' + (e.filename || '') + ':' + e.lineno))
window.__ccxBox = (selector) => {
  const el = document.querySelector(selector)
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { x: r.x, y: r.y, width: r.width, height: r.height }
}
`

/** Write the harness page and its script to a temp dir; returns the page URL.
 * The script is a sibling file, never inlined: a bundle body can contain the
 * literal `</script>`, which would close the tag mid-script. */
export function writePage(body: string, script: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'ccx-caret-'))
  writeFileSync(join(dir, 'page.js'), script)
  writeFileSync(join(dir, 'page.html'), `<!doctype html><html><body>${body}<script src="page.js"></script></body></html>`)
  return `file://${join(dir, 'page.html')}`
}

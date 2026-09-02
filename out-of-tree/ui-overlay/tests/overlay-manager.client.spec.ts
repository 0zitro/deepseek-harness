// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OverlayManager } from '../src/client/overlay-manager.ts'

afterEach(() => { document.body.innerHTML = '' })

async function mount() {
  const ctx = new Context()
  const set = vi.fn(() => () => {})
  ctx.provide('uiWhenContext', { set })
  let manager: OverlayManager | undefined
  const fiber = ctx.plugin({ apply: (pluginCtx: Context) => { manager = new OverlayManager(pluginCtx) } })
  await fiber.await()
  if (manager === undefined) throw new Error('not mounted')
  return { set, manager, dispose: () => fiber.dispose() }
}

function overlay(): HTMLElement {
  const element = document.createElement('div')
  document.body.appendChild(element)
  return element
}

describe('OverlayManager', () => {
  it('closes the topmost overlay only, in mount order', async () => {
    const { set, manager } = await mount()
    const first = overlay()
    const second = overlay()
    first.dispatchEvent(new CustomEvent('dsh:overlay-open', { bubbles: true }))
    second.dispatchEvent(new CustomEvent('dsh:overlay-open', { bubbles: true }))
    expect(set).toHaveBeenLastCalledWith('overlayOpen', true)

    const firstClose = vi.fn()
    const secondClose = vi.fn()
    first.addEventListener('dsh:overlay-close', firstClose)
    second.addEventListener('dsh:overlay-close', secondClose)
    manager.closeTop()
    expect(secondClose).toHaveBeenCalledOnce()
    expect(firstClose).not.toHaveBeenCalled()
  })

  it('no-ops when no overlay is open', async () => {
    const { manager } = await mount()
    expect(() => { manager.closeTop() }).not.toThrow()
  })

  it('ignores open events without an element target', async () => {
    const { set } = await mount()
    document.dispatchEvent(new CustomEvent('dsh:overlay-open'))
    expect(set).not.toHaveBeenCalled()
  })

  it('ignores close events without an element target or a tracked element', async () => {
    const { set } = await mount()
    document.dispatchEvent(new CustomEvent('dsh:overlay-closed'))
    const untracked = overlay()
    untracked.dispatchEvent(new CustomEvent('dsh:overlay-closed', { bubbles: true }))
    expect(set).not.toHaveBeenCalled()
  })

  it('removes its listeners on disposal', async () => {
    const { set, dispose } = await mount()
    await dispose()
    const element = overlay()
    element.dispatchEvent(new CustomEvent('dsh:overlay-open', { bubbles: true }))
    expect(set).not.toHaveBeenCalled()
  })

  it('clears overlayOpen when the last overlay closes', async () => {
    const { set } = await mount()
    const element = overlay()
    element.dispatchEvent(new CustomEvent('dsh:overlay-open', { bubbles: true }))
    element.dispatchEvent(new CustomEvent('dsh:overlay-closed', { bubbles: true }))
    expect(set).toHaveBeenLastCalledWith('overlayOpen', false)
  })
})

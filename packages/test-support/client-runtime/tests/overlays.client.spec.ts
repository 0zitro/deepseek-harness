// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { dismissOverlay } from '../src/overlays.ts'

afterEach(() => { document.body.innerHTML = '' })

function scope(name: string): HTMLElement {
  const element = document.createElement('div')
  element.dataset['overlayScope'] = name
  document.body.appendChild(element)
  return element
}

describe('dismissOverlay', () => {
  it('addresses the last scope mounted, which is the one the manager reaches', () => {
    const first = vi.fn()
    const second = vi.fn()
    scope('outer').addEventListener('dsh:overlay-close', first)
    scope('inner').addEventListener('dsh:overlay-close', second)

    dismissOverlay()

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledOnce()
  })

  it('addresses a named scope where the caller states one', () => {
    const chosen = vi.fn()
    const target = scope('outer')
    target.addEventListener('dsh:overlay-close', chosen)
    scope('inner')

    dismissOverlay(target)

    expect(chosen).toHaveBeenCalledOnce()
  })

  it('refuses when no overlay is mounted rather than passing silently', () => {
    // A dismissal that reaches nothing would leave the assertion after it
    // reading whatever the component already showed, which is a test that
    // cannot fail.
    expect(() => { dismissOverlay() }).toThrow(/no element carrying data-overlay-scope/u)
  })
})

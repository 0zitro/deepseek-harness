// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OverlayScope } from '@deepseek-ai/dsh-client-ui-primitives'

afterEach(cleanup)

describe('OverlayScope', () => {
  it('renders the scope marker and runs onClose on the close event', () => {
    const onClose = vi.fn()
    const view = render(<OverlayScope name="modal" onClose={onClose}><span>body</span></OverlayScope>)
    const element = view.container.querySelector('[data-overlay-scope="modal"]')
    expect(element).toBeDefined()
    element!.dispatchEvent(new CustomEvent('dsh:overlay-close'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('emits open on mount and closed on unmount', () => {
    const onOpen = vi.fn()
    document.addEventListener('dsh:overlay-open', onOpen)
    const view = render(<OverlayScope name="modal" onClose={() => {}}><span>body</span></OverlayScope>)
    expect(onOpen).toHaveBeenCalledOnce()
    const element = view.container.querySelector('[data-overlay-scope="modal"]')!
    const onClosed = vi.fn()
    element.addEventListener('dsh:overlay-closed', onClosed)
    view.unmount()
    expect(onClosed).toHaveBeenCalledOnce()
    document.removeEventListener('dsh:overlay-open', onOpen)
  })

  it('forwards a ref to the scope element', () => {
    const ref = { current: null as HTMLDivElement | null }
    render(<OverlayScope ref={ref} name="modal" onClose={() => {}}><span>body</span></OverlayScope>)
    expect(ref.current).toBeDefined()
  })

  it('accepts a callback ref', () => {
    let el: HTMLDivElement | null = null
    render(<OverlayScope ref={(node) => { el = node }} name="modal" onClose={() => {}}><span>body</span></OverlayScope>)
    expect(el).toBeDefined()
  })
})

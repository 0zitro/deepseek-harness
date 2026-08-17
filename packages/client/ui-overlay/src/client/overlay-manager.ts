/** LIFO overlay manager: overlays declare themselves via OverlayScope, the dispatcher closes the top. */
import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context {
    overlays: OverlayManager
  }
}

/** Overlay → manager: an OverlayScope dispatched this on mount. */
export const OVERLAY_OPEN_EVENT = 'dsh:overlay-open'
/** Overlay → manager: an OverlayScope dispatched this on unmount. */
export const OVERLAY_CLOSED_EVENT = 'dsh:overlay-closed'
/** Manager → overlay: close the topmost overlay (handled by its OverlayScope). */
export const OVERLAY_CLOSE_EVENT = 'dsh:overlay-close'

/**
 * Tracks the open overlay scopes in mount order so a single `overlay.close`
 * action can dismiss the topmost one. Overlays contribute themselves through
 * the `dsh:overlay-open`/`dsh:overlay-closed` DOM events emitted by
 * `OverlayScope` (Cordis-free primitives cannot reach this service directly),
 * and this manager publishes the derived `overlayOpen` context key.
 */
export class OverlayManager extends Service {
  private readonly elements: Element[] = []
  private clearOpen: (() => void) | undefined

  constructor(ctx: Context) {
    super(ctx, 'overlays')
    ctx.effect(() => {
      const onOpen = (event: Event): void => {
        if (event.target instanceof Element) {
          this.elements.push(event.target)
          this.publish()
        }
      }
      const onClosed = (event: Event): void => {
        if (event.target instanceof Element) {
          const index = this.elements.indexOf(event.target)
          if (index >= 0) {
            this.elements.splice(index, 1)
            this.publish()
          }
        }
      }
      document.addEventListener(OVERLAY_OPEN_EVENT, onOpen)
      document.addEventListener(OVERLAY_CLOSED_EVENT, onClosed)
      return () => {
        document.removeEventListener(OVERLAY_OPEN_EVENT, onOpen)
        document.removeEventListener(OVERLAY_CLOSED_EVENT, onClosed)
      }
    })
  }

  /** Close the topmost open overlay; no-op when none is open. */
  closeTop(): void {
    const top = this.elements.at(-1)
    if (top !== undefined) top.dispatchEvent(new CustomEvent(OVERLAY_CLOSE_EVENT))
  }

  private publish(): void {
    this.clearOpen?.()
    this.clearOpen = this.ctx.get('uiWhenContext')?.set('overlayOpen', this.elements.length > 0)
  }
}

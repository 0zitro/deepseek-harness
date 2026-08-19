/** OverlayScope: declares an overlay the overlay.close action can dismiss. */
import { forwardRef, useEffect, useRef } from 'react'
import type { ForwardedRef, HTMLAttributes, ReactNode } from 'react'

/** Props for an overlay declaration; forwards the remaining div attributes. */
export interface OverlayScopeProps extends HTMLAttributes<HTMLDivElement> {
  /** Stable region name (used only for diagnostics; stacking is mount order). */
  name: string
  /** Dismiss handler the overlay.close action invokes on this scope. */
  onClose: () => void
  children?: ReactNode
}

function setRef(el: HTMLDivElement | null, forwarded: ForwardedRef<HTMLDivElement>, local: { current: HTMLDivElement | null }): void {
  local.current = el
  if (typeof forwarded === 'function') forwarded(el)
  else if (forwarded !== null) forwarded.current = el
}

/**
 * Declare an overlay. On mount it emits `dsh:overlay-open`; on unmount
 * `dsh:overlay-closed`; and it listens for `dsh:overlay-close`, running
 * `onClose`. The overlay manager tracks these in mount order, so the
 * `overlay.close` action reaches the topmost open overlay.
 *
 * The scope binds no keys. Which gesture dismisses an overlay is a keybinding
 * on the `overlay.close` action — declared once, rebindable, and gated on the
 * `overlayOpen` clause — so an overlay in a composition without that action is
 * not dismissed by the keyboard at all, and is dismissed by nothing this
 * component listens for.
 */
export const OverlayScope = forwardRef<HTMLDivElement, OverlayScopeProps>(function OverlayScope(
  { name, onClose, children, ...divProps },
  forwardedRef,
) {
  const ref = useRef<HTMLDivElement | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => {
    const element = ref.current
    /* v8 ignore next -- the ref is set before effects run, so the div exists. */
    if (element === null) return
    element.dispatchEvent(new CustomEvent('dsh:overlay-open', { bubbles: true }))
    const handler = (): void => { onCloseRef.current() }
    element.addEventListener('dsh:overlay-close', handler)
    return () => {
      element.removeEventListener('dsh:overlay-close', handler)
      element.dispatchEvent(new CustomEvent('dsh:overlay-closed', { bubbles: true }))
    }
  }, [])
  return <div ref={(el) => { setRef(el, forwardedRef, ref) }} data-overlay-scope={name} {...divProps}>{children}</div>
})

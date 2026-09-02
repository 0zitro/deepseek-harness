/** Dismissing an overlay in a component test, the way the manager does. */
import { fireEvent } from '@testing-library/react'

/** Manager → overlay: the event an `OverlayScope` dismisses itself on. */
const OVERLAY_CLOSE_EVENT = 'dsh:overlay-close'

/**
 * Dismiss a mounted overlay by addressing its scope.
 *
 * Which gesture dismisses an overlay is a keybinding on the `overlay.close`
 * action, and which of several open overlays it reaches is the overlay
 * manager's mount ordering. A component test holds neither, so pressing Escape
 * there asserts something the component does not own and passes or fails on
 * which plugins the test happened to mount. What a component does own is that
 * it dismisses when its scope is told to, which is what this addresses.
 * @param scope - the scope to dismiss. Defaults to the last one mounted, which
 * is the one the manager would reach.
 * @returns nothing.
 */
export function dismissOverlay(scope?: Element): void {
  const target = scope ?? [...document.querySelectorAll('[data-overlay-scope]')].at(-1)
  if (target === undefined) {
    throw new Error('dismissOverlay: no element carrying data-overlay-scope is mounted')
  }
  fireEvent(target, new CustomEvent(OVERLAY_CLOSE_EVENT))
}

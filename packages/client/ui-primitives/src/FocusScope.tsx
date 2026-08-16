/** FocusScope: declares a focus region the keybindings when-context observes. */
import type { ReactNode } from 'react'

/** Props for a focus-region wrapper. */
export interface FocusScopeProps {
  /** Stable region name; the when-context derives `<name>Focused`/`<name>Active`. */
  name: string
  children?: ReactNode
}

/**
 * Declare a focus region. The keybindings `uiWhenContext` derives a
 * `<name>Focused` key while focus is anywhere inside the region and a
 * `<name>Active` key while it is the innermost focused region; a `when` clause
 * gates any binding on either. Nesting composes: an overlay inside the
 * composer keeps `composerFocused` true while the overlay is the active region.
 */
export function FocusScope({ name, children }: FocusScopeProps) {
  return <div data-focus-scope={name}>{children}</div>
}

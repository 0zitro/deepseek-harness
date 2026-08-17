/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-overlay`.
 * @module @deepseek-ai/dsh-client-ui-overlay/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-overlay'

/** Cordis companion plugin name. */
export const name = 'client-ui-overlay-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: a client-side overlay stack tracking `OverlayScope`
 * mount/unmount DOM events. It emits no cordis events and owns no
 * cross-plugin durable relation — the overlay stack and the derived
 * `overlayOpen` context key are presentation state, not a session-log fact.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */

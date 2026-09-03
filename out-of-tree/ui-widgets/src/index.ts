/**
 * Host entry for the shared widget row. The package exists to serve widgets
 * through the browser module table; its node half registers nothing.
 */
import type { Context } from '@deepseek-ai/cordis'

/**
 * Mount nothing: the row exists so `dsh.client.external` consumers can load
 * this package's client bundle as a module.
 * @param ctx - Host context; unused, the client half owns every export.
 */
export function apply(_ctx: Context): void {}

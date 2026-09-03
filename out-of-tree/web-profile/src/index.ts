/**
 * Host entry of the installable out-of-tree UI bundle. The bundle's whole
 * content is its `cordis.patch.yml` patch layer; this module exists so the
 * package is an ordinary npm package with a buildable entry.
 */
import type { Context } from '@deepseek-ai/cordis'

/**
 * Mount nothing: the patch layer carries the composition.
 * @param ctx - Host context; unused.
 */
export function apply(_ctx: Context): void {}

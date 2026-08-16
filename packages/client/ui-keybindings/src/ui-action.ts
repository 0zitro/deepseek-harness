/**
 * UI actions a keybinding can invoke.
 *
 * An action is contributed by the feature plugin that owns it (the composer
 * contributes the send action, and so on). Keybindings reference actions by
 * their opaque id; the id is the durable contract between a binding and the
 * plugin that fulfils it, so a binding to a not-yet-loaded action is a valid
 * stored value that simply does nothing until the action appears.
 */
import type { Branded } from '@deepseek-ai/dsh-brand'
import z from '@deepseek-ai/schemastery'

/** Opaque id of a UI action, minted by the feature that contributes it. */
export type UiActionId = Branded<'UiActionId'>

/** The composer's send action id. */
export const COMPOSER_SEND_ACTION = 'composer.send' as UiActionId

/** Schemastery schema for an action id: a string re-branded on the way out. */
export const UiActionIdSchema: z<UiActionId> = z.transform(
  z.string(),
  value => value as UiActionId,
  true,
)

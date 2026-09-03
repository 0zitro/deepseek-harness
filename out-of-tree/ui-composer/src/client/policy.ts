/**
 * The busy-Enter delivery rule, resolved out-of-tree against the conversation
 * preference the stock settings row owns.
 *
 * The rule is the conversation plugin's `ComposerSubmissionPolicy.resolve`,
 * restated here because the policy instance is that package's private wiring;
 * the durable preference it reads (`busyEnter` in the `ui-conversation`
 * namespace) is a registered settings namespace any scope may bind.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'

/** The gesture a submit key made: plain Enter, or the Cmd/Ctrl-accelerated chord. */
export type SubmitGesture = 'enter' | 'accelerated'

/** The conversation plugin's busy-Enter behaviors, mirrored for the read-only bind; the submit
 * mode the shell's `submit(mode)` takes is the same union. */
export type BusyEnterBehavior = 'queue' | 'steer'
export type InputSubmitMode = BusyEnterBehavior

/** The durable section the conversation plugin registers. */
interface ConversationSettings {
  busyEnter: BusyEnterBehavior
}

/** Default preserves Enter-as-Queue for running conversations. */
const DEFAULT_BUSY_ENTER: BusyEnterBehavior = 'queue'

/**
 * Resolve one keyboard gesture without changing state.
 * @param running - whether the addressed agent currently reports busy.
 * @param gesture - plain Enter or the accelerated chord.
 * @param steeringAvailable - whether this session transport supports steering.
 * @returns Queue outside steer-capable busy state; otherwise the preferred mode or its opposite.
 */
export function resolveMode(
  preferred: BusyEnterBehavior,
  running: boolean,
  gesture: SubmitGesture,
  steeringAvailable: boolean,
): InputSubmitMode {
  if (!running || !steeringAvailable) return 'queue'
  if (gesture === 'enter') return preferred
  return preferred === 'queue' ? 'steer' : 'queue'
}

/**
 * Bind the conversation preference read-only and expose the live resolver.
 * @param ctx - client root context whose settings scope carries namespace binds.
 */
export interface BoundPolicy {
  /** The live busy-Enter preference. */
  readonly preferred: SnapshotStore<BusyEnterBehavior>
  /**
   * Resolve one keyboard gesture against the live preference.
   * @param running - whether the addressed agent currently reports busy.
   * @param gesture - plain Enter or the accelerated chord.
   * @param steeringAvailable - whether this session transport supports steering.
   */
  resolve(running: boolean, gesture: SubmitGesture, steeringAvailable: boolean): InputSubmitMode
  /** Release the scope subscription. */
  dispose(): void
}

/**
 * Bind the conversation preference read-only and expose the live resolver.
 * @param ctx - client root context whose settings scope carries namespace binds.
 */
export function bindPolicy(ctx: Context): BoundPolicy {
  const preferred = createSnapshotStore<BusyEnterBehavior>(DEFAULT_BUSY_ENTER)
  let host: SettingsScope<ConversationSettings> | undefined
  try {
    host = ctx.settingsScope.bind<ConversationSettings>({ namespace: 'ui-conversation' })
  } catch {
    // No settings scope in this composition: the default (Queue) stands, as it does for the stock
    // bar without a provider.
  }
  const adopt = (): void => {
    const section = host?.getSnapshot().value
    if (section !== undefined && section.busyEnter !== preferred.getSnapshot()) preferred.set(section.busyEnter)
  }
  const unsubscribe = host?.subscribe(adopt)
  adopt()
  return {
    preferred,
    resolve: (running, gesture, steeringAvailable) =>
      resolveMode(preferred.getSnapshot(), running, gesture, steeringAvailable),
    dispose: () => { unsubscribe?.() },
  }
}

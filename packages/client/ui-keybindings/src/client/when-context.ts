/** UI context keys a `when` clause resolves against, contributed by feature plugins. */
import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { WhenContext } from '../when-clause.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    uiWhenContext: UiWhenContext
  }
}

/**
 * Registry of UI context keys. Features that own a state fact update the map in
 * place (for example `composerFocused`, `agentBusy`); the dispatcher reads the
 * combined map when resolving each binding's `when` clause.
 */
export class UiWhenContext extends Service {
  private readonly store = createSnapshotStore<WhenContext>({})

  constructor(ctx: Context) {
    super(ctx, 'uiWhenContext')
  }

  /** The combined context map, read by the dispatcher and written by providers. */
  get context(): SnapshotStore<WhenContext> {
    return this.store
  }
}

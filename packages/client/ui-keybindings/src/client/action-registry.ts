/**
 * UI action registry: the extension point where feature plugins contribute the
 * actions keybindings can reference. The keybindings plugin is the orchestrator
 * only — it owns no action; features register their own actions and defaults.
 */
import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { Keybinding } from '../keybinding.ts'
import type { UiActionId } from '../ui-action.ts'

/** A UI action contributed by a feature plugin. */
export interface UiActionDefinition {
  /** Opaque id the keybinding entry references. */
  id: UiActionId
  /** Row title in the keybindings page. */
  label: string
  /** Optional row description. */
  description?: string
  /** Default gestures used when the persisted list has no entry for this action. */
  defaultKeybindings?: readonly Keybinding[]
  /** Handler invoked when a keybinding for this action completes. */
  run: () => void
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    uiActions: UiActionRegistry
  }
}

/**
 * Registry of UI actions. The keybindings page renders one row per registered
 * action, and the dispatcher resolves persisted entries against this registry.
 */
export class UiActionRegistry extends Service {
  private readonly definitions = new Map<UiActionId, UiActionDefinition>()
  private readonly store = createSnapshotStore<readonly UiActionDefinition[]>([])

  constructor(ctx: Context) {
    super(ctx, 'uiActions')
  }

  /** Reactive list of registered actions. */
  get actions(): SnapshotStore<readonly UiActionDefinition[]> {
    return this.store
  }

  /** Register one action; returns a disposer that removes it. */
  register(definition: UiActionDefinition): () => void {
    this.definitions.set(definition.id, definition)
    this.publish()
    return () => {
      this.definitions.delete(definition.id)
      this.publish()
    }
  }

  private publish(): void {
    this.store.set([...this.definitions.values()])
  }
}

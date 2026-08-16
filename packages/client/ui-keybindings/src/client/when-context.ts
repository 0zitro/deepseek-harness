/** UI context keys a `when` clause resolves against, derived from focus scopes plus explicit state. */
import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { WhenContext } from '../when-clause.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    uiWhenContext: UiWhenContext
  }
}

/** Read half of a snapshot store: observe without mutating. */
export interface ReadonlySnapshot<T> {
  getSnapshot(): T
  subscribe(fn: () => void): () => void
}

/** DOM attribute a focus scope renders; the when-context reads it on `focusin`. */
const FOCUS_SCOPE_ATTR = 'data-focus-scope'

/**
 * Registry of UI context keys. The map is a pure merge over the current focus
 * scope stack (regions carrying `data-focus-scope`) plus explicit state keys:
 * every active region contributes `<name>Focused`, the innermost also
 * `<name>Active`, and state keys merge last so they win on conflict.
 */
export class UiWhenContext extends Service {
  private readonly store = createSnapshotStore<WhenContext>({})
  private readonly state = new Map<string, unknown>()
  private scopes: string[] = []

  constructor(ctx: Context) {
    super(ctx, 'uiWhenContext')
    ctx.effect(() => {
      const onFocusin = (event: FocusEvent): void => {
        this.publish(this.namesOf(event.composedPath()))
      }
      const onWindowBlur = (): void => { this.publish([]) }
      document.addEventListener('focusin', onFocusin)
      window.addEventListener('blur', onWindowBlur)
      return () => {
        document.removeEventListener('focusin', onFocusin)
        window.removeEventListener('blur', onWindowBlur)
      }
    })
  }

  /** The derived context map, read-only. */
  get context(): ReadonlySnapshot<WhenContext> {
    return this.store
  }

  /** Set one explicit state key; the returned disposer clears it. */
  set(key: string, value: unknown): () => void {
    this.state.set(key, value)
    this.publish(this.scopes)
    return () => {
      this.state.delete(key)
      this.publish(this.scopes)
    }
  }

  /** Scope names in the composed focus path, innermost first. */
  private namesOf(path: readonly EventTarget[]): string[] {
    const names: string[] = []
    for (const target of path) {
      if (target instanceof Element) {
        const name = target.getAttribute(FOCUS_SCOPE_ATTR)
        if (name !== null) names.push(name)
      }
    }
    return names
  }

  private publish(scopes: readonly string[]): void {
    this.scopes = [...scopes]
    const merged: WhenContext = {}
    for (const [index, name] of scopes.entries()) {
      merged[`${name}Focused`] = true
      if (index === 0) merged[`${name}Active`] = true
    }
    for (const [key, value] of this.state) merged[key] = value
    this.store.set(merged)
  }
}

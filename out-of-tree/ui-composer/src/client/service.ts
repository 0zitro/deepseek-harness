/**
 * The rich composer service (`ctx.composer`): the action face stock
 * keybindings reach. One registration per mounted rich composer surface; the
 * verbs route to the CURRENT session's surface, so a keybinding fires where
 * the user is looking. Bindings to actions whose surface is not mounted are
 * inert by construction — every verb no-ops without a registration.
 */
import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** The submit gesture an action run carries: plain Enter, or the accelerated chord. */
export type SendGesture = 'enter' | 'accelerated'

/** The verbs one mounted rich composer surface answers. */
export interface RichComposerFaces {
  /**
   * Submit with the preference-resolved delivery mode.
   * @param gesture - plain Enter or the accelerated chord.
   */
  send(gesture: SendGesture): void
  /** Submit in queue mode regardless of preference. */
  queue(): void
  /** Submit in steer mode. */
  steer(): void
  /** Walk the source-level undo stack back one step. */
  undo(): void
  /** Walk the source-level undo stack forward one step. */
  redo(): void
  /** Dismiss the trigger menu and the popupSelect shell. */
  dismissPopup(): void
  /** Keyboard arbitration while the menu is open. */
  arbitrate(key: 'up' | 'down' | 'enter' | 'escape' | 'tab'): void
}

/** The outward face of the rich composer service: the action verbs. */
export interface RichComposerServiceFace {
  /**
   * Submit with the preference-resolved delivery mode.
   * @param gesture - plain Enter (default) or the accelerated chord.
   */
  send(gesture?: SendGesture): void
  /** Submit in queue mode regardless of preference. */
  queue(): void
  /** Submit in steer mode. */
  steer(): void
  /** Walk the source-level undo stack back one step. */
  undo(): void
  /** Walk the source-level undo stack forward one step. */
  redo(): void
  /** Dismiss the trigger menu. */
  dismissPopup(): void
  /**
   * Keyboard arbitration while the menu is open.
   * @param key - the gesture direction.
   */
  arbitrate(key: 'up' | 'down' | 'enter' | 'escape' | 'tab'): void
}

/** The registration face the mounted surfaces hold (the service's own half). */
export interface RichComposerRegistry {
  /**
   * Register one session's mounted surface.
   * @param sessionId - the session the surface renders for.
   * @param faces - the verbs the surface answers.
   * @returns the unregister function the surface calls on unmount.
   */
  register(sessionId: SessionId, faces: RichComposerFaces): () => void
}

/** The service body: a session-keyed registry plus current-session routing. */
export class RichComposerService extends Service implements RichComposerServiceFace, RichComposerRegistry {
  /** The mounted surfaces, keyed by their session. */
  private readonly surfaces = new Map<SessionId, RichComposerFaces>()

  /**
   * @param ctx - client root context.
   * @param sessions - the sessions service resolving the current session.
   */
  constructor(
    ctx: Context,
    private readonly sessions: ISessions,
  ) {
    super(ctx, 'composer')
  }

  /** @param sessionId - the session the surface renders for. @param faces - the verbs it answers. */
  register(sessionId: SessionId, faces: RichComposerFaces): () => void {
    this.surfaces.set(sessionId, faces)
    return () => {
      if (this.surfaces.get(sessionId) === faces) this.surfaces.delete(sessionId)
    }
  }

  /** The current session's surface, or undefined where none is mounted. */
  private current(): RichComposerFaces | undefined {
    const id = this.sessions.list.getSnapshot().current
    return id === undefined ? undefined : this.surfaces.get(id)
  }

  /**
   * Submit with the preference-resolved delivery mode.
   * @param gesture - plain Enter (default) or the accelerated chord.
   */
  send(gesture: SendGesture = 'enter'): void {
    this.current()?.send(gesture)
  }

  /** Submit in queue mode regardless of preference. */
  queue(): void {
    this.current()?.queue()
  }

  /** Submit in steer mode, or steer the queue on an empty draft. */
  steer(): void {
    this.current()?.steer()
  }

  /** Walk the source-level undo stack back one step. */
  undo(): void {
    this.current()?.undo()
  }

  /** Walk the source-level undo stack forward one step. */
  redo(): void {
    this.current()?.redo()
  }

  /** Dismiss the trigger menu. */
  dismissPopup(): void {
    this.current()?.dismissPopup()
  }

  /**
   * Keyboard arbitration while the menu is open.
   * @param key - the gesture direction.
   */
  arbitrate(key: 'up' | 'down' | 'enter' | 'escape' | 'tab'): void {
    this.current()?.arbitrate(key)
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The rich composer action face stock keybindings reach. */
    composer: RichComposerServiceFace
  }
}

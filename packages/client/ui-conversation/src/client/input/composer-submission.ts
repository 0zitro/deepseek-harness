/** Global composer submission entry point: the face actions call to submit the current draft. */
import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import type { ISessions } from '@deepseek-ai/dsh-client-runtime/client'
import type { ComposerSubmitGesture, InputSubmitMode } from '../contract/composer-submission.ts'
import type { SessionInputShell } from './facade.ts'
import type { InputHub } from './hub.ts'
import type { ComposerSubmissionPolicy } from './submission-policy.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    composer: ComposerSubmission
  }
}

/**
 * Global composer submission. Resolves the current session's input shell and
 * submits its draft. `send` is the aggregate — the busy-Enter preference
 * resolves queue versus steer — while `queue` and `steer` are raw and ignore
 * the preference, so binding them is an explicit opt-out.
 */
export class ComposerSubmission extends Service {
  constructor(
    ctx: Context,
    private readonly deps: {
      inputHub: InputHub
      policy: ComposerSubmissionPolicy
      sessions: ISessions
    },
  ) {
    super(ctx, 'composer')
  }

  /** Aggregate send: the preference resolves queue versus steer. */
  send(): void {
    this.submitResolved('enter')
  }

  /** Raw queue, ignoring the preference. */
  queue(): void {
    this.submit('queue')
  }

  /** Raw steer, ignoring the preference; an empty draft steers the whole queue. */
  steer(): void {
    const shell = this.currentShell()
    if (shell === undefined) return
    const session = this.currentSession()
    if (this.canSteerQueue(shell, session)) shell.steerQueue()
    else shell.submit('steer')
  }

  /** Undo the latest draft transaction. */
  undo(): void {
    this.currentShell()?.undo()
  }

  /** Redo the latest undone transaction. */
  redo(): void {
    this.currentShell()?.redo()
  }

  /** Dismiss the composer popup and close any open menu. */
  dismissPopup(): void {
    const shell = this.currentShell()
    if (shell === undefined) return
    shell.dismissPopup()
    shell.arbitrate('escape', false)
  }

  /** Feed a menu-arbitration key to the shell's popup controller. */
  arbitrate(key: 'up' | 'down' | 'enter' | 'escape'): void {
    this.currentShell()?.arbitrate(key, false)
  }

  /** Space adjudication over the leading token. */
  space(): void {
    this.currentShell()?.space()
  }

  private submitResolved(gesture: ComposerSubmitGesture): void {
    const shell = this.currentShell()
    if (shell === undefined) return
    const session = this.currentSession()
    shell.submit(this.deps.policy.resolve(
      session?.running ?? false,
      gesture,
      session?.origin !== 'subagent',
    ))
  }

  private submit(mode: InputSubmitMode): void {
    this.currentShell()?.submit(mode)
  }

  private canSteerQueue(
    shell: SessionInputShell,
    session: { running: boolean; origin?: 'subagent' } | undefined,
  ): boolean {
    const state = shell.state.getSnapshot()
    return state.draft.trim() === ''
      && (session?.running ?? false)
      && session?.origin !== 'subagent'
      && state.queue.some(row => row.placement === 'queued')
  }

  private currentShell(): SessionInputShell | undefined {
    const id = this.deps.sessions.list.getSnapshot().current
    if (id === undefined) return undefined
    return this.deps.inputHub.shell(id)
  }

  private currentSession() {
    const id = this.deps.sessions.list.getSnapshot().current
    return id === undefined ? undefined : this.deps.sessions.list.getSnapshot().byId[id]
  }
}

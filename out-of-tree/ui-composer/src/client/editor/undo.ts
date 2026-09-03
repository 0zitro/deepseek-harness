/**
 * Undo/redo over the source, not the projection.
 *
 * The editable is plaintext-only, so its whole semantic state is `(text, selection)`; the browser's
 * native undo instead tracks the DOM, which this decoration rewrites every keystroke, so a native
 * undo restores spans we have since replaced and drops the caret. The composer keeps a stack of
 * `(text, selection)` snapshots -- the source, not the projection -- and drives Ctrl/Cmd+Z itself.
 *
 * One stack per position in the message history, not one per composer: walking up the chain and
 * editing what you find there gives that message its own undo, kept while you move on and restored
 * when you come back. The key is the message TEXT the history yielded, never its index -- a send
 * shifts every index by one, where the text a position was recalled from is the same text on the
 * next visit. Two identical past messages share a slot, which is the one thing this trades away:
 * they are the same text, so they show the same edit.
 */

import type { HeldSelection } from './selection.ts'

/** The draft's own position, distinct from any recalled message whatever that message says. */
export const DRAFT: unique symbol = Symbol('draft')

/** A place in the message chain: the draft, or the text a recalled message carries. */
export type Position = string | typeof DRAFT

/** A text and the selection over it. */
export interface Snapshot {
  text: string
  start: number | null
  end: number | null
  backward: boolean
}

/** Consecutive same-kind, non-whitespace keystrokes within this idle window coalesce into one undo
 * step, so a single undo drops a word rather than a letter; a pause or a space starts a new step. */
const HISTORY_IDLE_MS = 600

interface Stack {
  stack: Snapshot[]
  index: number
  kind: string | null
  at: number
}

export class SourceHistory {
  private readonly stacks = new Map<Position, Stack>()
  private readonly texts = new Map<Position, string>()
  private current: Stack
  private where: Position = DRAFT

  constructor(initialText: string) {
    this.current = this.seed(DRAFT, initialText)
  }

  /** The position the composer currently sits at. */
  get position(): Position {
    return this.where
  }

  /** Whether the composer sits on the draft, as opposed to a recalled message. */
  get atDraft(): boolean {
    return this.where === DRAFT
  }

  /**
   * The stack of one position, created empty when never seen.
   * @param key - the position.
   * @param text - the text it starts holding.
   */
  seed(key: Position, text: string): Stack {
    let held = this.stacks.get(key)
    if (held === undefined) {
      held = {
        stack: [{ text, start: null, end: null, backward: false }],
        index: 0,
        kind: null,
        at: 0,
      }
      this.stacks.set(key, held)
    }
    return held
  }

  /**
   * Record the state after an edit. Same-kind contiguous single-character edits within the idle
   * window coalesce into the current step; a paste (a larger jump) always stands as its own step.
   * @param text - the text now held.
   * @param sel - the selection now live, or null when none is.
   */
  record(text: string, sel: HeldSelection | null): void {
    const history = this.current
    const cur = history.stack[history.index]!
    if (text === cur.text) {
      // A bare selection move refreshes the current step, adds no history.
      cur.start = sel?.start ?? null
      cur.end = sel?.end ?? null
      cur.backward = sel?.backward ?? false
      return
    }
    const now = Date.now()
    const delta = text.length - cur.text.length
    const kind = delta > 0 ? 'ins' : delta < 0 ? 'del' : 'rep'
    // A whitespace insertion ends the current word-group; otherwise a single-char same-kind edit
    // within the idle window extends it.
    const caret = sel?.start ?? null
    const breaks = kind === 'ins' && /\s/.test(caret !== null ? text[caret - 1] ?? '' : '')
    const coalesce = kind === history.kind && Math.abs(delta) === 1 && !breaks && now - history.at < HISTORY_IDLE_MS
    history.stack.length = history.index + 1
    const shot: Snapshot = { text, start: sel?.start ?? null, end: sel?.end ?? null, backward: sel?.backward ?? false }
    if (coalesce) history.stack[history.index] = shot
    else {
      history.stack.push(shot)
      history.index++
    }
    history.kind = kind
    history.at = now
  }

  /**
   * Keep the current step's selection live between edits: the observer fires only on text
   * mutations, but a caret or selection move fires `selectionchange`. Tracking it means the step
   * BEFORE an edit holds the pre-edit selection, so undoing a replace re-selects exactly what was
   * replaced.
   * @param text - the text now held.
   * @param sel - the selection now live.
   */
  trackSelection(text: string, sel: HeldSelection): void {
    const cur = this.current.stack[this.current.index]
    if (cur === undefined || text !== cur.text) return
    cur.start = sel.start
    cur.end = sel.end
    cur.backward = sel.backward
  }

  /** Whether an undo exists at the current position. */
  get canUndo(): boolean {
    return this.current.index > 0
  }

  /** Whether a redo exists at the current position. */
  get canRedo(): boolean {
    return this.current.index < this.current.stack.length - 1
  }

  /**
   * Take the step back. An edit after an undo starts a fresh group, never coalescing across the
   * boundary -- which is why the kind is dropped here rather than by the caller.
   * @returns the snapshot to restore, or null when history is exhausted.
   */
  undo(): Snapshot | null {
    if (!this.canUndo) return null
    this.current.kind = null
    this.current.index--
    return this.current.stack[this.current.index] ?? null
  }

  /**
   * Take the step forward.
   * @returns the snapshot to restore, or null when already at the newest.
   */
  redo(): Snapshot | null {
    if (!this.canRedo) return null
    this.current.kind = null
    this.current.index++
    return this.current.stack[this.current.index] ?? null
  }

  /**
   * Leaving a position: hold what it currently shows, before whatever overwrites it. This runs
   * before the text goes away, while it still exists.
   * @param text - the text the position shows now.
   */
  leaving(text: string): void {
    this.texts.set(this.where, text)
  }

  /**
   * Arriving at a position. What is actually shown is whatever that position was last left holding,
   * so an edit made there survives being navigated away from and comes back on the return trip.
   * @param key - the position arrived at.
   * @param original - the text the position's history started from.
   * @returns the text to show and the selection to put the caret at (0 or end, by the edge the
   *   recall came from).
   */
  arrive(key: Position, original: string): { shown: string; atStart: boolean } {
    const shown = this.texts.get(key) ?? original
    this.texts.set(key, shown)
    this.where = key
    this.current = this.seed(key, shown)
    this.current.kind = null // an edit after arriving starts its own group
    return { shown, atStart: false }
  }

  /**
   * A send empties the composer and returns to the draft. Only the draft's slot is dropped; every
   * message keeps its stack, so the chain stays walkable and nothing is lost.
   */
  sent(): void {
    this.texts.delete(DRAFT)
    this.stacks.delete(DRAFT)
    this.where = DRAFT
    this.current = this.seed(DRAFT, '')
  }
}

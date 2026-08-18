/**
 * Chord matching: start a pending chord, advance it, complete it, or reset it.
 *
 * A gesture first resolves against any pending chord; a mismatch resets and
 * the gesture is then tried as the first stroke of a fresh binding. The
 * timeout that cancels a pending chord is the consumer's concern — the matcher
 * is timer-agnostic and exposes `progress` plus `cancel()`.
 */
import type { KeyGesture, Keybinding, KeyStroke } from './keybinding.ts'
import { strokeMatches } from './keybinding.ts'

/** A partially-matched chord: which binding, and which stroke is next. */
export interface ChordProgress<T extends Keybinding = Keybinding> {
  binding: T
  /** Index of the next stroke to match. */
  next: number
}

/** Outcome of feeding one gesture into a pending chord. */
export type ChordAdvance<T extends Keybinding = Keybinding> =
  | { kind: 'advance'; progress: ChordProgress<T> }
  | { kind: 'complete'; binding: T }
  | { kind: 'reset' }

/**
 * Advance a pending chord by one gesture.
 * @param progress - the chord in flight and the stroke it expects next.
 * @param gesture - the gesture just pressed.
 * @returns the chord advanced, completed, or reset by a stroke that misses.
 */
export function advanceChord<T extends Keybinding>(progress: ChordProgress<T>, gesture: KeyGesture): ChordAdvance<T> {
  const stroke = progress.binding.strokes[progress.next]
  if (stroke === undefined || !strokeMatches(gesture, stroke)) return { kind: 'reset' }
  if (progress.next + 1 === progress.binding.strokes.length) {
    return { kind: 'complete', binding: progress.binding }
  }
  return { kind: 'advance', progress: { binding: progress.binding, next: progress.next + 1 } }
}

/** First-stroke resolution against a set of active bindings. */
export type ChordStart<T extends Keybinding = Keybinding> =
  | { kind: 'simple'; binding: T }
  | { kind: 'chord'; progress: ChordProgress<T> }
  | { kind: 'none' }

/**
 * Resolve a gesture as the first stroke of the first active, matching binding.
 * The order of `bindings` is the order dispatch resolves them in, so the first
 * match wins and nothing later is consulted.
 * @param bindings - the candidates, in the order they are to be resolved.
 * @param gesture - the gesture just pressed.
 * @param active - whether a binding's own conditions currently hold.
 * @returns a binding matched outright, a chord begun, or neither.
 */
export function matchStart<T extends Keybinding>(
  bindings: readonly T[],
  gesture: KeyGesture,
  active: (binding: T) => boolean,
): ChordStart<T> {
  for (const binding of bindings) {
    if (!active(binding)) continue
    const first = binding.strokes[0]
    if (first === undefined || !strokeMatches(gesture, first)) continue
    if (binding.strokes.length === 1) return { kind: 'simple', binding }
    return { kind: 'chord', progress: { binding, next: 1 } }
  }
  return { kind: 'none' }
}

/**
 * Stateful chord matcher over one ordered binding set. `active` gates each
 * binding on the current context, so a `when` clause already resolved by the
 * consumer only needs to be consulted here.
 */
export class ChordMatcher<T extends Keybinding = Keybinding> {
  private pending: ChordProgress<T> | null = null

  /**
   * @param bindings - candidates in priority order (first match wins).
   * @param active - whether a binding's `when` clause currently holds.
   */
  constructor(
    private readonly bindings: readonly T[],
    private readonly active: (binding: T) => boolean,
  ) {}

  /** The in-progress chord, or null when none is pending. */
  get progress(): ChordProgress<T> | null {
    return this.pending
  }

  /**
   * Feed one gesture. A mismatch resets any pending chord, and the gesture is
   * then tried as a fresh start rather than being swallowed by the chord it
   * failed to continue.
   * @param gesture - the gesture just pressed.
   * @returns the binding that completed, or null while none has.
   */
  feed(gesture: KeyGesture): T | null {
    if (this.pending !== null) {
      const result = advanceChord(this.pending, gesture)
      if (result.kind === 'complete') {
        this.pending = null
        return result.binding
      }
      if (result.kind === 'advance') {
        this.pending = result.progress
        return null
      }
      this.pending = null
    }
    const started = matchStart(this.bindings, gesture, this.active)
    if (started.kind === 'simple') return started.binding
    if (started.kind === 'chord') {
      this.pending = started.progress
      return null
    }
    return null
  }

  /** Drop any pending chord, e.g. on timeout, blur, or non-key input. */
  cancel(): void {
    this.pending = null
  }
}

/**
 * Whether a stroke list denotes a chord rather than a single gesture.
 * @param strokes - the binding's strokes.
 * @returns true once there is more than one.
 */
export function isChord(strokes: readonly KeyStroke[]): boolean {
  return strokes.length > 1
}

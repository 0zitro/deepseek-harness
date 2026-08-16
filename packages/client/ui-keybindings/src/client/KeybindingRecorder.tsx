/** A binding's chord recorder: shows committed strokes as `<kbd>` chips and captures a new chord. */
import { useEffect, useState } from 'react'
import type { KeybindingModifier, KeyStroke } from '../keybinding.ts'
import {
  KEYBINDING_MODIFIER_LABELS, keybindingKeyLabel, modifiersOf, strokeFromEvent,
} from '../keybinding.ts'
import css from './keybindings.module.css'

/** Modifier key names keyed by their `KeyboardEvent.key` value. */
const MODIFIER_KEY_TO_NAME: Record<string, KeybindingModifier> = {
  Control: 'ctrl',
  Meta: 'meta',
  Alt: 'alt',
  Shift: 'shift',
}

/**
 * Lock keys that may stand in for a released modifier under xkb remaps (a
 * shift-latch delivers `CapsLock` on the shift keyup); any lock release resets
 * the pressed set so a modifier never lingers.
 */
const LOCK_KEYS = new Set(['CapsLock', 'NumLock', 'ScrollLock'])

export interface KeybindingRecorderProps {
  /** Current persisted strokes. */
  strokes: KeyStroke[]
  /** Persist a newly recorded chord (one or more strokes). */
  onStrokesChange: (strokes: KeyStroke[]) => void
  /** Accessible name of the action being bound. */
  label: string
  /** Localized label for the explicit finalize button. */
  doneLabel: string
}

/** One stroke rendered as its modifier and key chips. */
function StrokeChips({ stroke }: { stroke: KeyStroke }) {
  return (
    <span className={css.strokeGroup}>
      {stroke.modifiers.map((modifier, index) => (
        <kbd key={`${modifier}-${index}`} className={css.chip}>{KEYBINDING_MODIFIER_LABELS[modifier]}</kbd>
      ))}
      <kbd className={css.chip}>{keybindingKeyLabel(stroke.key)}</kbd>
    </span>
  )
}

/** Human description of a stroke list plus the currently held modifiers. */
function describe(strokes: readonly KeyStroke[], held: readonly KeybindingModifier[]): string {
  const parts = strokes.map(stroke => [
    ...stroke.modifiers.map(modifier => KEYBINDING_MODIFIER_LABELS[modifier]),
    keybindingKeyLabel(stroke.key),
  ].join(' + '))
  if (held.length > 0) parts.push(`${held.map(modifier => KEYBINDING_MODIFIER_LABELS[modifier]).join(' + ')} …`)
  return parts.join(' then ') || 'Press keys'
}

/**
 * Render one action's chord as a click-to-record button. Clicking arms the
 * recorder; keystrokes are captured at the window so focus never matters, each
 * non-modifier keydown appends a stroke, and held modifiers stay visible as
 * pressed chips until their keyup. A separate Done button finalizes the chord,
 * Escape or blur cancels, and plain Backspace removes the last stroke — so a
 * bare Enter is an ordinary stroke, not a commit gesture.
 */
export function KeybindingRecorder({ strokes, onStrokesChange, label, doneLabel }: KeybindingRecorderProps) {
  const [recording, setRecording] = useState(false)
  const [held, setHeld] = useState<KeybindingModifier[]>([])
  const [draft, setDraft] = useState<KeyStroke[]>([])

  const start = () => {
    setRecording(true)
    setHeld([])
    setDraft([])
  }
  const cancel = () => {
    setRecording(false)
    setHeld([])
    setDraft([])
  }
  const commit = () => {
    if (draft.length > 0) onStrokesChange(draft)
    cancel()
  }

  useEffect(() => {
    if (!recording) return

    const onKeyDown = (event: KeyboardEvent) => {
      /* v8 ignore next -- jsdom cannot synthesize isComposing on a native KeyboardEvent */
      if (event.isComposing) return
      // Auto-repeat keydowns are not distinct presses; ignore them.
      if (event.repeat) return
      event.preventDefault()

      if (event.key === 'Escape') {
        setRecording(false)
        setHeld([])
        setDraft([])
        return
      }

      // The pressed set always mirrors the modifiers of the current event:
      // this shows a held modifier before the stroke on browsers that deliver
      // modifier keydown, and keeps the chord preview where they do not.
      const heldNow = modifiersOf(event)

      if (event.key === 'Backspace' && heldNow.length === 0) {
        setDraft(value => value.slice(0, -1))
        return
      }

      const recorded = strokeFromEvent(event)
      if (recorded !== null) setDraft(value => [...value, recorded])
      setHeld(heldNow)
    }

    const onKeyUp = (event: KeyboardEvent) => {
      if (LOCK_KEYS.has(event.key)) {
        setHeld([])
        return
      }
      const modifier = MODIFIER_KEY_TO_NAME[event.key]
      if (modifier !== undefined) setHeld(value => value.filter(name => name !== modifier))
    }

    window.addEventListener('keydown', onKeyDown, { capture: true })
    window.addEventListener('keyup', onKeyUp, { capture: true })
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true })
      window.removeEventListener('keyup', onKeyUp, { capture: true })
    }
  }, [recording])

  const described = recording ? describe(draft, held) : describe(strokes, [])

  return (
    <div className={css.recorderRow}>
      <button
        type="button"
        className={css.recorder}
        data-recording={recording || undefined}
        aria-label={`${label}: ${described}`}
        onClick={() => { if (!recording) start() }}
        onBlur={cancel}
      >
        {recording
          ? (
            <>
              {draft.map((stroke, index) => <StrokeChips key={index} stroke={stroke} />)}
              {held.length > 0 && (
                <span className={css.strokeGroup}>
                  {held.map((modifier, index) => (
                    <kbd key={`held-${modifier}-${index}`} className={`${css.chip} ${css.chipPressed}`}>
                      {KEYBINDING_MODIFIER_LABELS[modifier]}
                    </kbd>
                  ))}
                  <kbd className={`${css.chip} ${css.chipPlaceholder}`}>…</kbd>
                </span>
              )}
              {draft.length === 0 && held.length === 0 && <kbd className={`${css.chip} ${css.chipPlaceholder}`}>Press keys</kbd>}
            </>
          )
          : (
            strokes.length === 0
              ? <kbd className={`${css.chip} ${css.chipPlaceholder}`}>Press keys</kbd>
              : strokes.map((stroke, index) => <StrokeChips key={index} stroke={stroke} />)
          )}
      </button>
      {recording && (
        <button
          type="button"
          className={css.done}
          onPointerDown={(event) => { event.preventDefault() }}
          onClick={commit}
        >
          {doneLabel}
        </button>
      )}
    </div>
  )
}

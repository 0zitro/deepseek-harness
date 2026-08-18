/** A binding's chord recorder: shows committed strokes as `<kbd>` chips and captures a new chord. */
import { useEffect, useRef, useState } from 'react'
import type { KeybindingModifier, KeyStroke } from '../keybinding.ts'
import {
  KEYBINDING_MODIFIER_LABELS, keybindingKeyLabel, modifiersOf, strokeFromEvent,
} from '../keybinding.ts'
import { StrokeChips } from './StrokeChips.tsx'
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
  /** Whether this recorder starts recording, for a binding just added. */
  armed?: boolean
  /** Current persisted strokes. */
  strokes: KeyStroke[]
  /** Persist a newly recorded chord (one or more strokes). */
  onStrokesChange: (strokes: KeyStroke[]) => void
  /** Accessible name of the action being bound. */
  label: string
  /** Localized label for the control that finalizes a recording. */
  doneLabel: string
  /** Localized label for the control that unbinds the action. */
  clearLabel: string
}

/**
 * The recorder's two controls, drawn rather than written: they share a cell
 * the width of one control, so a checkmark and a cross must read at the same
 * small size whatever font is installed.
 */
function CheckMark() {
  return (
    <svg viewBox="0 0 12 12" width="12" height="12">
      <path d="M2.5 6.5L5 9l4.5-6" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Cross() {
  return (
    <svg viewBox="0 0 12 12" width="12" height="12">
      <path d="M3 3l6 6M9 3l-6 6" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
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
export function KeybindingRecorder(
  { armed = false, strokes, onStrokesChange, label, doneLabel, clearLabel }: KeybindingRecorderProps,
) {
  const [recording, setRecording] = useState(armed)
  const [held, setHeld] = useState<KeybindingModifier[]>([])
  const [draft, setDraft] = useState<KeyStroke[]>([])
  const [hovered, setHovered] = useState(false)
  const strokeStrip = useRef<HTMLSpanElement>(null)
  const recorder = useRef<HTMLButtonElement>(null)

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
  // Unbinding is a gesture of no strokes: the binding stays the user's, states
  // a gesture nothing can match, and can be recorded over again.
  const clear = () => { onStrokesChange([]) }

  // A control shows while recording, and on hover when there is a binding to
  // clear. The recorder holds room for one either way, so the chips it shows
  // sit in the same place whether a control is there or not.
  const clearable = !recording && hovered && strokes.length > 0
  const control = recording || clearable

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

  // A recorder that starts armed takes focus with it. Recording cancels on
  // blur, and blur cannot arrive at something that was never focused: without
  // this it would keep capturing the window after the user moved on.
  // Focus follows arming, which happens once: `armed` names the recorder the
  // user just asked for, and the row carrying it is new.
  useEffect(() => {
    if (armed) recorder.current?.focus()
  }, [armed])

  // A chord wider than its column records off the end of the strip unless the
  // strip follows its own tail: chips append at the inline end, and the stroke
  // that was just pressed is the one that has to be visible. Only while
  // recording — a committed gesture reads from its start.
  useEffect(() => {
    const strip = strokeStrip.current
    /* v8 ignore next -- the strip is mounted for as long as the recorder is */
    if (strip === null || !recording) return

    // Scroll offsets are physical: under RTL the scrollable range runs the
    // other way, so the end of the content is the negative extreme.
    const towardEnd = getComputedStyle(strip).direction === 'rtl' ? -1 : 1
    strip.scrollLeft = strip.scrollWidth * towardEnd
  }, [recording, draft, held])

  const described = recording ? describe(draft, held) : describe(strokes, [])

  return (
    <div
      className={css.recorderRow}
      onPointerEnter={() => { setHovered(true) }}
      onPointerLeave={() => { setHovered(false) }}
    >
      <button
        type="button"
        ref={recorder}
        className={css.recorder}
        data-recording={recording || undefined}
        aria-label={`${label}: ${described}`}
        onClick={() => { if (!recording) start() }}
        onBlur={cancel}
      >
        {/* A button is not a layout container: the reservation lives one level
            down, where a grid actually takes effect. */}
        <span className={css.recorderLayout} data-control={control || undefined}>
          <span className={css.strokes} ref={strokeStrip}>
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
          </span>
        </span>
      </button>
      {control && (
        <button
          type="button"
          className={`${css.ghost} ${css.recorderControl}`}
          aria-label={recording ? doneLabel : clearLabel}
          // The recorder keeps focus, so pressing the control does not cancel
          // the recording it is meant to finish.
          onPointerDown={(event) => { event.preventDefault() }}
          onClick={recording ? commit : clear}
        >
          {recording ? <CheckMark /> : <Cross />}
        </button>
      )}
    </div>
  )
}

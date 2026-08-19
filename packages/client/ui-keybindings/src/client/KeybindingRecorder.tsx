/** A binding's chord recorder: shows committed strokes as `<kbd>` chips and captures a new chord. */
import { useEffect, useRef, useState } from 'react'
import { ScrollingRun } from '@deepseek-ai/dsh-client-ui-primitives'
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

/**
 * The room the floating control takes out of the strip: the control's own box,
 * plus the inset it sits at. A copy rather than a width, so the two cannot
 * disagree — and a span rather than a button, since this one goes inside the
 * recorder and a control may not nest in a control.
 */
export function ControlRoom() {
  return (
    <span className={css.controlRoom}>
      <span className={css.ghost}><CheckMark /></span>
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

  /** Put the strip's own end under the reader's eye, whichever way it runs. */
  const followTail = (strip: HTMLSpanElement) => {
    // Scroll offsets are physical: under RTL the scrollable range runs the
    // other way, so the end of the content is the negative extreme.
    const towardEnd = getComputedStyle(strip).direction === 'rtl' ? -1 : 1
    strip.scrollLeft = strip.scrollWidth * towardEnd
  }

  // A chord wider than its column records off the end of the strip unless the
  // strip follows its own tail: chips append at the inline end, and the stroke
  // that was just pressed is the one that has to be visible. Only while
  // recording — a committed gesture reads from its start.
  useEffect(() => {
    const strip = strokeStrip.current
    /* v8 ignore next -- the strip is mounted for as long as the recorder is */
    if (strip === null || !recording) return
    followTail(strip)
  }, [recording, draft, held])

  // Where the reader had the strip while the control's room was in it. That
  // room leaves the scroll content with the control, so the range shrinks under
  // the offset and the engine clamps it — discarding the position before
  // anything here could read it. Writing it down while it still exists is the
  // only way to give it back.
  const parked = useRef<number | null>(null)

  useEffect(() => {
    const strip = strokeStrip.current
    /* v8 ignore next -- the strip is mounted for as long as the recorder is */
    if (strip === null) return

    // The scroll the engine causes by clamping arrives once the room has
    // already gone, and reports where the strip was forced to rather than where
    // the reader put it. The room's presence is what tells the two apart.
    const remember = () => {
      if (strip.childElementCount > 1) parked.current = strip.scrollLeft
    }
    strip.addEventListener('scroll', remember)
    return () => { strip.removeEventListener('scroll', remember) }
  }, [])

  // The room returns with the control and the range grows again, under an
  // offset the clamp has already moved. Giving that offset back leaves the
  // strip exactly where its reader left it, overlap and all: inside a leeway
  // this small the whole point is that nothing moves, and a jump of a full
  // room reads worse than a control standing over the last stroke.
  useEffect(() => {
    const strip = strokeStrip.current
    /* v8 ignore next -- the strip is mounted for as long as the recorder is */
    if (strip === null || !control) return

    const room = strip.lastElementChild
    /* v8 ignore next -- the run puts the room in the strip exactly while it is
       taken, which is what `control` says */
    if (room === null) return

    // Only a strip still sitting where the clamp put it has a place to be given
    // back; one moved since is where its reader chose to be.
    const clamped = strip.scrollWidth - strip.clientWidth - room.getBoundingClientRect().width
    if (parked.current !== null && Math.abs(Math.abs(strip.scrollLeft) - clamped) < 1) {
      strip.scrollLeft = parked.current
    }
  }, [control])

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
        <ScrollingRun
          className={css.recorderLayout}
          ref={strokeStrip}
          reserve={<ControlRoom />}
          occupied={control}
        >
          <span className={css.strokeStrip}>
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
        </ScrollingRun>
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

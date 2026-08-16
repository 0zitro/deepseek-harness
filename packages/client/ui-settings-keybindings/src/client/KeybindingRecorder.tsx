/** A single binding's recorder: shows the current binding as `<kbd>` chips and captures a new one. */
import { useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { Keybinding, KeybindingModifier } from '../keybinding.ts'
import {
  KEYBINDING_MODIFIER_LABELS, keybindingFromEvent, keybindingKeyLabel,
  keybindingLabels, modifiersOf,
} from '../keybinding.ts'
import css from './keybindings.module.css'

export interface KeybindingRecorderProps {
  /** Current persisted binding. */
  binding: Keybinding
  /** Persist a newly recorded binding. */
  onChange: (next: Keybinding) => void
  /** Accessible name of the action being bound. */
  label: string
}

/** Ordered chip labels for an in-progress capture (key may still be unset). */
function captureChips(modifiers: KeybindingModifier[], key: string | null): string[] {
  const result = modifiers.map(modifier => KEYBINDING_MODIFIER_LABELS[modifier])
  if (key !== null) result.push(keybindingKeyLabel(key))
  return result
}

/**
 * Render one action's binding as a click-to-record button. Clicking arms the
 * recorder; the next non-modifier keydown commits, Escape cancels, and blur
 * disarms without persisting. Lone modifier presses update the live preview
 * so the user sees Ctrl / Alt / Shift accumulate before they press the key.
 */
export function KeybindingRecorder({ binding, onChange, label }: KeybindingRecorderProps) {
  const [listening, setListening] = useState(false)
  const [live, setLive] = useState<KeybindingModifier[]>([])

  const disarm = () => {
    setListening(false)
    setLive([])
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (!listening) return
    // IME composition never records a binding.
    if (event.nativeEvent.isComposing) return
    // Escape cancels without persisting.
    if (event.key === 'Escape') {
      event.preventDefault()
      disarm()
      return
    }
    const recorded = keybindingFromEvent(event)
    if (recorded === null) {
      // A lone modifier key: keep listening, preview the held set.
      event.preventDefault()
      setLive(modifiersOf(event))
      return
    }
    event.preventDefault()
    event.stopPropagation()
    onChange(recorded)
    disarm()
  }

  const displayed = listening ? captureChips(live, null) : keybindingLabels(binding)

  return (
    <button
      type="button"
      className={css.recorder}
      data-listening={listening || undefined}
      aria-label={`${label}: ${displayed.join(' + ') || 'Press keys'}`}
      onClick={() => { setListening(value => !value); setLive([]) }}
      onKeyDown={onKeyDown}
      onBlur={disarm}
    >
      {displayed.length === 0
        ? <kbd className={`${css.chip} ${css.chipPlaceholder}`}>Press keys</kbd>
        : displayed.map((chip, index) => (
          <kbd key={`${chip}-${index}`} className={css.chip}>{chip}</kbd>
        ))}
    </button>
  )
}

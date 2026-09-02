/** How a gesture is spelled wherever one is shown: one `<kbd>` chip per key. */
import { KEYBINDING_MODIFIER_LABELS, keybindingKeyLabel, type KeyStroke } from '../keybinding.ts'
import css from './keybindings.module.css'

/** One stroke rendered as its modifier and key chips. */
export function StrokeChips({ stroke }: { stroke: KeyStroke }) {
  return (
    <span className={css.strokeGroup}>
      {stroke.modifiers.map((modifier, index) => (
        <kbd key={`${modifier}-${index}`} className={css.chip}>{KEYBINDING_MODIFIER_LABELS[modifier]}</kbd>
      ))}
      <kbd className={css.chip}>{keybindingKeyLabel(stroke.key)}</kbd>
    </span>
  )
}

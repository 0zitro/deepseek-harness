/**
 * Draft state for an edited field.
 *
 * Every field on the keybindings page commits on blur rather than on
 * keystroke, so an intermediate value is never stored, never dispatched, and
 * never seen by another client. The key recorder is the one exception: a
 * gesture has no meaningful intermediate form, so it commits when recording
 * finishes. This hook owns only the draft's relationship to the stored value;
 * each field owns when its draft is fit to commit.
 */
import { useState } from 'react'

/**
 * Hold an editable draft that follows the stored value until the user edits it.
 * @param stored - the committed value the field displays.
 * @returns the current draft and the setter its input calls while typing.
 */
export function useDraft(stored: string): [string, (next: string) => void] {
  const [draft, setDraft] = useState(stored)
  const [adopted, setAdopted] = useState(stored)

  // A stored value that changed underneath the field (another window, a reset)
  // replaces the draft; adjusting during render keeps it out of an effect pass.
  if (adopted !== stored) {
    setAdopted(stored)
    setDraft(stored)
  }

  return [draft, setDraft]
}

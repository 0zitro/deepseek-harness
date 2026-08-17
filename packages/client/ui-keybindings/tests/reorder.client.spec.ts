import { describe, expect, it } from 'vitest'
import { keybindingKey, type KeyStroke, type SourcedOverride } from '../src/keybinding.ts'
import type { UiActionId } from '../src/ui-action.ts'
import type { UiActionDefinition } from '../src/client/action-registry.ts'
import { keybindingRows, type KeybindingRow } from '../src/client/rows.ts'
import { insertPrio } from '../src/client/reorder.ts'

const ENTER: KeyStroke[] = [{ key: 'Enter', modifiers: [] }]
const ESCAPE: KeyStroke[] = [{ key: 'Escape', modifiers: [] }]

const ids = ['cmd.a', 'cmd.b', 'cmd.c'] as UiActionId[]
const [A, B, C] = ids as [UiActionId, UiActionId, UiActionId]

const action = (id: UiActionId, strokes: KeyStroke[] = ENTER): UiActionDefinition =>
  ({ id, label: id, defaultKeybindings: [{ key: keybindingKey(id), strokes }], run: () => {} })

const override = (id: UiActionId, prio?: number, strokes: KeyStroke[] = ENTER): SourcedOverride => ({
  action: id,
  key: keybindingKey(id),
  source: 'user',
  base: { strokes },
  strokes,
  ...(prio === undefined ? {} : { prio }),
})

const rowOf = (rows: readonly KeybindingRow[], id: UiActionId): KeybindingRow => {
  const row = rows.find(candidate => candidate.action === id)
  if (row === undefined) throw new Error(`no row for ${id}`)
  return row
}

/** Every action registered, so nothing is unavailable unless a test says so. */
const registered = (only: readonly UiActionId[] = ids) => (id: UiActionId) => only.includes(id)

describe('insertPrio', () => {
  it('places the binding and moves the scope back one', () => {
    const actions = [action(A), action(B), action(C)]
    const rows = keybindingRows(actions, [override(A, 0), override(B, 1), override(C, 2)])

    const moved = insertPrio(rows, rowOf(rows, C), 0, registered())

    expect(moved).toEqual([
      { ref: { action: C, key: keybindingKey(C) }, prio: 0 },
      { ref: { action: A, key: keybindingKey(A) }, prio: 1 },
      { ref: { action: B, key: keybindingKey(B) }, prio: 2 },
    ])
  })

  it('leaves the bindings that already order ahead of the target', () => {
    const actions = [action(A), action(B), action(C)]
    const rows = keybindingRows(actions, [override(A, 0), override(B, 1), override(C, 2)])

    const moved = insertPrio(rows, rowOf(rows, C), 1, registered())

    expect(moved).toEqual([
      { ref: { action: C, key: keybindingKey(C) }, prio: 1 },
      { ref: { action: B, key: keybindingKey(B) }, prio: 2 },
    ])
  })

  it('touches nothing outside the scope the binding competes in', () => {
    const actions = [action(A), action(B, ESCAPE)]
    const rows = keybindingRows(actions, [override(A, 0), override(B, 0, ESCAPE)])

    const moved = insertPrio(rows, rowOf(rows, A), 0, registered())

    // B holds priority 0 too, on a gesture that never meets A's.
    expect(moved).toEqual([{ ref: { action: A, key: keybindingKey(A) }, prio: 0 }])
  })

  it('retires the priority of a binding whose command is unavailable', () => {
    const actions = [action(A), action(C)]
    const rows = keybindingRows(actions, [override(A, 0), override(B, 1), override(C, 2)])

    // B's command is not registered, so it cannot use a place in the order.
    const moved = insertPrio(rows, rowOf(rows, C), 1, registered([A, C]))

    expect(moved).toEqual([
      { ref: { action: C, key: keybindingKey(C) }, prio: 1 },
      { ref: { action: B, key: keybindingKey(B) }, prio: undefined },
    ])
  })
})

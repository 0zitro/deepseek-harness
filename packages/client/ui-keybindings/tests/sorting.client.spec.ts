import { describe, expect, it } from 'vitest'
import { keybindingKey, pluginId, type KeyStroke, type SourcedOverride } from '../src/keybinding.ts'
import type { UiActionId } from '../src/ui-action.ts'
import type { UiActionDefinition } from '../src/client/action-registry.ts'
import { keybindingRows, type KeybindingRow } from '../src/client/rows.ts'
import { sortRows, type ColumnSort } from '@deepseek-ai/dsh-client-ui-primitives'
import { COLUMNS } from '../src/client/sorting.ts'

const stroke = (key: string, ...modifiers: KeyStroke['modifiers']): KeyStroke[] => [{ key, modifiers }]

const action = (id: string, strokes: KeyStroke[], when?: string): UiActionDefinition => ({
  id: id as UiActionId,
  label: id,
  defaultKeybindings: [{ key: keybindingKey(id), strokes, ...(when === undefined ? {} : { when }) }],
  run: () => {},
})

const ids = (rows: readonly KeybindingRow[]) => rows.map(row => row.action)

describe('column orderings', () => {
  it('orders a command by its segments, not its spelling', () => {
    const rows = keybindingRows([
      action('composer.send', stroke('Enter')),
      action('commandPalette.select', stroke('Enter')),
    ], [])

    expect(ids(sortRows(rows, [{ id: 'command', direction: 'asc' }], COLUMNS)))
      .toEqual(['commandPalette.select', 'composer.send'])
  })

  it('orders a gesture by the key it ends on, not by its modifiers', () => {
    const rows = keybindingRows([
      action('a.one', stroke('b')),
      action('a.two', stroke('a', 'ctrl')),
      action('a.three', stroke('a')),
    ], [])

    // Both bindings on 'a' gather, whatever modifiers they hold, and 'b' follows.
    expect(ids(sortRows(rows, [{ id: 'stroke', direction: 'asc' }], COLUMNS)))
      .toEqual(['a.three', 'a.two', 'a.one'])
  })

  it('orders a source by precedence rather than alphabet', () => {
    const override: SourcedOverride = {
      action: 'a.two' as UiActionId,
      key: keybindingKey('a.two'),
      source: 'user',
      base: { strokes: stroke('b') },
      strokes: stroke('b'),
    }
    const rows = keybindingRows([action('a.one', stroke('a')), action('a.two', stroke('b'))], [override])

    // 'user' sorts before 'system' though it spells after it, and what the
    // overridden seat ships is a system row like any other.
    expect(ids(sortRows(rows, [{ id: 'source', direction: 'asc' }], COLUMNS))).toEqual(['a.two', 'a.one', 'a.two'])
    expect(COLUMNS.every(candidate => candidate.natural === 'asc')).toBe(true)
  })

  it('orders a plugin between the user and the shipped default', () => {
    const contributed: SourcedOverride = {
      action: 'a.two' as UiActionId,
      key: keybindingKey('a.two'),
      source: pluginId('dsh-demo'),
      base: { strokes: stroke('b') },
      strokes: stroke('b'),
    }
    const owned: SourcedOverride = { ...contributed, action: 'a.three' as UiActionId, key: keybindingKey('a.three'), source: 'user' }
    const rows = keybindingRows([
      action('a.one', stroke('a')),
      action('a.two', stroke('b')),
      action('a.three', stroke('c')),
    ], [contributed, owned])

    expect(ids(sortRows(rows, [{ id: 'source', direction: 'asc' }], COLUMNS)))
      .toEqual(['a.three', 'a.two', 'a.one', 'a.three', 'a.two'])
  })

  it('orders a binding that holds no place after every binding that holds one', () => {
    const override: SourcedOverride = {
      action: 'a.one' as UiActionId,
      key: keybindingKey('a.one'),
      source: 'user',
      base: { strokes: stroke('a') },
      strokes: stroke('b'),
    }
    const rows = keybindingRows([action('a.one', stroke('a')), action('a.two', stroke('c'))], [override])

    // The superseded row holds no place, so it reads last however the places
    // themselves order.
    expect(sortRows(rows, [{ id: 'prio', direction: 'asc' }], COLUMNS).map(row => row.superseded))
      .toEqual([false, false, true])
  })
})

describe('sortRows', () => {
  const rows = () => keybindingRows([
    action('b.one', stroke('a'), 'composerActive'),
    action('a.two', stroke('a'), 'overlayOpen'),
    action('c.three', stroke('b')),
  ], [])

  it('returns the rows untouched when nothing is sorted', () => {
    const unsorted = rows()
    expect(sortRows(unsorted, [], COLUMNS)).toBe(unsorted)
  })

  it('consults a second column only where the first ties', () => {
    const order: ColumnSort[] = [
      { id: 'stroke', direction: 'asc' },
      { id: 'command', direction: 'desc' },
    ]
    // 'a' before 'b' by gesture; within 'a', the commands read backwards.
    expect(ids(sortRows(rows(), order, COLUMNS))).toEqual(['b.one', 'a.two', 'c.three'])
  })

  it('reverses a column without disturbing the ones before it', () => {
    const ascending = ids(sortRows(rows(), [{ id: 'when', direction: 'asc' }], COLUMNS))
    const descending = ids(sortRows(rows(), [{ id: 'when', direction: 'desc' }], COLUMNS))
    expect(descending).toEqual([...ascending].reverse())
  })

  it('orders a place toward the binding that wins', () => {
    const contested = keybindingRows([action('a.one', stroke('a')), action('a.two', stroke('a'))], [])
    expect(contested.map(row => row.prio)).toEqual([0, 1])

    expect(ids(sortRows(contested, [{ id: 'prio', direction: 'desc' }], COLUMNS))).toEqual(['a.two', 'a.one'])
  })

  it('keeps the arrangement it was given where every sorted column ties', () => {
    const tied = keybindingRows([action('a.one', stroke('a')), action('a.two', stroke('a'))], [])

    // One gesture, so the gesture column separates nothing.
    expect(ids(sortRows(tied, [{ id: 'stroke', direction: 'asc' }], COLUMNS))).toEqual(ids(tied))
  })

  it('ignores a column that is no longer part of the table', () => {
    const unsorted = rows()
    expect(sortRows(unsorted, [{ id: 'retired', direction: 'asc' }], COLUMNS)).toBe(unsorted)
  })
})

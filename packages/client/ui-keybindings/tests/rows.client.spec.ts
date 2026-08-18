import { describe, expect, it } from 'vitest'
import { keybindingKey, type KeyStroke, type SourcedOverride } from '../src/keybinding.ts'
import { COMPOSER_SEND_ACTION, type UiActionId } from '../src/ui-action.ts'
import type { UiActionDefinition } from '../src/client/action-registry.ts'
import { compareActionIds, keybindingRows } from '../src/client/rows.ts'

const PREVIEW_ACTION = 'composer.preview' as UiActionId
const SEND_KEY = keybindingKey('composer.send')
const ENTER: readonly KeyStroke[] = [{ key: 'Enter', modifiers: [] }]

const sendAction = (): UiActionDefinition => ({
  id: COMPOSER_SEND_ACTION,
  label: 'Send message',
  description: 'Submit the composer',
  defaultKeybindings: [{ key: SEND_KEY, strokes: [...ENTER], when: 'composerActive' }],
  run: () => {},
})

const override = (fields: Partial<SourcedOverride> = {}): SourcedOverride => ({
  action: COMPOSER_SEND_ACTION,
  key: SEND_KEY,
  source: 'user',
  base: { strokes: [...ENTER], when: 'composerActive' },
  ...fields,
})

describe('compareActionIds', () => {
  it('compares segment by segment', () => {
    expect(compareActionIds('commandPalette.select', 'composer.send')).toBeLessThan(0)
    expect(compareActionIds('composer.send', 'composer.redo')).toBeGreaterThan(0)
    expect(compareActionIds('composer.send', 'composer.send')).toBe(0)
  })

  it('sorts a bare segment before one that extends it, either way round', () => {
    expect(compareActionIds('composer', 'composer.send')).toBeLessThan(0)
    expect(compareActionIds('composer.send', 'composer')).toBeGreaterThan(0)
  })
})

describe('keybindingRows', () => {
  it('reports every field as inherited when no override exists', () => {
    const [row] = keybindingRows([sendAction()], [])
    expect(row).toMatchObject({
      action: COMPOSER_SEND_ACTION,
      label: 'Send message',
      description: 'Submit the composer',
      key: SEND_KEY,
      base: { strokes: [...ENTER], when: 'composerActive' },
      overridden: { strokes: false, when: false, prio: false },
    })
    expect(row?.entry).toMatchObject({ strokes: [...ENTER], when: 'composerActive', source: 'system' })
  })

  it('reports exactly the fields the override states', () => {
    // The seat shows what it ships as well, above the binding that took it.
    const [, row] = keybindingRows([sendAction()], [override({ strokes: [{ key: 'Enter', modifiers: ['ctrl'] }] })])
    expect(row?.overridden).toEqual({ strokes: true, when: false, prio: false })
    // The clause still follows the default, which is what makes it inherited.
    expect(row?.entry).toMatchObject({ strokes: [{ key: 'Enter', modifiers: ['ctrl'] }], when: 'composerActive' })
  })

  it('seeds a binding that competes with nothing at zero', () => {
    const rows = keybindingRows([sendAction(), {
      id: PREVIEW_ACTION, label: 'Preview', run: () => {},
      defaultKeybindings: [{ key: keybindingKey('composer.preview'), strokes: [{ key: 'p', modifiers: ['ctrl'] }] }],
    }], [])
    expect(rows.map(row => row.prio)).toEqual([0, 0])
    expect(rows.map(row => row.action)).toEqual([PREVIEW_ACTION, COMPOSER_SEND_ACTION])
  })

  it('numbers two bindings that do compete', () => {
    const rows = keybindingRows([sendAction(), {
      id: PREVIEW_ACTION, label: 'Preview', run: () => {},
      // The same gesture as the send default, so the two are ordered against each other.
      defaultKeybindings: [{ key: keybindingKey('composer.preview'), strokes: [...ENTER] }],
    }], [])
    expect(rows.map(row => [row.action, row.prio])).toEqual([[PREVIEW_ACTION, 1], [COMPOSER_SEND_ACTION, 0]])
  })

  it('keeps a stated prio and marks it overridden', () => {
    const [, row] = keybindingRows([sendAction()], [override({ prio: 7 })])
    expect(row?.prio).toBe(7)
    expect(row?.overridden.prio).toBe(true)
  })

  it('gives an action shipping no default a row to bind in', () => {
    const [row] = keybindingRows([{ id: PREVIEW_ACTION, label: 'Preview', run: () => {} }], [])
    expect(row).toMatchObject({ key: keybindingKey(PREVIEW_ACTION), base: { strokes: [] } })
    expect(row?.entry.strokes).toEqual([])
  })

  it('shows an override of an action shipping no default exactly once', () => {
    const unbound: SourcedOverride = {
      action: PREVIEW_ACTION,
      key: keybindingKey(PREVIEW_ACTION),
      source: 'user',
      base: { strokes: [] },
      strokes: [{ key: 'k', modifiers: ['ctrl'] }],
    }
    const rows = keybindingRows([{ id: PREVIEW_ACTION, label: 'Preview', run: () => {} }], [unbound])

    // The action ships no default, so the row it is given is the only seat the
    // override has; counting it as an orphan too would show it twice.
    expect(rows).toHaveLength(1)
    expect(rows[0]?.entry.strokes).toEqual([{ key: 'k', modifiers: ['ctrl'] }])
    expect(rows[0]?.overridden.strokes).toBe(true)
  })

  it('shows what a seat ships beside the binding that took it', () => {
    const rows = keybindingRows([sendAction()], [override({ strokes: [{ key: 'k', modifiers: ['ctrl'] }] })])

    // The shipped binding is what the override departs from and what returns
    // if the override goes, so it stays on the page — inert, holding no place.
    expect(rows.map(row => [row.entry.strokes, row.superseded, row.prio])).toEqual([
      [[...ENTER], true, undefined],
      [[{ key: 'k', modifiers: ['ctrl'] }], false, 0],
    ])
  })

  it('keeps the shipped binding when the user unbinds the seat', () => {
    const rows = keybindingRows([sendAction()], [override({ strokes: [] })])

    // Unbinding states a gesture nothing can match; it does not remove what
    // the seat ships, which is why the page can still show it.
    expect(rows.map(row => [row.superseded, row.entry.strokes])).toEqual([[true, [...ENTER]], [false, []]])
  })

  it('shows an override whose default is gone against its retained base', () => {
    const rows = keybindingRows([], [override({ strokes: [{ key: 'k', modifiers: ['ctrl'] }] })])
    expect(rows).toHaveLength(1)
    // No registration supplies a label, so the action id stands in for one.
    expect(rows[0]).toMatchObject({ label: COMPOSER_SEND_ACTION, base: { strokes: [...ENTER], when: 'composerActive' } })
    expect(rows[0]?.entry.source).toBe('user')
  })

  it('labels an orphaned override from its action when that is still registered', () => {
    const renamed: UiActionDefinition = {
      ...sendAction(),
      defaultKeybindings: [{ key: keybindingKey('composer.send.v2'), strokes: [...ENTER] }],
    }
    const rows = keybindingRows([renamed], [override({ strokes: [{ key: 'k', modifiers: ['ctrl'] }] })])

    // Its own default is gone, but the action it invokes still names it.
    expect(rows.map(row => row.label)).toEqual(['Send message', 'Send message'])
    expect(rows.map(row => row.key)).toEqual([keybindingKey('composer.send.v2'), SEND_KEY])
  })

  it('keeps the rows of one command adjacent', () => {
    const twoDefaults: UiActionDefinition = {
      ...sendAction(),
      defaultKeybindings: [
        { key: SEND_KEY, strokes: [...ENTER] },
        { key: keybindingKey('composer.send.alt'), strokes: [{ key: 'Enter', modifiers: ['ctrl'] }] },
      ],
    }
    const rows = keybindingRows([twoDefaults, { id: PREVIEW_ACTION, label: 'Preview', run: () => {} }], [])
    expect(rows.map(row => row.action)).toEqual([PREVIEW_ACTION, COMPOSER_SEND_ACTION, COMPOSER_SEND_ACTION])
  })
})

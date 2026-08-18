// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { KeybindingRecorder } from '../src/client/KeybindingRecorder.tsx'
import type { KeyStroke } from '../src/keybinding.ts'

afterEach(cleanup)

const ENTER: KeyStroke = { key: 'Enter', modifiers: [] }

function mount(onChange = vi.fn()) {
  render(<KeybindingRecorder strokes={[ENTER]} onStrokesChange={onChange} label="Send message" doneLabel="Done" clearLabel="Clear" />)
  return {
    onChange,
    recorder: screen.getByRole('button', { name: /Send message/ }),
    done: () => {
      const button = screen.getByRole('button', { name: 'Done' })
      fireEvent.pointerDown(button)
      fireEvent.click(button)
    },
  }
}

describe('KeybindingRecorder', () => {
  it('renders the committed strokes as chips', () => {
    render(
      <KeybindingRecorder strokes={[{ key: 'Enter', modifiers: ['ctrl'] }]} onStrokesChange={vi.fn()} label="Send message" doneLabel="Done" clearLabel="Clear" />,
    )
    expect(screen.getByText('Ctrl')).toBeDefined()
    expect(screen.getByText('Enter')).toBeDefined()
  })

  it('shows a held modifier as pressed and clears it on release', () => {
    const { recorder } = mount()
    fireEvent.click(recorder)
    fireEvent.keyDown(recorder, { key: 'Control', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false })
    expect(screen.getByText('Ctrl')).toBeDefined()
    fireEvent.keyUp(recorder, { key: 'Control', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false })
    expect(screen.queryByText('Ctrl')).toBeNull()
  })

  it('clears a held modifier when a lock key stands in for its release', () => {
    const { recorder } = mount()
    fireEvent.click(recorder)
    fireEvent.keyDown(recorder, { key: 'Shift', ctrlKey: false, metaKey: false, altKey: false, shiftKey: true })
    expect(screen.getByText('Shift')).toBeDefined()
    fireEvent.keyUp(recorder, { key: 'CapsLock', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false })
    expect(screen.queryByText('Shift')).toBeNull()
  })

  it('shows the Done button while recording', () => {
    const { recorder } = mount()
    fireEvent.click(recorder)
    expect(screen.getByRole('button', { name: 'Done' })).toBeDefined()
  })

  it('records a stroke and commits on Done', () => {
    const { onChange, recorder, done } = mount()
    fireEvent.click(recorder)
    fireEvent.keyDown(recorder, { key: 'k', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false })
    done()
    expect(onChange).toHaveBeenCalledWith([{ key: 'k', modifiers: ['ctrl'] }])
  })

  it('ignores auto-repeat keydowns', () => {
    const { onChange, recorder, done } = mount()
    fireEvent.click(recorder)
    fireEvent.keyDown(recorder, { key: 'k', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false })
    fireEvent.keyDown(recorder, { key: 'k', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, repeat: true })
    done()
    expect(onChange).toHaveBeenCalledWith([{ key: 'k', modifiers: ['ctrl'] }])
  })

  it('records a two-stroke chord and a bare Enter stroke', () => {
    const { onChange, recorder, done } = mount()
    fireEvent.click(recorder)
    fireEvent.keyDown(recorder, { key: 'k', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false })
    fireEvent.keyDown(recorder, { key: 's', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false })
    fireEvent.keyDown(recorder, { key: 'Enter', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false })
    done()
    expect(onChange).toHaveBeenCalledWith([
      { key: 'k', modifiers: ['ctrl'] },
      { key: 's', modifiers: ['ctrl'] },
      { key: 'Enter', modifiers: [] },
    ])
  })

  it('Escape cancels without persisting', () => {
    const { onChange, recorder } = mount()
    fireEvent.click(recorder)
    fireEvent.keyDown(recorder, { key: 'k', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false })
    fireEvent.keyDown(recorder, { key: 'Escape' })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('plain Backspace removes the last stroke', () => {
    const { onChange, recorder, done } = mount()
    fireEvent.click(recorder)
    fireEvent.keyDown(recorder, { key: 'k', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false })
    fireEvent.keyDown(recorder, { key: 's', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false })
    fireEvent.keyDown(recorder, { key: 'Backspace', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false })
    done()
    expect(onChange).toHaveBeenCalledWith([{ key: 'k', modifiers: ['ctrl'] }])
  })

  it('blur cancels without persisting', () => {
    const { onChange, recorder } = mount()
    fireEvent.click(recorder)
    fireEvent.keyDown(recorder, { key: 'k', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false })
    fireEvent.blur(recorder)
    fireEvent.keyDown(recorder, { key: 'Enter', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('does not record while disarmed', () => {
    const { onChange, recorder } = mount()
    fireEvent.keyDown(recorder, { key: 'Enter', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('Done with an empty draft commits nothing', () => {
    const { onChange, recorder, done } = mount()
    fireEvent.click(recorder)
    done()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('clicking the recorder while recording keeps the draft', () => {
    const { onChange, recorder, done } = mount()
    fireEvent.click(recorder)
    fireEvent.keyDown(recorder, { key: 'k', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false })
    fireEvent.click(recorder)
    done()
    expect(onChange).toHaveBeenCalledWith([{ key: 'k', modifiers: ['ctrl'] }])
  })

  it('ignores keyup while disarmed', () => {
    const { recorder } = mount()
    fireEvent.keyUp(recorder, { key: 'Control', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false })
    expect(screen.queryByText('Ctrl')).toBeNull()
  })

  it('renders the placeholder for empty strokes', () => {
    render(<KeybindingRecorder strokes={[]} onStrokesChange={vi.fn()} label="Send message" doneLabel="Done" clearLabel="Clear" />)
    expect(screen.getByText('Press keys')).toBeDefined()
  })

  it('records a chord without leaving a lone modifier after release', () => {
    const { recorder } = mount()
    fireEvent.click(recorder)
    fireEvent.keyDown(recorder, { key: 'Control', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false })
    fireEvent.keyDown(recorder, { key: 'Enter', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false })
    fireEvent.keyUp(recorder, { key: 'Enter', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false })
    fireEvent.keyUp(recorder, { key: 'Control', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false })
    expect(recorder.getAttribute('aria-label')).toBe('Send message: Ctrl + Enter')
  })

  it('ignores a repeated modifier and a lock key', () => {
    const { onChange, recorder, done } = mount()
    fireEvent.click(recorder)
    fireEvent.keyDown(recorder, { key: 'Control', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false })
    fireEvent.keyDown(recorder, { key: 'Control', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false })
    fireEvent.keyDown(recorder, { key: 'CapsLock', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false })
    done()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('offers no way to unbind until the pointer is over a bound recorder', () => {
    const { recorder } = mount()
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull()

    fireEvent.pointerEnter(recorder.parentElement!)
    expect(screen.getByRole('button', { name: 'Clear' })).toBeDefined()

    fireEvent.pointerLeave(recorder.parentElement!)
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull()
  })

  it('unbinds the action with a gesture of no strokes', () => {
    const { onChange, recorder } = mount()
    fireEvent.pointerEnter(recorder.parentElement!)

    const clear = screen.getByRole('button', { name: 'Clear' })
    fireEvent.pointerDown(clear)
    fireEvent.click(clear)

    // Nothing can match an empty gesture, so the action is bound to nothing.
    expect(onChange).toHaveBeenCalledWith([])
  })

  it('offers nothing to clear when the action is already unbound', () => {
    render(<KeybindingRecorder strokes={[]} onStrokesChange={vi.fn()} label="Preview" doneLabel="Done" clearLabel="Clear" />)
    const recorder = screen.getByRole('button', { name: /Preview/ })

    fireEvent.pointerEnter(recorder.parentElement!)

    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull()
  })

  it('holds room for one control, gathering it only when one is there', () => {
    const { recorder } = mount()
    const layout = recorder.firstElementChild as HTMLElement
    expect(layout.dataset['control']).toBeUndefined()

    fireEvent.pointerEnter(recorder.parentElement!)

    // The chips ask for the same width either way; only where the room sits moves.
    expect(layout.dataset['control']).toBe('true')
  })
})

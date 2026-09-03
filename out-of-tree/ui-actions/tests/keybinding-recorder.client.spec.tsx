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

  it('starts recording and takes focus when it is armed', () => {
    const onChange = vi.fn()
    render(<KeybindingRecorder armed strokes={[]} onStrokesChange={onChange} label="Send message" doneLabel="Done" clearLabel="Clear" />)
    const recorder = screen.getByRole('button', { name: /Send message/ })

    // Already recording: the control that finishes it is offered without a click.
    expect(screen.getByRole('button', { name: 'Done' })).toBeDefined()
    // Focused, because recording cancels on blur and blur cannot reach
    // something that was never focused.
    expect(document.activeElement).toBe(recorder)

    fireEvent.keyDown(recorder, { key: 'k', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false })
    const done = screen.getByRole('button', { name: 'Done' })
    fireEvent.pointerDown(done)
    fireEvent.click(done)

    expect(onChange).toHaveBeenCalledWith([{ key: 'k', modifiers: ['ctrl'] }])
  })

  it('follows its own tail while recording, so a new stroke is visible', () => {
    const { recorder } = mount()
    const strip = recorder.querySelector('[class*="_scroller_"]') as HTMLElement
    // jsdom lays nothing out, so the strip reports the width it is given.
    Object.defineProperty(strip, 'scrollWidth', { value: 400, configurable: true })

    // Not recording: a committed gesture reads from its start.
    expect(strip.scrollLeft).toBe(0)

    fireEvent.click(recorder)
    fireEvent.keyDown(recorder, { key: 'k', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false })

    expect(strip.scrollLeft).toBe(400)
  })

  it('follows its tail toward the other end when the strip reads right to left', () => {
    const { recorder } = mount()
    const strip = recorder.querySelector('[class*="_scroller_"]') as HTMLElement
    Object.defineProperty(strip, 'scrollWidth', { value: 400, configurable: true })
    strip.style.direction = 'rtl'

    fireEvent.click(recorder)
    fireEvent.keyDown(recorder, { key: 'k', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false })

    // A scroll offset is physical: the end of the content is the negative
    // extreme when the inline axis runs the other way.
    expect(strip.scrollLeft).toBe(-400)
  })

  it("asks for the control's room whether or not a control is drawn", () => {
    const { recorder } = mount()
    const box = recorder.firstElementChild as HTMLElement
    const asked = () => [...box.children].filter(child => child.className.includes('sizeRoom'))

    // The room is the whole of what the strip asks for, and it stands there in
    // both states, so the column cannot move as a control comes and goes.
    expect(asked()).toHaveLength(1)
    expect(asked()[0]?.getAttribute('aria-hidden')).toBe('true')

    fireEvent.pointerEnter(recorder.parentElement!)

    expect(screen.getByRole('button', { name: 'Clear' })).toBeDefined()
    expect(asked()).toHaveLength(1)
  })

  /**
   * The room leaves the scroll content with the control, so the engine clamps
   * the offset to the shorter range; jsdom lays nothing out, so the sizes and
   * that clamp are stated here rather than resolved.
   */
  function scrollable(recorder: HTMLElement, { scrollWidth = 400, clientWidth = 100 } = {}) {
    const strip = recorder.querySelector('[class*="_scroller_"]') as HTMLElement
    Object.defineProperty(strip, 'scrollWidth', { value: scrollWidth, configurable: true })
    Object.defineProperty(strip, 'clientWidth', { value: clientWidth, configurable: true })
    return {
      strip,
      /** Scroll where a reader would, which is what the strip writes down. */
      readerScrollsTo: (offset: number) => {
        strip.scrollLeft = offset
        fireEvent.scroll(strip)
      },
      /** What the engine does to the offset once the room is gone. */
      clampToFreeEnd: () => { strip.scrollLeft = scrollWidth - clientWidth },
    }
  }

  it('gives back the place the clamp took when the control returns', () => {
    const { recorder } = mount()
    const { strip, readerScrollsTo, clampToFreeEnd } = scrollable(recorder)
    const row = recorder.parentElement as HTMLElement

    fireEvent.pointerEnter(row)
    readerScrollsTo(250)
    fireEvent.pointerLeave(row)
    clampToFreeEnd()

    fireEvent.pointerEnter(row)

    // Back where the reader left it, control over the last stroke and all:
    // inside this leeway, not moving beats not overlapping.
    expect(strip.scrollLeft).toBe(250)
  })

  it('leaves a strip moved since the control went away where its reader put it', () => {
    const { recorder } = mount()
    const { strip, readerScrollsTo, clampToFreeEnd } = scrollable(recorder)
    const row = recorder.parentElement as HTMLElement

    fireEvent.pointerEnter(row)
    readerScrollsTo(250)
    fireEvent.pointerLeave(row)
    clampToFreeEnd()
    strip.scrollLeft = 120

    fireEvent.pointerEnter(row)

    expect(strip.scrollLeft).toBe(120)
  })

  it('has nothing to give back before the control has ever been there', () => {
    const { recorder } = mount()
    const { strip, readerScrollsTo, clampToFreeEnd } = scrollable(recorder)

    // Scrolled while the room was out of the strip, so nothing was written
    // down: that offset is not one the clamp is about to take away.
    readerScrollsTo(200)
    clampToFreeEnd()

    fireEvent.pointerEnter(recorder.parentElement!)

    expect(strip.scrollLeft).toBe(300)
  })

  it('puts the control room in the scroll content only once the control is there', () => {
    const { recorder } = mount()
    const scroller = recorder.querySelector('[class*="_scroller_"]') as HTMLElement
    const rooms = () => [...scroller.children].filter(child => child.className.includes('_room'))

    // Nothing floats over the strip yet, so there is nothing to scroll clear
    // of; the room the strip asks for is held by the plane that sizes it.
    expect(rooms()).toHaveLength(0)

    fireEvent.pointerEnter(recorder.parentElement!)

    // Now it is the overscroll that carries the last chip out from under the
    // control, so it has to be inside what scrolls.
    expect(rooms()).toHaveLength(1)
  })
})

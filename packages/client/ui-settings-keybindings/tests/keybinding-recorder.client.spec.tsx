// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { KeybindingRecorder } from '../src/client/KeybindingRecorder.tsx'
import { DEFAULT_SEND_KEYBINDING } from '../src/keybinding.ts'

afterEach(cleanup)

function mount(onChange = vi.fn()) {
  render(<KeybindingRecorder binding={DEFAULT_SEND_KEYBINDING} onChange={onChange} label="Send message" />)
  return { onChange, button: screen.getByRole('button') }
}

describe('KeybindingRecorder', () => {
  it('renders the current binding as kbd chips', () => {
    render(
      <KeybindingRecorder binding={{ key: 'Enter', modifiers: ['ctrl'] }} onChange={vi.fn()} label="Send message" />,
    )
    expect(screen.getByText('Ctrl')).toBeDefined()
    expect(screen.getByText('Enter')).toBeDefined()
  })

  it('records a key with its modifiers once', () => {
    const { onChange, button } = mount()
    fireEvent.click(button)
    fireEvent.keyDown(button, { key: 'k', ctrlKey: true, shiftKey: true, metaKey: false, altKey: false })
    expect(onChange).toHaveBeenCalledWith({ key: 'k', modifiers: ['ctrl', 'shift'] })
  })

  it('does not record while disarmed', () => {
    const { onChange, button } = mount()
    fireEvent.keyDown(button, { key: 'Enter', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('Escape cancels without persisting', () => {
    const { onChange, button } = mount()
    fireEvent.click(button)
    fireEvent.keyDown(button, { key: 'Escape' })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('a lone modifier only updates the preview', () => {
    const { onChange, button } = mount()
    fireEvent.click(button)
    fireEvent.keyDown(button, { key: 'Control', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false })
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByText('Ctrl')).toBeDefined()
  })

  it('blur disarms without persisting', () => {
    const { onChange, button } = mount()
    fireEvent.click(button)
    fireEvent.blur(button)
    fireEvent.keyDown(button, { key: 'Enter', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false })
    expect(onChange).not.toHaveBeenCalled()
  })
})

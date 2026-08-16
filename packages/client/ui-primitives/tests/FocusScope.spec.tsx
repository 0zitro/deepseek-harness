// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { FocusScope } from '@deepseek-ai/dsh-client-ui-primitives'

afterEach(cleanup)

describe('FocusScope', () => {
  it('renders children inside a named focus region', () => {
    render(<FocusScope name="composer"><input aria-label="composer input" /></FocusScope>)
    expect(document.querySelector('[data-focus-scope="composer"]')).toBeDefined()
    expect(screen.getByLabelText('composer input')).toBeDefined()
  })
})

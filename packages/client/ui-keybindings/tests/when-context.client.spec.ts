// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { UiWhenContext } from '../src/client/when-context.ts'

afterEach(() => { document.body.innerHTML = '' })

async function mount(): Promise<UiWhenContext> {
  const ctx = new Context()
  let whenContext: UiWhenContext | undefined
  await ctx.plugin({ apply: (pluginCtx: Context) => { whenContext = new UiWhenContext(pluginCtx) } }).await()
  if (whenContext === undefined) throw new Error('not mounted')
  return whenContext
}

function scope(name: string, child: HTMLElement): HTMLElement {
  const element = document.createElement('div')
  element.setAttribute('data-focus-scope', name)
  element.appendChild(child)
  return element
}

describe('UiWhenContext', () => {
  it('starts empty', async () => {
    const context = await mount()
    expect(context.context.getSnapshot()).toEqual({})
  })

  it('derives Focused and Active from the focus scope', async () => {
    const context = await mount()
    const input = document.createElement('input')
    document.body.appendChild(scope('composer', input))
    fireEvent.focusIn(input)
    expect(context.context.getSnapshot()).toEqual({ composerFocused: true, composerActive: true })
  })

  it('nests scopes with the innermost active', async () => {
    const context = await mount()
    const input = document.createElement('input')
    document.body.appendChild(scope('composer', scope('overlay', input)))
    fireEvent.focusIn(input)
    expect(context.context.getSnapshot()).toEqual({
      overlayFocused: true, overlayActive: true, composerFocused: true,
    })
  })

  it('clears scopes when the window loses focus', async () => {
    const context = await mount()
    const input = document.createElement('input')
    document.body.appendChild(scope('composer', input))
    fireEvent.focusIn(input)
    window.dispatchEvent(new Event('blur'))
    expect(context.context.getSnapshot()).toEqual({})
  })

  it('sets and clears a state key over the focus map', async () => {
    const context = await mount()
    const input = document.createElement('input')
    document.body.appendChild(scope('composer', input))
    fireEvent.focusIn(input)
    const dispose = context.set('agentBusy', true)
    expect(context.context.getSnapshot()).toEqual({ composerFocused: true, composerActive: true, agentBusy: true })
    dispose()
    expect(context.context.getSnapshot()).toEqual({ composerFocused: true, composerActive: true })
  })
})

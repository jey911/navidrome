import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { it, expect, vi } from 'vitest'
import MobileNavigation from './MobileNavigation'
import { Provider } from 'react-redux'
import { createStore } from 'redux'

it('navigates between the library, queue and remote with exactly one active tab', () => {
  render(
    <Provider
      store={createStore(() => ({ player: { queue: [], current: {} } }))}
    >
      <MemoryRouter>
        <MobileNavigation />
      </MemoryRouter>
    </Provider>,
  )
  const library = screen.getByRole('link', { name: 'Biblioteca' })
  const queue = screen.getByRole('link', { name: 'Cola' })
  const remote = screen.getByRole('link', { name: 'Mando' })
  expect(library).toHaveClass('active')
  fireEvent.click(queue)
  expect(queue).toHaveClass('active')
  expect(library).not.toHaveClass('active')
  fireEvent.click(remote)
  expect(remote).toHaveClass('active')
  expect(queue).not.toHaveClass('active')
})

it('signals a newly queued song on the queue tab and clears the effect even if it is consumed', () => {
  vi.useFakeTimers()
  try {
    const store = createStore(
      (state = { player: { queue: [], current: {} } }, action) =>
        action.type === 'change' ? action.state : state,
    )
    render(
      <Provider store={store}>
        <MemoryRouter>
          <MobileNavigation />
        </MemoryRouter>
      </Provider>,
    )
    const tab = screen.getByRole('link', { name: 'Cola' })
    act(() =>
      store.dispatch({
        type: 'change',
        state: {
          player: {
            queue: [{ uuid: 'manual1', manualQueued: true }],
            current: {},
          },
        },
      }),
    )
    expect(tab).toHaveClass('mm-queue-added')
    expect(tab.querySelector('.mm-queue-badge')).toHaveTextContent('1')
    act(() =>
      store.dispatch({
        type: 'change',
        state: { player: { queue: [], current: {} } },
      }),
    )
    act(() => vi.advanceTimersByTime(1100))
    expect(tab).not.toHaveClass('mm-queue-added')
    expect(tab.querySelector('.mm-queue-badge')).toBeNull()
  } finally {
    vi.useRealTimers()
  }
})

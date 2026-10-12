import React from 'react'
import { render, fireEvent, screen, cleanup } from '@testing-library/react'
import { MemoryRouter, Link } from 'react-router-dom'
import { Provider } from 'react-redux'
import { createStore } from 'redux'
import { it, expect, vi, afterEach } from 'vitest'
import { setViewport } from '../setupTests'
import Layout from './Layout'

vi.mock('react-admin', () => ({
  Layout: ({ appBar: AppBar, className, children }) => (
    <div className={className}>
      <AppBar />
      {children}
    </div>
  ),
  toggleSidebar: () => ({ type: 'toggle' }),
}))
vi.mock('./AppBar', () => ({
  default: () => <header className="MuiAppBar-root" />,
}))
vi.mock('./Menu', () => ({ default: () => null }))
vi.mock('./Notification', () => ({ default: () => null }))
vi.mock('../themes/useCurrentTheme', () => ({ default: () => ({}) }))
vi.mock('../common', () => ({ useSearchRefocus: () => {} }))

afterEach(() => {
  cleanup()
  setViewport({ phone: false })
  vi.restoreAllMocks()
})

it('measures the header for mobile content and returns to the top when navigating to the remote', () => {
  setViewport({ phone: true })
  let height = 56
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    () => ({ height }),
  )
  const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  const store = createStore(() => ({ player: { queue: [], current: {} } }))
  const view = render(
    <Provider store={store}>
      <MemoryRouter>
        <Layout>
          <Link to="/remote">Abrir mando</Link>
        </Layout>
      </MemoryRouter>
    </Provider>,
  )
  expect(
    document.documentElement.style.getPropertyValue(
      '--mm-mobile-header-height',
    ),
  ).toBe('56px')
  height = 64
  fireEvent(window, new Event('resize'))
  expect(
    document.documentElement.style.getPropertyValue(
      '--mm-mobile-header-height',
    ),
  ).toBe('64px')
  scroll.mockClear()
  fireEvent.click(screen.getByText('Abrir mando'))
  expect(scroll).toHaveBeenCalledWith(0, 0)
  view.unmount()
  expect(
    document.documentElement.style.getPropertyValue(
      '--mm-mobile-header-height',
    ),
  ).toBe('')
})

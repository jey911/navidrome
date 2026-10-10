import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import Menu from './Menu'

vi.mock('react-admin', () => ({
  useTranslate: () => (key, opts) => (opts && opts._) || key,
  MenuItemLink: ({ to, primaryText }) => <a href={to}>{primaryText}</a>,
  getResources: () => [],
}))

vi.mock('react-redux', () => ({
  useSelector: (selector) =>
    selector({ admin: { ui: { sidebarOpen: false } }, player: { queue: [] } }),
}))

vi.mock('./SubMenu', () => ({
  default: ({ children }) => <div>{children}</div>,
}))
vi.mock('./PlaylistsSubMenu', () => ({ default: () => null }))
vi.mock('../common/LibrarySelector', () => ({ default: () => null }))

describe('<Menu />', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(cleanup)

  it('monta la bienvenida una vez por versión desde el menú', () => {
    render(<Menu />)

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Ayuda')).toBeInTheDocument()
  })
})

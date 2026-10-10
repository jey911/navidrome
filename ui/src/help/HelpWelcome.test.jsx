import React from 'react'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { useTranslate } from 'react-admin'
import HelpWelcome from './HelpWelcome'
import { WELCOME_KEY } from './help'
import config from '../config'

vi.mock('react-admin', () => ({ useTranslate: vi.fn() }))

describe('<HelpWelcome />', () => {
  beforeEach(() => {
    window.localStorage.clear()
    useTranslate.mockReturnValue((key, opts) => (opts && opts._) || key)
  })

  afterEach(cleanup)

  it('aparece sola la primera vez y se descarta para la versión', async () => {
    render(<HelpWelcome />)

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Entendido'))

    expect(window.localStorage.getItem(WELCOME_KEY)).toBe(
      String(config.version),
    )
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
  })

  it('no aparece si ya se descartó esta versión', () => {
    window.localStorage.setItem(WELCOME_KEY, String(config.version))
    render(<HelpWelcome />)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

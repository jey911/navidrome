import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { useTranslate } from 'react-admin'
import HelpView from './HelpView'

vi.mock('react-admin', () => ({ useTranslate: vi.fn() }))

describe('<HelpView />', () => {
  beforeEach(() => {
    useTranslate.mockReturnValue((key, opts) => (opts && opts._) || key)
  })

  afterEach(cleanup)

  it('muestra la guía completa sin repetir la bienvenida', () => {
    render(<HelpView />)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('Auto-DJ y continuación')).toBeInTheDocument()
    expect(screen.getByText('Modo aleatorio (shuffle)')).toBeInTheDocument()
    expect(
      screen.getByText('Emparejar el móvil como mando'),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Downloader y cola de revisión/),
    ).toBeInTheDocument()
    expect(screen.getByText(/red local \(LAN\)/)).toBeInTheDocument()
  })
})

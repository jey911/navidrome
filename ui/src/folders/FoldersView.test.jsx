import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Provider } from 'react-redux'
import { createStore } from 'redux'
import FoldersView from './FoldersView'
import { playTracks } from '../actions'

const mockGetList = vi.fn()
const mockDataProvider = { getList: mockGetList }
const mockNotify = vi.fn()

// SongDatagrid arrastra filas con react-dnd: en tests basta un stub.
vi.mock('react-dnd', () => ({
  useDrag: () => [{}, vi.fn(), vi.fn()],
  useDrop: () => [{}, vi.fn()],
}))

vi.mock('react-admin', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useTranslate: () => (key, opts) => (opts && opts._) || key,
    useNotify: () => mockNotify,
    useDataProvider: () => mockDataProvider,
  }
})

// Store real con espía: el Datagrid de react-admin exige Provider;
// las acciones despachadas se inspeccionan en `dispatched`.
let dispatched = []
const makeStore = () =>
  createStore(
    (
      state = {
        admin: { ui: { version: 1 }, resources: {} },
        player: { current: {} },
      },
      action,
    ) => {
      dispatched.push(action)
      return state
    },
  )

const renderView = () =>
  render(
    <Provider store={makeStore()}>
      <FoldersView />
    </Provider>,
  )

describe('<FoldersView />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dispatched = []
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          total: 2,
          tracks: [
            { path: 'Salsa/Tito Rojas/Album A/01 Uno.mp3' },
            { path: 'Rock/Banda X/Disco/01 R.mp3' },
          ],
        }),
      }),
    )
    mockGetList.mockResolvedValue({ data: [], total: 0 })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('muestra las carpetas raíz del árbol', async () => {
    renderView()
    expect(await screen.findByText('Rock')).toBeInTheDocument()
    expect(screen.getByText('Salsa')).toBeInTheDocument()
  })

  it('entra a una carpeta y reproduce sus temas', async () => {
    mockGetList.mockResolvedValue({
      data: [
        {
          id: 's1',
          title: 'Uno',
          artist: 'Tito Rojas',
          duration: 200,
          path: '/music/Salsa/Tito Rojas/Album A/01 Uno.mp3',
        },
      ],
      total: 1,
    })
    renderView()
    fireEvent.click(await screen.findByText('Salsa'))
    fireEvent.click(await screen.findByText('Tito Rojas'))
    // Entra al álbum para ver temas directos
    fireEvent.click(await screen.findByText('Album A'))
    expect(await screen.findByText('Uno')).toBeInTheDocument()
    expect(mockGetList).toHaveBeenCalledWith(
      'song',
      expect.objectContaining({
        filter: expect.objectContaining({
          path: '/music/Salsa/Tito Rojas/Album A/',
        }),
      }),
    )
    fireEvent.click(screen.getByTestId('folder-play-all'))
    await waitFor(() =>
      expect(dispatched).toContainEqual(
        playTracks({ s1: expect.objectContaining({ id: 's1' }) }, ['s1']),
      ),
    )
  })

  it('reproduce una carpeta desde su fila sin entrar', async () => {
    mockGetList.mockResolvedValue({
      data: [
        { id: 's9', title: 'R', path: '/music/Rock/Banda X/Disco/01 R.mp3' },
      ],
      total: 1,
    })
    renderView()
    await screen.findByText('Rock')
    const row = screen.getByText('Rock').closest('[data-testid="folder-row"]')
    fireEvent.click(row.querySelector('[data-testid="folder-row-play"]'))
    await waitFor(() =>
      expect(dispatched).toContainEqual(
        playTracks({ s9: expect.objectContaining({ id: 's9' }) }, ['s9']),
      ),
    )
  })

  it('guía al Downloader si no hay sesión', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 401 })
    renderView()
    expect(
      await screen.findByRole('link', { name: 'Downloader' }),
    ).toBeInTheDocument()
  })
})

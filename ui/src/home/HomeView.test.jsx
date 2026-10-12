import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Provider } from 'react-redux'
import { createStore } from 'redux'
import HomeView from './HomeView'
import { setTrack, addTracks, playTracks, removeTrack } from '../actions'
import { deleteTrackFromServer } from '../remote/remoteCommands'
import subsonic from '../subsonic'
import { setViewport } from '../setupTests'
import { searchSongs } from '../remote/searchSongs'
import { registerAudioInstance } from '../audioplayer/audioBus'

vi.mock('react-admin', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useTranslate: () => (key, opts) => (opts && opts._) || key,
    useNotify: () => mockNotify,
    useRefresh: () => mockRefresh,
    useDataProvider: () => mockDataProvider,
  }
})

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useHistory: () => ({ push: mockPush }) }
})

vi.mock('../remote/searchSongs', () => ({ searchSongs: vi.fn() }))

vi.mock('../subsonic', () => ({
  default: { startScan: vi.fn(), getCoverArtUrl: () => 'http://coverart' },
}))

vi.mock('../remote/remoteCommands', () => ({
  MUSIC_DIR_PREFIX: '/music/',
  toRelativeMusicPath: (p) =>
    typeof p === 'string' && p.startsWith('/music/') ? p.slice(7) : null,
  deleteTrackFromServer: vi.fn(),
}))

vi.mock('../common', () => ({
  LoveButton: () => <button data-testid="love" />,
  SongContextMenu: () => <button data-testid="ctx" />,
  SongPlayButton: ({ onPlay, record }) => (
    <button data-testid="row-play" onClick={() => onPlay(record)} />
  ),
  Title: () => null,
}))

const mockNotify = vi.fn()
const mockRefresh = vi.fn()
const mockPush = vi.fn()
const mockGetList = vi.fn()
const mockGetMany = vi.fn()
const mockDataProvider = { getList: mockGetList, getMany: mockGetMany }

const song = {
  id: 's1',
  title: 'Acéptame Como Soy',
  artist: 'Joe Veras',
  album: 'Grandes Éxitos',
  genre: 'Bachata',
  duration: 256,
  createdAt: '2024-09-26T10:00:00Z',
  suffix: 'flac',
  bitRate: 920,
  path: '/music/Bachata/Joe Veras/tema.mp3',
}

const queueItem = {
  uuid: 'u1',
  trackId: 's1',
  name: song.title,
  singer: song.artist,
  duration: song.duration,
  cover: 'http://cover',
  song,
}

let dispatched = []
const renderView = (
  player = { queue: [], current: {}, mode: 'order' },
  route = '/',
) => {
  dispatched = []
  const store = createStore(
    (
      state = {
        admin: { ui: { version: 1 }, resources: {}, permissions: 'admin' },
        player,
      },
      action,
    ) => {
      dispatched.push(action)
      return state
    },
  )
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[route]}>
        <HomeView />
      </MemoryRouter>
    </Provider>,
  )
}

describe('<HomeView />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    subsonic.startScan.mockResolvedValue({})
    searchSongs.mockResolvedValue([{ id: 'found' }])
    mockGetMany.mockResolvedValue({
      data: [{ ...song, id: 'found', title: 'Resultado de búsqueda' }],
    })
    mockGetList.mockImplementation((resource) => {
      if (resource === 'album') {
        return Promise.resolve({
          data: [
            { id: 'al1', name: 'Grandes Éxitos', albumArtist: 'Joe Veras' },
          ],
          total: 1,
        })
      }
      if (resource === 'playlist') {
        return Promise.resolve({
          data: [{ id: 'pl1', name: 'Favoritas', songCount: 42 }],
          total: 1,
        })
      }
      return Promise.resolve({ data: [song], total: 524 })
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    setViewport({ phone: false })
  })

  it('muestra estado vacío sin reproducción', async () => {
    renderView()
    expect(await screen.findByText('Nada sonando')).toBeInTheDocument()
    expect(screen.getByText('Cola vacía: dale ▶ a algo.')).toBeInTheDocument()
  })

  it('pinta héroe, cola, álbumes, playlists y tabla', async () => {
    renderView({
      queue: [queueItem],
      current: { uuid: 'u1', trackId: 's1', song },
      mode: 'order',
    })
    expect(await screen.findByTestId('home-now-title')).toHaveTextContent(
      'Acéptame Como Soy',
    )
    expect(await screen.findByTestId('home-queue-item')).toBeInTheDocument()
    expect(await screen.findByTestId('home-album-card')).toBeInTheDocument()
    expect(await screen.findByTestId('home-playlist-card')).toBeInTheDocument()
    expect(await screen.findByTestId('home-song-row')).toBeInTheDocument()
    // Hi-Res por ser FLAC + total de canciones
    expect(screen.getByText('Hi-Res')).toBeInTheDocument()
    expect(screen.getByText(/524 canciones en total/)).toBeInTheDocument()
  })

  describe('en móvil', () => {
    beforeEach(() => setViewport({ phone: true }))
    afterEach(() => setViewport({ phone: false }))

    it('deja solo la biblioteca de canciones y su buscador', async () => {
      renderView({
        queue: [queueItem],
        current: { uuid: 'u1', trackId: 's1', song },
        mode: 'order',
      })
      // Lo que se conserva
      expect(
        await screen.findByTestId('home-library-search'),
      ).toBeInTheDocument()
      expect(await screen.findByTestId('home-song-row')).toBeInTheDocument()
      expect(
        screen.queryByText('Biblioteca de canciones'),
      ).not.toBeInTheDocument()

      // Lo que se oculta
      expect(screen.queryByTestId('home-now-title')).not.toBeInTheDocument()
      expect(screen.queryByTestId('home-album-card')).not.toBeInTheDocument()
      expect(screen.queryByTestId('home-playlist-card')).not.toBeInTheDocument()
      expect(screen.queryByTestId('home-filters')).not.toBeInTheDocument()
      expect(screen.queryByTestId('home-sort')).not.toBeInTheDocument()
      expect(screen.queryByText('Subir música')).not.toBeInTheDocument()
      expect(
        screen.queryByText('Escuchado recientemente'),
      ).not.toBeInTheDocument()
      expect(screen.queryByText('Playlists para ti')).not.toBeInTheDocument()
      expect(screen.queryByTestId('love')).not.toBeInTheDocument()
      expect(screen.queryByText(song.album)).not.toBeInTheDocument()
      expect(screen.queryByText(song.genre)).not.toBeInTheDocument()
      expect(
        within(screen.getByTestId('home-song-row')).queryByText('4:16'),
      ).not.toBeInTheDocument()
      expect(screen.getByTestId('home-song-queue')).toBeInTheDocument()
      expect(screen.getByTestId('home-song-delete')).toBeInTheDocument()
      expect(screen.queryByTestId('ctx')).not.toBeInTheDocument()
    })

    it('pauses/resumes the current song from its row without replacing the queue', async () => {
      const audio = {
        paused: false,
        currentTime: 10,
        duration: 100,
        pause: vi.fn(),
        play: vi.fn(),
      }
      registerAudioInstance(audio)
      renderView({
        queue: [queueItem],
        current: { trackId: 's1', song },
        mode: 'order',
      })
      fireEvent.click(await screen.findByLabelText('Pausar'))
      expect(audio.pause).toHaveBeenCalledOnce()
      expect(dispatched).not.toContainEqual(setTrack(song))
      registerAudioInstance(null)
    })

    it('no pide los álbumes ni las playlists que no va a pintar', async () => {
      renderView()
      await screen.findByTestId('home-song-row')
      const recursos = mockGetList.mock.calls.map((c) => c[0])
      expect(recursos).toContain('song')
      expect(recursos).not.toContain('album')
      expect(recursos).not.toContain('playlist')
    })
  })

  it('reproduce desde la fila y encola', async () => {
    renderView()
    await screen.findByTestId('home-song-row')
    fireEvent.click(screen.getByTestId('row-play'))
    expect(dispatched).toContainEqual(setTrack(song))
    fireEvent.click(screen.getByTestId('home-song-queue'))
    expect(dispatched).toContainEqual(addTracks({ s1: song }))
  })

  it('salta a un tema de la cola', async () => {
    renderView({
      queue: [queueItem],
      current: { uuid: 'u1', trackId: 's1', song },
      mode: 'order',
    })
    fireEvent.click(await screen.findByTestId('home-queue-item'))
    const data = { u1: song }
    expect(dispatched).toContainEqual(playTracks(data, ['u1'], 'u1'))
  })

  it('borra con confirmación y quita de la cola', async () => {
    window.confirm = vi.fn(() => true)
    deleteTrackFromServer.mockResolvedValue({
      deleted: ['s1'],
      errors: [],
    })
    renderView({ queue: [], current: {}, mode: 'order' })
    await screen.findByTestId('home-song-row')
    fireEvent.click(screen.getByTestId('home-song-delete'))
    await waitFor(() =>
      expect(deleteTrackFromServer).toHaveBeenCalledWith('s1'),
    )
    await waitFor(() => expect(dispatched).toContainEqual(removeTrack('s1')))
    expect(mockNotify).toHaveBeenCalledWith(
      expect.stringContaining('Borrada'),
      'info',
    )
  })

  it('no borra si se cancela', async () => {
    window.confirm = vi.fn(() => false)
    renderView()
    await screen.findByTestId('home-song-row')
    fireEvent.click(screen.getByTestId('home-song-delete'))
    expect(deleteTrackFromServer).not.toHaveBeenCalled()
  })

  it('filters the same library as you type and restores it when cleared', async () => {
    renderView()
    const table = await screen.findByTestId('home-songs-table')
    const input = screen.getByTestId('home-library-search')
    fireEvent.change(input, { target: { value: 'tito' } })
    await screen.findByText('Resultado de búsqueda')
    expect(searchSongs).toHaveBeenCalledWith('tito', 50)
    expect(screen.getByTestId('home-songs-table')).toBe(table)
    expect(screen.queryByText(song.title)).not.toBeInTheDocument()
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(mockPush).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: '' } })
    await screen.findByText(song.title)
    expect(screen.queryByText('Resultado de búsqueda')).not.toBeInTheDocument()
  })

  it('ignores a late search response after the input was cleared', async () => {
    let resolveSearch
    searchSongs.mockReturnValue(
      new Promise((resolve) => {
        resolveSearch = resolve
      }),
    )
    renderView()
    const input = await screen.findByTestId('home-library-search')
    fireEvent.change(input, { target: { value: 'tito' } })
    await waitFor(() => expect(searchSongs).toHaveBeenCalled())
    fireEvent.change(input, { target: { value: '' } })
    await screen.findByText(song.title)
    resolveSearch([{ id: 'found' }])
    await waitFor(() => expect(mockGetMany).toHaveBeenCalled())
    expect(screen.queryByText('Resultado de búsqueda')).not.toBeInTheDocument()
  })

  it('dispara sincronización rápida desde Herramientas', async () => {
    subsonic.startScan.mockResolvedValue({})
    renderView()
    fireEvent.click(await screen.findByTestId('home-tool-scan'))
    await waitFor(() =>
      expect(subsonic.startScan).toHaveBeenCalledWith({ fullScan: false }),
    )
  })

  it('omite la tarjeta de usuario de Inicio', async () => {
    renderView()
    await screen.findByTestId('home-song-row')
    // La biblioteca conserva su buscador sin la tarjeta de usuario.
    expect(screen.queryByTestId('home-search')).not.toBeInTheDocument()
    expect(screen.queryByTestId('home-scan')).not.toBeInTheDocument()
    expect(screen.queryByText('admin')).not.toBeInTheDocument()
    // El buscador que sí se queda es el de la biblioteca.
    expect(screen.getByTestId('home-library-search')).toBeInTheDocument()
  })
  it('loads the next mobile page without duplicates and rejects a late page after search', async () => {
    setViewport({ phone: true })
    let resolvePage
    mockGetList.mockImplementation((resource, options) =>
      options.pagination.page === 1
        ? Promise.resolve({ data: [song], total: 90 })
        : new Promise((resolve) => {
            resolvePage = resolve
          }),
    )
    renderView()
    fireEvent.click(await screen.findByText('Cargar más canciones'))
    expect(mockGetList).toHaveBeenLastCalledWith(
      'song',
      expect.objectContaining({ pagination: { page: 2, perPage: 30 } }),
    )
    resolvePage({
      data: [song, { ...song, id: 's2', title: 'Segunda página' }],
    })
    await screen.findByText('Segunda página')
    expect(screen.getAllByTestId('home-song-row')).toHaveLength(2)
    fireEvent.click(screen.getByText('Cargar más canciones'))
    fireEvent.change(screen.getByTestId('home-library-search'), {
      target: { value: 'found' },
    })
    await screen.findByText('Resultado de búsqueda')
    resolvePage({ data: [{ ...song, id: 'late', title: 'Página obsoleta' }] })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.queryByText('Página obsoleta')).toBeNull()
  })

  it('shows only manually pending tracks on the mobile queue tab', async () => {
    setViewport({ phone: true })
    renderView(
      {
        queue: [
          queueItem,
          {
            ...queueItem,
            uuid: 'u2',
            trackId: 's2',
            name: 'Petición manual',
            manualQueued: true,
          },
        ],
        current: { uuid: 'u1', trackId: 's1', song },
        mode: 'order',
      },
      '/?view=queue',
    )
    expect(await screen.findByText('Petición manual')).toBeInTheDocument()
    expect(screen.queryByTestId('home-songs-table')).toBeNull()
    expect(screen.getAllByTestId('home-queue-item')).toHaveLength(1)
    expect(screen.getByTestId('mobile-compact-playback')).toBeInTheDocument()
  })
})

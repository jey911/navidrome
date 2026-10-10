import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Provider } from 'react-redux'
import { createStore } from 'redux'
import HomeView from './HomeView'
import { setTrack, addTracks, playTracks, removeTrack } from '../actions'
import { deleteTrackViaEmepetre } from '../remote/remoteCommands'
import subsonic from '../subsonic'

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

vi.mock('../subsonic', () => ({
  default: { startScan: vi.fn(), getCoverArtUrl: () => 'http://coverart' },
}))

vi.mock('../remote/remoteCommands', () => ({
  MUSIC_DIR_PREFIX: '/music/',
  toRelativeMusicPath: (p) =>
    typeof p === 'string' && p.startsWith('/music/') ? p.slice(7) : null,
  deleteTrackViaEmepetre: vi.fn(),
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
const mockDataProvider = { getList: mockGetList }

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
const renderView = (player = { queue: [], current: {}, mode: 'order' }) => {
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
      <HomeView />
    </Provider>,
  )
}

describe('<HomeView />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
    deleteTrackViaEmepetre.mockResolvedValue({
      deleted: ['Bachata/Joe Veras/tema.mp3'],
      errors: [],
    })
    renderView({ queue: [], current: {}, mode: 'order' })
    await screen.findByTestId('home-song-row')
    fireEvent.click(screen.getByTestId('home-song-delete'))
    await waitFor(() =>
      expect(deleteTrackViaEmepetre).toHaveBeenCalledWith(
        'Bachata/Joe Veras/tema.mp3',
      ),
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
    expect(deleteTrackViaEmepetre).not.toHaveBeenCalled()
  })

  it('busca y navega a canciones', async () => {
    renderView()
    const input = await screen.findByTestId('home-search')
    fireEvent.change(input, { target: { value: 'tito' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('/song?'))
    expect(mockPush.mock.calls[0][0]).toContain(encodeURIComponent('tito'))
  })

  it('dispara sincronización rápida', async () => {
    subsonic.startScan.mockResolvedValue({})
    renderView()
    fireEvent.click(await screen.findByTestId('home-scan'))
    await waitFor(() =>
      expect(subsonic.startScan).toHaveBeenCalledWith({ fullScan: false }),
    )
  })
})

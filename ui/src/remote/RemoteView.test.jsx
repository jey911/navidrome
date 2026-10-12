import React from 'react'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { useTranslate } from 'react-admin'
import RemoteView from './RemoteView'
import { fetchState, listSessions, sendCommand } from './remoteApi'
import { searchSongs } from './searchSongs'

vi.mock('react-admin', () => ({ useTranslate: vi.fn() }))
vi.mock('./remoteApi', () => ({
  fetchState: vi.fn(),
  listSessions: vi.fn(),
  sendCommand: vi.fn(),
}))
vi.mock('./searchSongs', () => ({
  searchSongs: vi.fn(),
  SEARCH_LIMIT: 25,
}))

const storeTarget = (code = '4321') =>
  window.localStorage.setItem(
    'remoteTarget',
    JSON.stringify({ sessionId: 's1', code }),
  )

describe('<RemoteView />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    window.localStorage.removeItem = vi.fn()
    useTranslate.mockReturnValue((key, opts) => (opts && opts._) || key)
    listSessions.mockResolvedValue([])
    fetchState.mockResolvedValue({
      title: 'Tema',
      artist: 'Artista',
      playing: false,
    })
    sendCommand.mockResolvedValue(null)
    searchSongs.mockResolvedValue([])
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('recupera el código guardado y manda órdenes con él', async () => {
    storeTarget('4321')
    render(<RemoteView />)

    expect(await screen.findByDisplayValue('4321')).toBeInTheDocument()
    fireEvent.click(screen.getByTitle('Play/Pausa'))

    await waitFor(() =>
      expect(sendCommand).toHaveBeenCalledWith(
        's1',
        '4321',
        'toggle',
        expect.objectContaining({ requestId: expect.any(String) }),
      ),
    )
  })

  it('busca canciones y manda playTrack al laptop emparejado', async () => {
    storeTarget('4321')
    searchSongs.mockResolvedValue([
      { id: 's2', title: 'Canción', artist: 'A2' },
    ])
    render(<RemoteView />)

    const input = await screen.findByTestId('remote-search-input')
    fireEvent.change(input, { target: { value: 'tito' } })
    fireEvent.click(screen.getByTitle('Buscar'))

    expect(await screen.findByText('Canción')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('remote-play-now'))

    await waitFor(() =>
      expect(sendCommand).toHaveBeenCalledWith(
        's1',
        '4321',
        'playTrack',
        expect.objectContaining({
          id: 's2',
        }),
      ),
    )
    expect(searchSongs).toHaveBeenCalledWith('tito', 25)
  })

  it('reproduce solo el tema al tocar su nombre', async () => {
    storeTarget('4321')
    searchSongs.mockResolvedValue([
      { id: 's2', title: 'Canción', artist: 'A2' },
      { id: 's3', title: 'Otra', artist: 'A3' },
    ])
    render(<RemoteView />)

    const input = await screen.findByTestId('remote-search-input')
    fireEvent.change(input, { target: { value: 'tito' } })
    fireEvent.click(screen.getByTitle('Buscar'))

    expect(await screen.findByText('Otra')).toBeInTheDocument()
    fireEvent.click(screen.getAllByTestId('remote-result-title')[0])

    await waitFor(() =>
      expect(sendCommand).toHaveBeenCalledWith(
        's1',
        '4321',
        'playTrack',
        expect.objectContaining({
          id: 's2',
        }),
      ),
    )
  })

  it('muestra la barra de avance y manda seek al soltar', async () => {
    storeTarget('4321')
    fetchState.mockResolvedValue({
      trackId: 'cur1',
      title: 'Actual',
      artist: 'Art',
      playing: true,
      positionMs: 60000,
      durationMs: 240000,
    })
    render(<RemoteView />)

    const seek = await screen.findByTestId('remote-seek')
    expect(seek).toHaveAttribute('max', '240000')
    expect(seek.value).toBe('60000')
    fireEvent.change(seek, { target: { value: '120000' } })
    fireEvent.mouseUp(seek)

    await waitFor(() =>
      expect(sendCommand).toHaveBeenCalledWith(
        's1',
        '4321',
        'seek',
        expect.objectContaining({
          seconds: 120,
        }),
      ),
    )
  })

  it('oculta la barra de avance sin duración conocida', async () => {
    storeTarget('4321')
    fetchState.mockResolvedValue({
      trackId: 'cur1',
      title: 'Actual',
      artist: 'Art',
      playing: true,
    })
    render(<RemoteView />)

    await screen.findByDisplayValue('4321')
    expect(screen.queryByTestId('remote-seek')).toBeNull()
  })

  it('encola canciones al final o como siguientes desde el mando', async () => {
    storeTarget('4321')
    searchSongs.mockResolvedValue([{ id: 's3', title: 'Otra', artist: 'A3' }])
    render(<RemoteView />)

    const input = await screen.findByTestId('remote-search-input')
    fireEvent.change(input, { target: { value: 'salsa' } })
    fireEvent.click(screen.getByTitle('Buscar'))

    expect(await screen.findByText('Otra')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('remote-queue'))
    await waitFor(() =>
      expect(sendCommand).toHaveBeenCalledWith(
        's1',
        '4321',
        'queueTrack',
        expect.objectContaining({
          id: 's3',
        }),
      ),
    )
    fireEvent.click(screen.getByTestId('remote-play-next'))
    await waitFor(() =>
      expect(sendCommand).toHaveBeenCalledWith(
        's1',
        '4321',
        'playNextTrack',
        expect.objectContaining({
          id: 's3',
        }),
      ),
    )
  })

  it('pide confirmación y manda deleteTrack al borrar un resultado', async () => {
    storeTarget('4321')
    window.confirm = vi.fn(() => true)
    searchSongs.mockResolvedValue([
      { id: 's4', title: 'Borrable', artist: 'A4' },
    ])
    render(<RemoteView />)

    const input = await screen.findByTestId('remote-search-input')
    fireEvent.change(input, { target: { value: 'borrable' } })
    fireEvent.click(screen.getByTitle('Buscar'))

    expect(await screen.findByText('Borrable')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('remote-delete'))

    expect(window.confirm).toHaveBeenCalledWith(
      expect.stringContaining('Borrable'),
    )
    await waitFor(() =>
      expect(sendCommand).toHaveBeenCalledWith(
        's1',
        '4321',
        'deleteTrack',
        expect.objectContaining({
          id: 's4',
        }),
      ),
    )
  })

  it('no borra si se cancela la confirmación', async () => {
    storeTarget('4321')
    window.confirm = vi.fn(() => false)
    searchSongs.mockResolvedValue([
      { id: 's5', title: 'NoBorrar', artist: 'A5' },
    ])
    render(<RemoteView />)

    const input = await screen.findByTestId('remote-search-input')
    fireEvent.change(input, { target: { value: 'noborrar' } })
    fireEvent.click(screen.getByTitle('Buscar'))

    expect(await screen.findByText('NoBorrar')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('remote-delete'))

    await waitFor(() => expect(window.confirm).toHaveBeenCalled())
    expect(sendCommand).not.toHaveBeenCalledWith(
      's1',
      '4321',
      'deleteTrack',
      expect.anything(),
    )
  })

  it('borra lo que suena y muestra el aviso del laptop', async () => {
    storeTarget('4321')
    window.confirm = vi.fn(() => true)
    fetchState.mockResolvedValue({
      trackId: 'cur1',
      title: 'Actual',
      artist: 'Art',
      playing: true,
      notice: 'Borrada de la biblioteca: Actual',
    })
    render(<RemoteView />)

    expect(await screen.findByTestId('remote-notice')).toHaveTextContent(
      'Borrada de la biblioteca: Actual',
    )
    fireEvent.click(screen.getByTestId('remote-delete-current'))
    await waitFor(() =>
      expect(sendCommand).toHaveBeenCalledWith(
        's1',
        '4321',
        'deleteTrack',
        expect.objectContaining({
          id: 'cur1',
        }),
      ),
    )
  })

  it('muestra estado vacío cuando no hay resultados', async () => {
    storeTarget()
    searchSongs.mockResolvedValue([])
    render(<RemoteView />)

    const input = await screen.findByTestId('remote-search-input')
    fireEvent.change(input, { target: { value: 'zzz' } })
    fireEvent.click(screen.getByTitle('Buscar'))

    expect(await screen.findByText(/Sin resultados/)).toBeInTheDocument()
  })

  it('muestra error de búsqueda sin romper la vista', async () => {
    storeTarget()
    searchSongs.mockRejectedValue(new Error('boom'))
    render(<RemoteView />)

    const input = await screen.findByTestId('remote-search-input')
    fireEvent.change(input, { target: { value: 'zzz' } })
    fireEvent.click(screen.getByTitle('Buscar'))

    expect(await screen.findByText(/No se pudo buscar/)).toBeInTheDocument()
  })

  it('limpia un destino obsoleto cuando la sesión responde 404', async () => {
    storeTarget()
    fetchState.mockRejectedValue(
      Object.assign(new Error('no state'), { status: 404 }),
    )
    listSessions.mockResolvedValue([])

    render(<RemoteView />)

    await waitFor(() =>
      expect(window.localStorage.removeItem).toHaveBeenCalledWith(
        'remoteTarget',
      ),
    )
    expect(await screen.findByText(/ya no está disponible/)).toBeInTheDocument()
  })

  it('no sondea la lista de sesiones mientras hay destino emparejado', async () => {
    vi.useFakeTimers()
    storeTarget()
    fetchState.mockResolvedValue({})
    render(<RemoteView />)

    await act(async () => {
      await Promise.resolve()
    })
    expect(listSessions).toHaveBeenCalledTimes(1)

    await act(async () => {
      vi.advanceTimersByTime(15000)
    })
    expect(listSessions).toHaveBeenCalledTimes(1)
  })
  it('shows the next song and keeps search outside the playback card', async () => {
    fetchState.mockResolvedValue({
      title: 'Actual',
      nextTitle: 'Siguiente tema',
      nextArtist: 'Artista siguiente',
    })
    storeTarget()
    render(<RemoteView />)
    const next = await screen.findByTestId('remote-next-song')
    expect(next).toHaveTextContent('Siguiente tema')
    expect(next).toHaveTextContent('Artista siguiente')
    const search = screen.getByTestId('remote-search-input')
    expect(search.closest('.MuiCard-root')).not.toBe(
      next.closest('.MuiCard-root'),
    )
  })
  it('uses a volume slider and preserves the selected level until the laptop confirms it', async () => {
    storeTarget()
    fetchState.mockResolvedValue({ title: 'Tema', volume: 0.25 })
    render(<RemoteView />)
    const slider = await screen.findByTestId('remote-volume')
    await waitFor(() => expect(slider.value).toBe('25'))
    fireEvent.change(slider, { target: { value: '80' } })
    expect(slider.value).toBe('80')
    fireEvent.mouseUp(slider)
    await waitFor(() =>
      expect(sendCommand).toHaveBeenCalledWith(
        's1',
        '4321',
        'volume',
        expect.objectContaining({
          level: 0.8,
        }),
      ),
    )
    await waitFor(() => expect(slider).not.toBeDisabled())
    expect(slider.value).toBe('80')
    fireEvent.touchEnd(slider)
    expect(sendCommand).toHaveBeenCalledTimes(1)
    expect(screen.queryByTitle('Bajar volumen')).not.toBeInTheDocument()
  })

  it('allows zero volume and keyboard adjustments', async () => {
    storeTarget()
    fetchState.mockResolvedValue({ volume: 0.7 })
    render(<RemoteView />)
    const slider = await screen.findByTestId('remote-volume')
    fireEvent.change(slider, { target: { value: '0' } })
    fireEvent.keyUp(slider, { key: 'ArrowLeft' })
    await waitFor(() =>
      expect(sendCommand).toHaveBeenCalledWith(
        's1',
        '4321',
        'volume',
        expect.objectContaining({
          level: 0,
        }),
      ),
    )
    expect(slider.value).toBe('0')
  })
  it('shows the pending queue and waits for the laptop to acknowledge a command', async () => {
    storeTarget('4321')
    const snapshot = {
      at: new Date().toISOString(),
      title: 'Actual',
      queue: [{ id: 'q1', title: 'Petición pendiente', artist: 'Artista' }],
    }
    fetchState.mockResolvedValue(snapshot)
    sendCommand.mockImplementation(async (session, code, action, payload) => {
      fetchState.mockResolvedValue({
        ...snapshot,
        commandId: payload.requestId,
      })
    })
    render(<RemoteView />)
    expect(await screen.findByText('Petición pendiente')).toBeInTheDocument()
    expect(screen.getByText('Conectado')).toBeInTheDocument()
    fireEvent.click(screen.getByTitle('Play/Pausa'))
    expect(await screen.findByText('Orden aplicada')).toBeInTheDocument()
  })

  it('searches while typing without pressing a search button', async () => {
    storeTarget('4321')
    searchSongs.mockResolvedValue([
      { id: 'live', title: 'Resultado en vivo', artist: 'A' },
    ])
    render(<RemoteView />)
    fireEvent.change(await screen.findByTestId('remote-search-input'), {
      target: { value: 'live' },
    })
    expect(await screen.findByText('Resultado en vivo')).toBeInTheDocument()
  })
  it('places the editable pairing code before the playback controls', async () => {
    storeTarget('4321')
    render(<RemoteView />)
    const code = await screen.findByLabelText('Código de emparejamiento')
    const play = screen.getByTitle('Play/Pausa')
    expect(
      code.compareDocumentPosition(play) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })
  it('removes a specific queued occurrence remotely without deleting its file', async () => {
    storeTarget('4321')
    fetchState.mockResolvedValue({
      queue: [{ id: 's2', queueId: 'entry2', title: 'Pendiente', artist: 'A' }],
    })
    render(<RemoteView />)
    fireEvent.click(
      await screen.findByLabelText('Quitar de la cola: Pendiente'),
    )
    await waitFor(() =>
      expect(sendCommand).toHaveBeenCalledWith(
        's1',
        '4321',
        'removeQueuedTrack',
        expect.objectContaining({ queueId: 'entry2' }),
      ),
    )
  })
})

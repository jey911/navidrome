import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  createCommandDedupe,
  createRemoteTaskQueue,
  deleteTrackViaEmepetre,
  resolveContextIds,
  resolvePlayTrackId,
  runDedupedRemoteCommand,
  runRemoteCommand,
  toRelativeMusicPath,
} from './remoteCommands'
import { playerReducer } from '../reducers/playerReducer'
import {
  setTrack,
  addTracks,
  playNext,
  manualQueue,
  removeTrack,
} from '../actions'

describe('createCommandDedupe', () => {
  it('rechaza el mismo id repetido (SSE + /pending)', () => {
    const dedupe = createCommandDedupe()
    expect(dedupe.accept('cmd-1')).toBe(true)
    expect(dedupe.accept('cmd-1')).toBe(false)
    expect(dedupe.accept('cmd-1')).toBe(false)
  })

  it('acepta ids distintos', () => {
    const dedupe = createCommandDedupe()
    expect(dedupe.accept('cmd-1')).toBe(true)
    expect(dedupe.accept('cmd-2')).toBe(true)
    expect(dedupe.accept('cmd-3')).toBe(true)
  })

  it('deja pasar órdenes legadas sin id', () => {
    const dedupe = createCommandDedupe()
    expect(dedupe.accept(undefined)).toBe(true)
    expect(dedupe.accept(undefined)).toBe(true)
    expect(dedupe.accept('')).toBe(true)
  })

  it('acota la memoria: el id más viejo se libera', () => {
    const dedupe = createCommandDedupe(2)
    expect(dedupe.accept('a')).toBe(true)
    expect(dedupe.accept('b')).toBe(true)
    expect(dedupe.accept('c')).toBe(true)
    expect(dedupe.size).toBe(2)
    expect(dedupe.accept('a')).toBe(true)
  })
})

describe('runDedupedRemoteCommand', () => {
  it('ejecuta una sola vez el mismo id y ejecuta los distintos', () => {
    const dedupe = createCommandDedupe()
    const audioInstance = { playNext: vi.fn() }

    runDedupedRemoteCommand(
      dedupe,
      { id: 'cmd-1', action: 'next' },
      { audioInstance },
    )
    runDedupedRemoteCommand(
      dedupe,
      { id: 'cmd-1', action: 'next' },
      { audioInstance },
    )
    expect(audioInstance.playNext).toHaveBeenCalledTimes(1)

    runDedupedRemoteCommand(
      dedupe,
      { id: 'cmd-2', action: 'next' },
      { audioInstance },
    )
    expect(audioInstance.playNext).toHaveBeenCalledTimes(2)
  })

  it('sigue ejecutando órdenes legadas sin id', () => {
    const dedupe = createCommandDedupe()
    const audioInstance = { playNext: vi.fn() }

    runDedupedRemoteCommand(dedupe, { action: 'next' }, { audioInstance })
    runDedupedRemoteCommand(dedupe, { action: 'next' }, { audioInstance })

    expect(audioInstance.playNext).toHaveBeenCalledTimes(2)
  })
})

describe('resolvePlayTrackId', () => {
  it('acepta id, songId o trackId', () => {
    expect(resolvePlayTrackId({ id: 'a' })).toBe('a')
    expect(resolvePlayTrackId({ songId: 'b' })).toBe('b')
    expect(resolvePlayTrackId({ trackId: 'c' })).toBe('c')
  })

  it('devuelve null si falta el id', () => {
    expect(resolvePlayTrackId({})).toBeNull()
    expect(resolvePlayTrackId(null)).toBeNull()
    expect(resolvePlayTrackId({ id: '' })).toBeNull()
  })
})

describe('resolveContextIds', () => {
  it('acepta contextIds/queueIds/ids y deduplica en orden', () => {
    expect(
      resolveContextIds({ id: 'a', contextIds: ['a', 'b', 'a', 'c'] }),
    ).toEqual(['a', 'b', 'c'])
    expect(resolveContextIds({ queueIds: ['x'] })).toEqual(['x'])
    expect(resolveContextIds({ ids: ['y'] })).toEqual(['y'])
  })

  it('devuelve [] sin lista válida', () => {
    expect(resolveContextIds({})).toEqual([])
    expect(resolveContextIds(null)).toEqual([])
    expect(resolveContextIds({ contextIds: 'a' })).toEqual([])
    expect(resolveContextIds({ contextIds: ['a', 1, ''] })).toEqual(['a'])
  })
})

describe('runRemoteCommand playTrack con contexto', () => {
  it('plays only the selected song even with a legacy search context', async () => {
    const dataProvider = {
      getMany: vi.fn(),
      getOne: vi.fn().mockResolvedValue({ data: { id: 's2', title: 'Dos' } }),
    }
    const dispatch = vi.fn()
    runRemoteCommand(
      {
        action: 'playTrack',
        payload: { id: 's2', contextIds: ['s1', 's2', 's3'] },
      },
      { audioInstance: {}, dataProvider, dispatch },
    )
    await vi.waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith(
        setTrack({ id: 's2', title: 'Dos' }),
      ),
    )
    expect(dispatch.mock.calls[0][0]).toEqual(manualQueue())
    expect(dataProvider.getMany).not.toHaveBeenCalled()
  })

  it('sin contexto mantiene el tema suelto de antes', async () => {
    const dataProvider = {
      getMany: vi.fn(),
      getOne: vi.fn().mockResolvedValue({ data: { id: 's1', title: 'Uno' } }),
    }
    const dispatch = vi.fn()
    runRemoteCommand(
      { action: 'playTrack', payload: { id: 's1' } },
      { audioInstance: {}, dataProvider, dispatch },
    )
    await vi.waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith(
        setTrack({ id: 's1', title: 'Uno' }),
      ),
    )
    expect(dataProvider.getMany).not.toHaveBeenCalled()
  })
})

describe('runRemoteCommand', () => {
  it('resuelve playTrack por id y despacha setTrack (payload del Player)', async () => {
    const dataProvider = {
      getOne: vi.fn().mockResolvedValue({ data: { id: 's1', title: 'Tema' } }),
    }
    const dispatch = vi.fn()
    const audioInstance = { playNext: vi.fn() }

    const handled = runRemoteCommand(
      { action: 'playTrack', payload: { id: 's1' } },
      { audioInstance, dataProvider, dispatch },
    )

    expect(handled).toBe(true)
    expect(dataProvider.getOne).toHaveBeenCalledWith('song', { id: 's1' })
    await vi.waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith(
        setTrack({ id: 's1', title: 'Tema' }),
      ),
    )
  })

  it('ignora playTrack sin id resoluble', () => {
    const dataProvider = { getOne: vi.fn() }
    const dispatch = vi.fn()
    runRemoteCommand(
      { action: 'playTrack', payload: {} },
      { audioInstance: {}, dataProvider, dispatch },
    )
    expect(dataProvider.getOne).not.toHaveBeenCalled()
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('queueTrack añade una petición manual sin reemplazar la cola', async () => {
    const dataProvider = {
      getOne: vi.fn().mockResolvedValue({ data: { id: 's9', title: 'Nueve' } }),
    }
    const dispatch = vi.fn()
    const handled = runRemoteCommand(
      { action: 'queueTrack', payload: { id: 's9' } },
      { audioInstance: {}, dataProvider, dispatch },
    )
    expect(handled).toBe(true)
    await vi.waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith(
        addTracks({ s9: { id: 's9', title: 'Nueve' } }),
      ),
    )
  })

  it('playNextTrack inserta después del tema actual', async () => {
    const dataProvider = {
      getOne: vi.fn().mockResolvedValue({ data: { id: 's7', title: 'Siete' } }),
    }
    const dispatch = vi.fn()
    const handled = runRemoteCommand(
      { action: 'playNextTrack', payload: { id: 's7' } },
      { audioInstance: {}, dataProvider, dispatch },
    )
    expect(handled).toBe(true)
    await vi.waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith(
        playNext({ s7: { id: 's7', title: 'Siete' } }),
      ),
    )
  })

  it('ignora queueTrack sin id resoluble', () => {
    const dataProvider = { getOne: vi.fn() }
    const dispatch = vi.fn()
    expect(
      runRemoteCommand(
        { action: 'queueTrack', payload: {} },
        { audioInstance: {}, dataProvider, dispatch },
      ),
    ).toBe(false)
    expect(dataProvider.getOne).not.toHaveBeenCalled()
  })

  it('no reproduce localmente si no hay reproductor', () => {
    const dataProvider = { getOne: vi.fn() }
    const dispatch = vi.fn()
    expect(
      runRemoteCommand(
        { action: 'playTrack', payload: { id: 's1' } },
        { audioInstance: null, dataProvider, dispatch },
      ),
    ).toBe(false)
    expect(dataProvider.getOne).not.toHaveBeenCalled()
  })

  it('aplica órdenes de transporte y volumen', () => {
    const el = { volume: 0.5, playNext: vi.fn(), togglePlay: vi.fn() }
    runRemoteCommand({ action: 'next' }, { audioInstance: el })
    expect(el.playNext).toHaveBeenCalled()
    runRemoteCommand(
      { action: 'volume', payload: { delta: 0.25 } },
      { audioInstance: el },
    )
    expect(el.volume).toBe(0.75)
  })
})

describe('toRelativeMusicPath', () => {
  it('relativiza rutas bajo /music', () => {
    expect(toRelativeMusicPath('/music/Salsa/Tito/tema.mp3')).toBe(
      'Salsa/Tito/tema.mp3',
    )
  })
  it('rechaza rutas fuera de /music, vacías o con ..', () => {
    expect(toRelativeMusicPath('/other/x.mp3')).toBeNull()
    expect(toRelativeMusicPath('/music/')).toBeNull()
    expect(toRelativeMusicPath('/music/../x.mp3')).toBeNull()
    expect(toRelativeMusicPath(null)).toBeNull()
  })
})

describe('deleteTrackViaEmepetre', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ deleted: ['a.mp3'], errors: [] }),
      }),
    )
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('pide el borrado al mismo origen con cabecera XHR', async () => {
    await deleteTrackViaEmepetre('a.mp3')
    expect(fetch).toHaveBeenCalledWith(
      '/downloader/api/library/delete',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        body: JSON.stringify({ paths: ['a.mp3'] }),
      }),
    )
    expect(fetch.mock.calls[0][1].headers['X-Requested-With']).toBe(
      'XMLHttpRequest',
    )
  })

  it('el 401 se propaga con status para guiar al login', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 401 })
    await expect(deleteTrackViaEmepetre('a.mp3')).rejects.toMatchObject({
      status: 401,
    })
  })
})

describe('runRemoteCommand deleteTrack', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ deleted: ['Salsa/tema.mp3'], errors: [] }),
      }),
    )
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const song = {
    id: 's1',
    title: 'Tema',
    path: '/music/Salsa/tema.mp3',
  }

  it('borra, avanza si era la actual y avisa al mando', async () => {
    const dataProvider = { getOne: vi.fn().mockResolvedValue({ data: song }) }
    const dispatch = vi.fn()
    const notify = vi.fn()
    const audioInstance = { playNext: vi.fn() }
    const getPlayerState = () => ({
      queue: [{ trackId: 's1', uuid: 'u1' }],
      current: { trackId: 's1', uuid: 'u1' },
    })

    const handled = runRemoteCommand(
      { action: 'deleteTrack', payload: { id: 's1' } },
      { audioInstance, dataProvider, dispatch, getPlayerState, notify },
    )
    expect(handled).toBe(true)
    await vi.waitFor(() =>
      expect(notify).toHaveBeenCalledWith(
        expect.objectContaining({ notice: expect.stringContaining('Tema') }),
      ),
    )
    expect(audioInstance.playNext).toHaveBeenCalled()
    expect(dispatch).not.toHaveBeenCalledWith(removeTrack('s1'))
  })

  it('quita de la cola los temas futuros borrados sin cortar la actual', async () => {
    const dataProvider = {
      getOne: vi.fn().mockResolvedValue({ data: { ...song, id: 's9' } }),
    }
    const dispatch = vi.fn()
    const notify = vi.fn()
    const audioInstance = { playNext: vi.fn() }
    const getPlayerState = () => ({
      queue: [
        { trackId: 's1', uuid: 'u1' },
        { trackId: 's9', uuid: 'u9' },
      ],
      current: { trackId: 's1', uuid: 'u1' },
    })

    runRemoteCommand(
      { action: 'deleteTrack', payload: { id: 's9' } },
      { audioInstance, dataProvider, dispatch, getPlayerState, notify },
    )
    await vi.waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith(removeTrack('s9')),
    )
    expect(audioInstance.playNext).not.toHaveBeenCalled()
  })

  it('sin sesión del Downloader avisa de iniciar sesión en el laptop', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 401 })
    const dataProvider = { getOne: vi.fn().mockResolvedValue({ data: song }) }
    const notify = vi.fn()
    runRemoteCommand(
      { action: 'deleteTrack', payload: { id: 's1' } },
      { audioInstance: {}, dataProvider, dispatch: vi.fn(), notify },
    )
    await vi.waitFor(() =>
      expect(notify).toHaveBeenCalledWith(
        expect.objectContaining({
          notice: expect.stringContaining('Downloader'),
        }),
      ),
    )
  })

  it('muestra el detalle del servidor cuando el borrado falla', async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ detail: 'disco lleno' }),
    })
    const dataProvider = { getOne: vi.fn().mockResolvedValue({ data: song }) }
    const notify = vi.fn()
    runRemoteCommand(
      { action: 'deleteTrack', payload: { id: 's1' } },
      { audioInstance: {}, dataProvider, dispatch: vi.fn(), notify },
    )
    await vi.waitFor(() =>
      expect(notify).toHaveBeenCalledWith(
        expect.objectContaining({
          notice: expect.stringContaining('disco lleno'),
        }),
      ),
    )
  })

  it('muestra el status si el error no trae detalle', async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error('no json')
      },
    })
    const dataProvider = { getOne: vi.fn().mockResolvedValue({ data: song }) }
    const notify = vi.fn()
    runRemoteCommand(
      { action: 'deleteTrack', payload: { id: 's1' } },
      { audioInstance: {}, dataProvider, dispatch: vi.fn(), notify },
    )
    await vi.waitFor(() =>
      expect(notify).toHaveBeenCalledWith(
        expect.objectContaining({ notice: expect.stringContaining('502') }),
      ),
    )
  })

  it('ignora deleteTrack sin id resoluble', () => {
    const dataProvider = { getOne: vi.fn() }
    const dispatch = vi.fn()
    expect(
      runRemoteCommand(
        { action: 'deleteTrack', payload: {} },
        { audioInstance: {}, dataProvider, dispatch },
      ),
    ).toBe(false)
    expect(dataProvider.getOne).not.toHaveBeenCalled()
  })
})

it('keeps rapid queue requests in arrival order despite a slow first lookup', async () => {
  let resolveFirst
  const first = new Promise((resolve) => {
    resolveFirst = resolve
  })
  const provider = {
    getOne: vi
      .fn()
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce({ data: { id: 'second' } }),
  }
  const dispatch = vi.fn()
  const deps = {
    audioInstance: {},
    dataProvider: provider,
    dispatch,
    enqueue: createRemoteTaskQueue(),
  }
  runRemoteCommand({ action: 'queueTrack', payload: { id: 'first' } }, deps)
  runRemoteCommand({ action: 'queueTrack', payload: { id: 'second' } }, deps)
  await vi.waitFor(() => expect(provider.getOne).toHaveBeenCalledTimes(1))
  expect(dispatch).not.toHaveBeenCalled()
  resolveFirst({ data: { id: 'first' } })
  await vi.waitFor(() => expect(dispatch).toHaveBeenCalledTimes(4))
  expect(
    dispatch.mock.calls
      .filter(([action]) => action.data)
      .map(([action]) => Object.keys(action.data)[0]),
  ).toEqual(['first', 'second'])
})

it('remote play and additions use the same manual FIFO queue as the library', async () => {
  let state = {
    queue: [
      { uuid: 'a', trackId: 'actual' },
      { uuid: 'dj', trackId: 'automatic' },
    ],
    current: { uuid: 'a', trackId: 'actual' },
    savedPlayIndex: 0,
  }
  const dataProvider = {
    getOne: vi.fn(async (_, { id }) => ({ data: { id, title: id } })),
  }
  const deps = {
    audioInstance: {},
    dataProvider,
    dispatch: (action) => {
      state = playerReducer(state, action)
    },
    enqueue: createRemoteTaskQueue(),
  }
  runRemoteCommand({ action: 'queueTrack', payload: { id: 'm1' } }, deps)
  runRemoteCommand({ action: 'queueTrack', payload: { id: 'm2' } }, deps)
  await vi.waitFor(() =>
    expect(state.queue.map((x) => x.trackId)).toEqual(['actual', 'm1', 'm2']),
  )
  runRemoteCommand(
    {
      action: 'playTrack',
      payload: { id: 'chosen', contextIds: ['chosen', 'unrequested'] },
    },
    deps,
  )
  await vi.waitFor(() =>
    expect(state.queue.map((x) => x.trackId)).toEqual(['chosen', 'm1', 'm2']),
  )
  runRemoteCommand({ action: 'queueTrack', payload: { id: 'm3' } }, deps)
  await vi.waitFor(() =>
    expect(state.queue.map((x) => x.trackId)).toEqual([
      'chosen',
      'm1',
      'm2',
      'm3',
    ]),
  )
  expect(state.manualOnly).toBe(true)
  expect(
    playerReducer(
      state,
      addTracks({ extra: { id: 'extra' } }, undefined, { automatic: true }),
    ),
  ).toBe(state)
})

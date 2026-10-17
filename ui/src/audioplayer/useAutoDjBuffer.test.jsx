import { renderHook, act } from '@testing-library/react-hooks'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import subsonic from '../subsonic'
import { addTracks } from '../actions'
import useAutoDjBuffer from './useAutoDjBuffer'

vi.mock('../subsonic', () => ({
  default: {
    streamUrl: (id) => `/stream/${id}`,
    getCoverArtUrl: () => '',
    getRandomSongs: vi.fn(),
    getTopSongs: vi.fn(),
    getSongsByGenre: vi.fn(),
  },
}))

beforeEach(() => {
  subsonic.getRandomSongs.mockReset()
})
afterEach(() => {
  vi.restoreAllMocks()
})

const randomResponse = (songs) => ({
  json: {
    'subsonic-response': { status: 'ok', randomSongs: { song: songs } },
  },
})

const song = (id) => ({ id, title: id, artist: 'X', duration: 200 })

const makeState = ({ ahead = 0, uuid = 'a' } = {}) => {
  const current = { uuid, trackId: uuid, song: song(uuid) }
  const queue = [
    current,
    ...Array.from({ length: ahead }, (_, i) => ({
      uuid: `n${i}`,
      trackId: `n${i}`,
      song: song(`n${i}`),
    })),
  ]
  return { manualOnly: true, queue, current, savedPlayIndex: 0, mode: 'order' }
}

const setup = ({ state, enabled = true, audio = {} } = {}) => {
  const dispatch = vi.fn()
  const audioInstanceRef = {
    current: { ended: false, playNext: vi.fn(), ...audio },
  }
  const hook = renderHook(
    ({ playerState }) =>
      useAutoDjBuffer({
        enabled,
        manualOnly: true,
        playerState,
        dispatch,
        audioInstanceRef,
      }),
    { initialProps: { playerState: state } },
  )
  return { hook, dispatch, audioInstanceRef }
}

it('con el buffer vacío pide aleatorios de todo el catálogo y los añade como automáticos', async () => {
  subsonic.getRandomSongs.mockResolvedValue(
    randomResponse([song('r1'), song('r2'), song('r3')]),
  )
  const { dispatch } = setup({ state: makeState({ ahead: 0 }) })
  await act(async () => {})
  expect(subsonic.getRandomSongs).toHaveBeenCalled()
  expect(subsonic.getSongsByGenre).not.toHaveBeenCalled()
  expect(subsonic.getTopSongs).not.toHaveBeenCalled()
  const action = dispatch.mock.calls[0][0]
  expect(action.type).toBe('PLAYER_ADD_TRACKS')
  expect(action.automatic).toBe(true)
  expect(Object.keys(action.data)).toEqual(['r1', 'r2', 'r3'])
})

it('no pide más si ya quedan varios temas por delante', async () => {
  const { dispatch } = setup({ state: makeState({ ahead: 3 }) })
  await act(async () => {})
  expect(subsonic.getRandomSongs).not.toHaveBeenCalled()
  expect(dispatch).not.toHaveBeenCalled()
})

it('no pide nada cuando el Auto-DJ está apagado', async () => {
  setup({ state: makeState({ ahead: 0 }), enabled: false })
  await act(async () => {})
  expect(subsonic.getRandomSongs).not.toHaveBeenCalled()
})

it('fin de tema sin nada por delante: pide y reanuda solo si sigue detenido', async () => {
  subsonic.getRandomSongs.mockResolvedValue(randomResponse([song('r1')]))
  const audio = { ended: true, playNext: vi.fn() }
  const { hook, dispatch } = setup({
    state: makeState({ ahead: 0 }),
    audio,
  })
  await act(async () => {})
  dispatch.mockClear()
  hook.result.current.handleEnded({
    uuid: 'a',
    trackId: 'a',
    song: { id: 'a' },
  })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 700))
  })
  expect(dispatch).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'PLAYER_ADD_TRACKS' }),
  )
  expect(audio.playNext).toHaveBeenCalled()
})

it('fin de tema con temas por delante: no pide nada extra', async () => {
  const { hook, dispatch } = setup({ state: makeState({ ahead: 3 }) })
  await act(async () => {})
  dispatch.mockClear()
  hook.result.current.handleEnded({ uuid: 'a', trackId: 'a' })
  await act(async () => {})
  expect(subsonic.getRandomSongs).not.toHaveBeenCalled()
  expect(dispatch).not.toHaveBeenCalled()
})

it('no reanuda si el usuario ya había arrancado otra cosa', async () => {
  subsonic.getRandomSongs.mockResolvedValue(randomResponse([song('r1')]))
  const audio = { ended: false, playNext: vi.fn() }
  const { hook } = setup({ state: makeState({ ahead: 0 }), audio })
  await act(async () => {})
  hook.result.current.handleEnded({ uuid: 'a', trackId: 'a' })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 700))
  })
  expect(audio.playNext).not.toHaveBeenCalled()
})

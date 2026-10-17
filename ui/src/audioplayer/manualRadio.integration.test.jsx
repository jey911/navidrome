import React, { createRef, useMemo, useRef } from 'react'
import { combineReducers, createStore } from 'redux'
import { Provider, useDispatch, useSelector } from 'react-redux'
import { act, render, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'

let MusicPlayer
let sortable
beforeAll(async () => {
  // La librería monta el plugin de arrastre al importarse; en Node el build
  // CJS no expone `Swap`, así que se sustituye antes del import y se anula el
  // montaje real (el arrastre está fuera del alcance de esta prueba).
  const require = createRequire(import.meta.url)
  sortable = require('sortablejs')
  sortable.Swap = class {}
  vi.spyOn(sortable, 'mount').mockImplementation(() => {})
  vi.spyOn(sortable.prototype, 'destroy').mockImplementation(() => {})
  MusicPlayer = (await import('navidrome-music-player')).default
})

import subsonic from '../subsonic'
import { playerReducer } from '../reducers/playerReducer'
import useAutoDjBuffer from './useAutoDjBuffer'
import {
  addTracks,
  manualQueue,
  setTrack,
  syncQueue,
  currentPlaying,
} from '../actions'
import useStyle from './styles'
import { setViewport } from '../setupTests'

vi.mock('../subsonic', () => ({
  default: {
    streamUrl: (id) => `/stream/${id}`,
    getCoverArtUrl: () => '',
    getRandomSongs: vi.fn(),
    getTopSongs: vi.fn(),
    getSongsByGenre: vi.fn(),
  },
}))

let mediaSpies = []
beforeEach(() => {
  setViewport({ phone: true })
  mediaSpies = [
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(),
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {}),
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {}),
  ]
  subsonic.getRandomSongs.mockReset()
})
afterEach(() => {
  mediaSpies.forEach((spy) => spy.mockRestore())
  setViewport({ phone: false })
})

const randomResponse = (songs) => ({
  json: {
    'subsonic-response': { status: 'ok', randomSongs: { song: songs } },
  },
})

const song = (id, title) => ({
  id,
  title,
  artist: 'Artista ' + id,
  artistId: 'artist-' + id,
  albumId: 'album-' + id,
  duration: 200,
})

const randomSongs = (from) =>
  [
    'r' + from,
    'r' + (from + 1),
    'r' + (from + 2),
    'r' + (from + 3),
    'r' + (from + 4),
  ].map((id) => song(id, id.toUpperCase()))

const Harness = ({ playerRef }) => {
  const classes = useStyle({ visible: true, inlineOnly: true })
  const playerState = useSelector((state) => state.player)
  const dispatch = useDispatch()
  const audioInstanceRef = useRef(null)
  const { handleEnded } = useAutoDjBuffer({
    enabled: true,
    manualOnly: true,
    playerState,
    dispatch,
    audioInstanceRef,
  })
  const options = useMemo(
    () => ({
      audioLists: playerState.queue.map((item) => item),
      playMode: 'order',
      playIndex: playerState.playIndex,
      clearPriorAudioLists: playerState.clear,
      autoPlay:
        playerState.queue.length > 0 &&
        playerState.autoPlay !== false &&
        (playerState.clear || playerState.playIndex === 0),
      quietUpdate: true,
      mode: 'mini',
      mobileMediaQuery: '(max-width: 768px)',
      showMediaSession: false,
      autoPlayInitLoadPlayList: true,
    }),
    [playerState],
  )
  return (
    <MusicPlayer
      ref={playerRef}
      {...options}
      className={classes.player}
      onAudioListsChange={(_, audioLists, info) =>
        dispatch(syncQueue(info, audioLists))
      }
      onAudioPlay={(info) => dispatch(currentPlaying(info))}
      onAudioEnded={(_, __, info) => {
        dispatch(currentPlaying(info))
        handleEnded(info)
      }}
      getAudioInstance={(instance) => {
        audioInstanceRef.current = instance
      }}
    />
  )
}

// Simula el navegador: la reproducción real dispara `play` y, al agotarse el
// archivo, marca `ended` y dispara `ended`.
const attachAudioEvents = (audio) => {
  let ended = false
  Object.defineProperty(audio, 'ended', {
    configurable: true,
    get: () => ended,
  })
  return {
    play: () => {
      act(() => {
        audio.dispatchEvent(new Event('play'))
      })
    },
    end: () => {
      act(() => {
        ended = true
        audio.dispatchEvent(new Event('ended'))
      })
    },
  }
}

const start = async () => {
  const store = createStore(combineReducers({ player: playerReducer }))
  store.dispatch(manualQueue())
  store.dispatch(setTrack(song('a', 'Actual')))
  const ref = createRef()
  const view = render(
    <Provider store={store}>
      <Harness playerRef={ref} />
    </Provider>,
  )
  await waitFor(() => expect(ref.current.state.name).toBe('Actual'))
  const events = attachAudioEvents(ref.current.audio)
  events.play()
  return { store, ref, view, events }
}

const queueIds = (store) =>
  store.getState().player.queue.map((item) => item.trackId)

it('llena la cola con aleatorios y «siguiente» avanza sin rebotar al tema anterior', async () => {
  subsonic.getRandomSongs.mockResolvedValue(randomResponse(randomSongs(1)))
  const { store, ref, events } = await start()
  await waitFor(() =>
    expect(queueIds(store)).toEqual(['a', 'r1', 'r2', 'r3', 'r4', 'r5']),
  )
  act(() => ref.current.audio.playNext())
  await waitFor(() => expect(ref.current.state.name).toBe('R1'))
  events.play()
  act(() => ref.current.audio.playNext())
  await waitFor(() => expect(ref.current.state.name).toBe('R2'))
  expect(ref.current.state.name).not.toBe('Actual')
})

it('al terminar un tema sin cola manual avanza con el buffer aleatorio sin pausar', async () => {
  subsonic.getRandomSongs.mockResolvedValue(randomResponse(randomSongs(1)))
  const { store, ref, events } = await start()
  await waitFor(() =>
    expect(queueIds(store)).toEqual(['a', 'r1', 'r2', 'r3', 'r4', 'r5']),
  )
  events.end()
  expect(HTMLMediaElement.prototype.pause).not.toHaveBeenCalled()
  expect(ref.current.state.name).toBe('R1')
})

it('si el buffer llega después del fin del tema, la música se reanuda sola', async () => {
  let resolveRandom
  subsonic.getRandomSongs.mockReturnValue(
    new Promise((resolve) => {
      resolveRandom = resolve
    }),
  )
  const { store, ref, events } = await start()
  events.end()
  // Sin buffer todavía el reproductor pausa en el último tema…
  expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled()
  await act(async () => resolveRandom(randomResponse(randomSongs(1))))
  // …pero al llegar los aleatorios continúa sin intervención del usuario.
  await waitFor(() => expect(ref.current.state.name).toBe('R1'), {
    timeout: 3000,
  })
  expect(queueIds(store)).toEqual(['a', 'r1', 'r2', 'r3', 'r4', 'r5'])
})

it('la cola manual suena antes que el buffer y sigue visible; el buffer queda oculto', async () => {
  subsonic.getRandomSongs.mockResolvedValue(randomResponse(randomSongs(1)))
  const { store, ref, events } = await start()
  await waitFor(() =>
    expect(queueIds(store)).toEqual(['a', 'r1', 'r2', 'r3', 'r4', 'r5']),
  )
  act(() => {
    store.dispatch(addTracks({ m: song('m', 'Peticion') }))
  })
  expect(queueIds(store)).toEqual(['a', 'm', 'r1', 'r2', 'r3', 'r4', 'r5'])
  const queued = store
    .getState()
    .player.queue.filter((item) => item.manualQueued)
  expect(queued.map((item) => item.trackId)).toEqual(['m'])
  act(() => ref.current.audio.playNext())
  await waitFor(() => expect(ref.current.state.name).toBe('Peticion'))
  events.play()
  events.end()
  expect(ref.current.state.name).toBe('R1')
})

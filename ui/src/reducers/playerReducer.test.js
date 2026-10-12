import { describe, it, expect } from 'vitest'
import { playerReducer } from './playerReducer'
import {
  PLAYER_SYNC_QUEUE,
  PLAYER_CURRENT,
  PLAYER_REFRESH_QUEUE,
  PLAYER_REMOVE_TRACK,
  addTracks,
  manualQueue,
  playTracks,
  playNext,
  setTrack,
} from '../actions'

describe('playerReducer', () => {
  describe('pending track selection survives SYNC_QUEUE and premature CURRENT', () => {
    // Simulates the real sequence when clicking a new song while one is playing:
    // 1. PLAYER_PLAY_TRACKS sets playIndex and clear
    // 2. PLAYER_SYNC_QUEUE fires when music player syncs its internal queue
    // 3. PLAYER_CURRENT fires for the OLD still-playing track
    // 4. PLAYER_CURRENT fires for the NEW track (player switched)
    const stateAfterPlayTracks = {
      queue: [
        { trackId: 's1', uuid: 'aaa', name: 'Song 1' },
        { trackId: 's2', uuid: 'bbb', name: 'Song 2' },
        { trackId: 's3', uuid: 'ccc', name: 'Song 3' },
      ],
      current: { uuid: 'ccc', name: 'Song 3' },
      playIndex: 0, // user clicked Song 1
      savedPlayIndex: 2, // Song 3 was playing
      clear: true,
      volume: 1,
    }

    it('SYNC_QUEUE preserves pending playIndex and clear', () => {
      const newQueue = [
        { trackId: 's1', uuid: 'xxx', name: 'Song 1' },
        { trackId: 's2', uuid: 'yyy', name: 'Song 2' },
        { trackId: 's3', uuid: 'zzz', name: 'Song 3' },
      ]
      const action = {
        type: PLAYER_SYNC_QUEUE,
        data: { audioInfo: {}, audioLists: newQueue },
      }
      const result = playerReducer(stateAfterPlayTracks, action)
      expect(result.playIndex).toBe(0)
      expect(result.clear).toBe(true)
      expect(result.queue).toBe(newQueue)
    })

    it('SYNC_QUEUE clears playIndex when no pending selection', () => {
      const stateNoPending = { ...stateAfterPlayTracks, playIndex: undefined }
      const action = {
        type: PLAYER_SYNC_QUEUE,
        data: { audioInfo: {}, audioLists: stateNoPending.queue },
      }
      const result = playerReducer(stateNoPending, action)
      expect(result.playIndex).toBeUndefined()
      expect(result.clear).toBe(false)
    })

    it('CURRENT for old track preserves pending playIndex', () => {
      // After SYNC_QUEUE, queue has new UUIDs. The old track's UUID (zzz)
      // is at index 2, but playIndex is 0. This is a premature callback.
      const stateAfterSync = {
        ...stateAfterPlayTracks,
        queue: [
          { trackId: 's1', uuid: 'xxx', name: 'Song 1' },
          { trackId: 's2', uuid: 'yyy', name: 'Song 2' },
          { trackId: 's3', uuid: 'zzz', name: 'Song 3' },
        ],
      }
      const action = {
        type: PLAYER_CURRENT,
        data: { uuid: 'zzz', name: 'Song 3', volume: 1 },
      }
      const result = playerReducer(stateAfterSync, action)
      expect(result.playIndex).toBe(0)
      expect(result.clear).toBe(true)
      expect(result.savedPlayIndex).toBe(2) // preserved from before
    })

    it('CURRENT for correct track consumes pending playIndex', () => {
      const stateAfterSync = {
        ...stateAfterPlayTracks,
        queue: [
          { trackId: 's1', uuid: 'xxx', name: 'Song 1' },
          { trackId: 's2', uuid: 'yyy', name: 'Song 2' },
          { trackId: 's3', uuid: 'zzz', name: 'Song 3' },
        ],
      }
      // Player switched to Song 1 (uuid 'xxx', index 0 == playIndex)
      const action = {
        type: PLAYER_CURRENT,
        data: { uuid: 'xxx', name: 'Song 1', volume: 1 },
      }
      const result = playerReducer(stateAfterSync, action)
      expect(result.playIndex).toBeUndefined()
      expect(result.clear).toBe(false)
      expect(result.savedPlayIndex).toBe(0)
      expect(result.current.name).toBe('Song 1')
    })
  })

  describe('play new album after closing player (issue #5440)', () => {
    it('SYNC_QUEUE preserves pending playIndex=0 after clearQueue', () => {
      // Scenario: user plays album A, advances to track 3, closes player,
      // then plays album B. After clearQueue, savedPlayIndex=0.
      // PLAYER_PLAY_TRACKS sets playIndex=0. SYNC_QUEUE must NOT clear it.
      const stateAfterClearThenPlay = {
        queue: [
          { trackId: 'b1', uuid: 'u1', name: 'B Song 1' },
          { trackId: 'b2', uuid: 'u2', name: 'B Song 2' },
          { trackId: 'b3', uuid: 'u3', name: 'B Song 3' },
        ],
        current: {},
        playIndex: 0,
        savedPlayIndex: 0, // reset by clearQueue
        clear: true,
        volume: 1,
      }

      const action = {
        type: PLAYER_SYNC_QUEUE,
        data: {
          audioInfo: {},
          audioLists: stateAfterClearThenPlay.queue,
        },
      }
      const result = playerReducer(stateAfterClearThenPlay, action)
      expect(result.playIndex).toBe(0)
      expect(result.clear).toBe(true)
    })

    it('CURRENT for wrong track preserves pending playIndex=0 after clearQueue', () => {
      // The music player fires onAudioPlay for the old track (at index 3)
      // before switching to the new track at index 0.
      const stateAfterClearThenPlay = {
        queue: [
          { trackId: 'b1', uuid: 'u1', name: 'B Song 1' },
          { trackId: 'b2', uuid: 'u2', name: 'B Song 2' },
          { trackId: 'b3', uuid: 'u3', name: 'B Song 3' },
          { trackId: 'b4', uuid: 'u4', name: 'B Song 4' },
        ],
        current: {},
        playIndex: 0,
        savedPlayIndex: 0,
        clear: true,
        volume: 1,
      }

      // Player reports track at index 3 as current (stale callback)
      const action = {
        type: PLAYER_CURRENT,
        data: { uuid: 'u4', name: 'B Song 4', volume: 1 },
      }
      const result = playerReducer(stateAfterClearThenPlay, action)
      expect(result.playIndex).toBe(0)
      expect(result.clear).toBe(true)
    })

    it('CURRENT for correct track consumes pending playIndex=0', () => {
      const stateAfterClearThenPlay = {
        queue: [
          { trackId: 'b1', uuid: 'u1', name: 'B Song 1' },
          { trackId: 'b2', uuid: 'u2', name: 'B Song 2' },
        ],
        current: {},
        playIndex: 0,
        savedPlayIndex: 0,
        clear: true,
        volume: 1,
      }

      // Player confirms it switched to track at index 0
      const action = {
        type: PLAYER_CURRENT,
        data: { uuid: 'u1', name: 'B Song 1', volume: 1 },
      }
      const result = playerReducer(stateAfterClearThenPlay, action)
      expect(result.playIndex).toBeUndefined()
      expect(result.clear).toBe(false)
      expect(result.savedPlayIndex).toBe(0)
    })
  })

  describe('PLAYER_REFRESH_QUEUE', () => {
    it('clamps negative savedPlayIndex to 0', () => {
      const state = {
        queue: [
          { trackId: 'song-1', musicSrc: 'old-url', uuid: 'a' },
          { trackId: 'song-2', musicSrc: 'old-url', uuid: 'b' },
        ],
        savedPlayIndex: -1,
        current: {},
        clear: false,
        volume: 1,
      }
      const action = { type: PLAYER_REFRESH_QUEUE, data: {} }
      const result = playerReducer(state, action)
      expect(result.playIndex).toBe(0)
    })

    it('preserves valid savedPlayIndex', () => {
      const state = {
        queue: [
          { trackId: 'song-1', musicSrc: 'old-url', uuid: 'a' },
          { trackId: 'song-2', musicSrc: 'old-url', uuid: 'b' },
        ],
        savedPlayIndex: 1,
        current: {},
        clear: false,
        volume: 1,
      }
      const action = { type: PLAYER_REFRESH_QUEUE, data: {} }
      const result = playerReducer(state, action)
      expect(result.playIndex).toBe(1)
    })

    it('uses savedPlayIndex of 0 correctly', () => {
      const state = {
        queue: [{ trackId: 'song-1', musicSrc: 'old-url', uuid: 'a' }],
        savedPlayIndex: 0,
        current: {},
        clear: false,
        volume: 1,
      }
      const action = { type: PLAYER_REFRESH_QUEUE, data: {} }
      const result = playerReducer(state, action)
      expect(result.playIndex).toBe(0)
    })
  })

  describe('PLAYER_REMOVE_TRACK', () => {
    const state = {
      queue: [
        { trackId: 's1', uuid: 'u1', name: 'Song 1' },
        { trackId: 's2', uuid: 'u2', name: 'Song 2' },
        { trackId: 's3', uuid: 'u3', name: 'Song 3' },
      ],
      current: { trackId: 's1', uuid: 'u1' },
      savedPlayIndex: 0,
      clear: false,
      volume: 1,
    }

    it('filtra el tema futuro y conserva el actual y el índice', () => {
      const result = playerReducer(state, {
        type: PLAYER_REMOVE_TRACK,
        data: { trackId: 's3' },
      })
      expect(result.queue.map((i) => i.trackId)).toEqual(['s1', 's2'])
      expect(result.savedPlayIndex).toBe(0)
      expect(result.current).toEqual(state.current)
      expect(result.clear).toBe(false)
    })

    it('no toca nada si el trackId no está en cola', () => {
      const result = playerReducer(state, {
        type: PLAYER_REMOVE_TRACK,
        data: { trackId: 'zzz' },
      })
      expect(result).toBe(state)
    })

    it('no hace nada sin trackId', () => {
      const result = playerReducer(state, {
        type: PLAYER_REMOVE_TRACK,
        data: {},
      })
      expect(result).toBe(state)
    })
  })
})

describe('manual queue priority', () => {
  const makeState = () => ({
    queue: [
      { trackId: 'playing', uuid: 'a', song: { title: 'Actual' } },
      { trackId: 'context', uuid: 'b' },
      { trackId: 'automatic', uuid: 'c' },
    ],
    current: { uuid: 'a', trackId: 'playing' },
    savedPlayIndex: 0,
    mode: 'shufflePlay',
  })
  it('inserts manual requests before context/Auto-DJ in FIFO order without mutating Redux', () => {
    const state = makeState()
    Object.freeze(state.queue)
    const first = playerReducer(
      state,
      addTracks({ m1: { id: 'm1', title: 'Uno' } }),
    )
    const second = playerReducer(
      first,
      addTracks({ m2: { id: 'm2', title: 'Dos' } }),
    )
    expect(state.queue.map((x) => x.trackId)).toEqual([
      'playing',
      'context',
      'automatic',
    ])
    expect(second.queue.map((x) => x.trackId)).toEqual([
      'playing',
      'm1',
      'm2',
      'context',
      'automatic',
    ])
    expect(second.queue[1].manualQueued).toBe(true)
    expect(second.current).toBe(state.current)
    expect(second.savedPlayIndex).toBe(0)
    expect(second.playIndex).toBeUndefined()
  })
  it('appends automatic tracks after manual requests', () => {
    const queued = playerReducer(makeState(), addTracks({ m: { id: 'm' } }))
    const result = playerReducer(
      queued,
      addTracks({ dj: { id: 'dj' } }, undefined, { automatic: true }),
    )
    expect(result.queue.map((x) => x.trackId)).toEqual([
      'playing',
      'm',
      'context',
      'automatic',
      'dj',
    ])
    expect(result.queue.at(-1).manualQueued).toBe(false)
  })
  it('play next takes priority without changing the current song', () => {
    const queued = playerReducer(makeState(), addTracks({ m: { id: 'm' } }))
    const result = playerReducer(queued, playNext({ n: { id: 'n' } }))
    expect(result.queue.map((x) => x.trackId)).toEqual([
      'playing',
      'n',
      'm',
      'context',
      'automatic',
    ])
    expect(result.current).toBe(queued.current)
  })
  it('a user play restores autoplay after queue restoration disabled it', () => {
    const result = playerReducer(
      { ...makeState(), autoPlay: false },
      setTrack({ id: 'new' }),
    )
    expect(result.autoPlay).toBe(true)
    expect(result.playIndex).toBe(0)
  })
})

it('consumes the manual priority marker when that song starts', () => {
  const state = {
    queue: [
      { trackId: 'm1', uuid: 'm', manualQueued: true },
      { trackId: 'm2', uuid: 'n', manualQueued: true },
    ],
    current: {},
  }
  const result = playerReducer(state, {
    type: PLAYER_CURRENT,
    data: { uuid: 'm', trackId: 'm1' },
  })
  expect(result.queue[0].manualQueued).toBe(false)
  expect(result.queue[1].manualQueued).toBe(true)
  expect(state.queue[0].manualQueued).toBe(true)
})

it('mobile manual mode removes automatic fill while retaining current playback and explicit requests', () => {
  const state = {
    queue: [
      { uuid: 'now', trackId: 'now' },
      { uuid: 'dj', trackId: 'dj' },
      { uuid: 'm', trackId: 'm', manualQueued: true },
    ],
    current: { uuid: 'now', trackId: 'now' },
    savedPlayIndex: 0,
  }
  const result = playerReducer(state, manualQueue())
  expect(result.queue.map((x) => x.trackId)).toEqual(['now', 'm'])
  expect(result.manualOnly).toBe(true)
  expect(result.autoPlay).toBe(false)
  expect(result.current).toBe(state.current)
  expect(
    playerReducer(
      result,
      addTracks({ dj2: { id: 'dj2' } }, undefined, { automatic: true }),
    ),
  ).toBe(result)
  const selected = playerReducer(result, setTrack({ id: 'selected' }))
  expect(selected.queue.map((x) => x.trackId)).toEqual(['selected', 'm'])
  const context = playerReducer(
    result,
    playTracks({ a: { id: 'a' }, b: { id: 'b' } }, ['a', 'b'], 'b'),
  )
  expect(context.queue.map((x) => x.trackId)).toEqual(['b', 'm'])
})

it('mobile mode starts with an empty pending queue when no manual request exists', () => {
  const result = playerReducer(
    { queue: [{ uuid: 'old', trackId: 'old' }], current: {} },
    manualQueue(),
  )
  expect(result.queue).toEqual([])
  const selected = playerReducer(result, setTrack({ id: 'chosen' }))
  expect(selected.queue.map((x) => x.trackId)).toEqual(['chosen'])
})

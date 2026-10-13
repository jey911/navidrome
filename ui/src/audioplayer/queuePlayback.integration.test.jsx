import React, { createRef } from 'react'
import { act, render, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
let MusicPlayer
beforeAll(async () => {
  // Sortable's optional drag plugin is not exposed by its Node CJS build.
  // Dragging is outside this playback integration test.
  const require = createRequire(import.meta.url)
  const sortable = require('sortablejs')
  sortable.Swap = class {}
  vi.spyOn(sortable, 'mount').mockImplementation(() => {})
  MusicPlayer = (await import('navidrome-music-player')).default
})
import useStyle from './styles'
import { setViewport } from '../setupTests'

beforeEach(() => {
  setViewport({ phone: true })
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
  setViewport({ phone: false })
})

const InlinePlayer = ({ playerRef, ...props }) => {
  const classes = useStyle({ visible: true, inlineOnly: true })
  return <MusicPlayer ref={playerRef} {...props} className={classes.player} />
}

it('reorders and removes pending tracks without restarting playback, then plays the manual next song', async () => {
  const ref = createRef()
  const a = { uuid: 'a', trackId: 'a', name: 'Actual', musicSrc: '/a.mp3' }
  const b = { uuid: 'b', trackId: 'b', name: 'Auto-DJ', musicSrc: '/b.mp3' }
  const m = {
    uuid: 'm',
    trackId: 'm',
    name: 'Manual',
    manualQueued: true,
    musicSrc: '/m.mp3',
  }
  const props = {
    playerRef: ref,
    getAudioInstance: vi.fn(),
    mode: 'mini',
    quietUpdate: true,
    clearPriorAudioLists: true,
    playMode: 'order',
    autoPlay: true,
    autoPlayInitLoadPlayList: true,
    mobileMediaQuery: '(max-width: 768px)',
    showMediaSession: false,
  }
  const view = render(<InlinePlayer {...props} audioLists={[a, b]} />)
  await waitFor(() => expect(ref.current.state.name).toBe('Actual'))
  const playingId = ref.current.state.playId
  ref.current.audio.currentTime = 42
  view.rerender(<InlinePlayer {...props} audioLists={[a, m, b]} />)
  await waitFor(() =>
    expect(ref.current.state.audioLists.map((x) => x.trackId)).toEqual([
      'a',
      'm',
      'b',
    ]),
  )
  expect(ref.current.state.playId).toBe(playingId)
  expect(ref.current.audio.currentTime).toBe(42)
  expect(ref.current.state.toggle).toBe(false)
  const playerRoot = document.querySelector('.react-jinke-music-player-main')
  expect(getComputedStyle(playerRoot).display).toBe('none')
  view.rerender(<InlinePlayer {...props} audioLists={[a, m]} />)
  await waitFor(() =>
    expect(ref.current.state.audioLists.map((item) => item.uuid)).toEqual([
      'a',
      'm',
    ]),
  )
  expect(ref.current.state.playId).toBe(playingId)
  expect(ref.current.audio.currentTime).toBe(42)
  act(() => {
    ref.current.audio.playNext()
  })
  await waitFor(() => expect(ref.current.state.name).toBe('Manual'))
  expect(ref.current.state.toggle).toBe(false)
  const manualPlayId = ref.current.state.playId
  ref.current.audio.currentTime = 33
  const next = {
    uuid: 'artist-next',
    trackId: 'artist-next',
    name: 'Continuación artista',
    musicSrc: '/artist-next.mp3',
  }
  view.rerender(<InlinePlayer {...props} audioLists={[m, next]} />)
  await waitFor(() =>
    expect(ref.current.state.audioLists.map((item) => item.uuid)).toEqual([
      'm',
      'artist-next',
    ]),
  )
  expect(ref.current.state.playId).toBe(manualPlayId)
  expect(ref.current.audio.currentTime).toBe(33)
  act(() => ref.current.audio.playNext())
  await waitFor(() =>
    expect(ref.current.state.name).toBe('Continuación artista'),
  )
})

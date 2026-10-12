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

it('reorders the real player queue without restarting the current song, then plays the manual next song', async () => {
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
    ref,
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
  const view = render(<MusicPlayer {...props} audioLists={[a, b]} />)
  await waitFor(() => expect(ref.current.state.name).toBe('Actual'))
  const playingId = ref.current.state.playId
  ref.current.audio.currentTime = 42
  view.rerender(<MusicPlayer {...props} audioLists={[a, m, b]} />)
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
  act(() => {
    ref.current.audio.playNext()
  })
  await waitFor(() => expect(ref.current.state.name).toBe('Manual'))
  expect(ref.current.state.toggle).toBe(false)
})

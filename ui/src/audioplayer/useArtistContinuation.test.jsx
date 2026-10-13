import { renderHook, act } from '@testing-library/react-hooks'
import { it, expect, vi } from 'vitest'
import useArtistContinuation from './useArtistContinuation'
import { setArtistContinuation } from '../actions'

const song = { id: 'a', artistId: 'artist' }
const current = { uuid: 'a', trackId: 'a', song }
const base = { manualOnly: true, current, queue: [current] }

it('ignores a slow artist lookup after a manual request arrives or the current song changes', async () => {
  let resolve
  const provider = {
    getList: vi.fn().mockReturnValue(
      new Promise((r) => {
        resolve = r
      }),
    ),
  }
  const dispatch = vi.fn()
  const audioInstanceRef = { current: { ended: false, playNext: vi.fn() } }
  const hook = renderHook(
    ({ state }) =>
      useArtistContinuation({
        enabled: true,
        playerState: state,
        dataProvider: provider,
        dispatch,
        audioInstanceRef,
      }),
    { initialProps: { state: base } },
  )
  hook.rerender({
    state: {
      ...base,
      queue: [current, { uuid: 'manual', manualQueued: true }],
    },
  })
  await act(async () => resolve({ data: [{ id: 'b' }] }))
  expect(dispatch).not.toHaveBeenCalled()
  hook.unmount()
})

it('prefetches one continuation and resumes an ended song once without overriding a pause', async () => {
  const dispatch = vi.fn()
  const next = { id: 'b', artistId: 'artist' }
  const provider = { getList: vi.fn().mockResolvedValue({ data: [next] }) }
  const audio = { ended: false, playNext: vi.fn() }
  const audioInstanceRef = { current: audio }
  const hook = renderHook(
    ({ state }) =>
      useArtistContinuation({
        enabled: true,
        playerState: state,
        dataProvider: provider,
        dispatch,
        audioInstanceRef,
      }),
    { initialProps: { state: base } },
  )
  await act(async () => {})
  expect(dispatch).toHaveBeenCalledWith(setArtistContinuation('a', next))
  const state = {
    ...base,
    queue: [current, { uuid: 'b', continuationOf: 'a', song: next }],
  }
  hook.rerender({ state })
  expect(audio.playNext).not.toHaveBeenCalled()
  audio.ended = true
  hook.rerender({ state: { ...state, queue: [...state.queue] } })
  expect(audio.playNext).toHaveBeenCalledOnce()
  hook.rerender({ state: { ...state, queue: [...state.queue] } })
  expect(audio.playNext).toHaveBeenCalledOnce()
})

it('discards the previous artist reply after a different artist starts playing', async () => {
  const replies = []
  const provider = {
    getList: vi
      .fn()
      .mockImplementation(
        () => new Promise((resolve) => replies.push(resolve)),
      ),
  }
  const dispatch = vi.fn()
  const audioInstanceRef = { current: { ended: false } }
  const hook = renderHook(
    ({ state }) =>
      useArtistContinuation({
        enabled: true,
        playerState: state,
        dataProvider: provider,
        dispatch,
        audioInstanceRef,
      }),
    { initialProps: { state: base } },
  )
  const changed = {
    uuid: 'changed',
    song: { id: 'changed', artistId: 'other' },
  }
  hook.rerender({ state: { ...base, current: changed, queue: [changed] } })
  await act(async () => replies[0]({ data: [{ id: 'old-artist' }] }))
  expect(dispatch).not.toHaveBeenCalled()
  await act(async () => replies[1]({ data: [{ id: 'new-artist' }] }))
  expect(dispatch).toHaveBeenCalledWith(
    setArtistContinuation('changed', { id: 'new-artist' }),
  )
})

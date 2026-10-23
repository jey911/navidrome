import React from 'react'
import { act, render, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'

// La librería monta el plugin de arrastre al importarse; en Node el build CJS
// no expone `Swap`, así que se sustituye antes del import (igual que en
// manualRadio.integration.test.jsx).
let MusicPlayer
beforeAll(async () => {
  const require = createRequire(import.meta.url)
  const sortable = require('sortablejs')
  sortable.Swap = class {}
  vi.spyOn(sortable, 'mount').mockImplementation(() => {})
  vi.spyOn(sortable.prototype, 'destroy').mockImplementation(() => {})
  MusicPlayer = (await import('navidrome-music-player')).default
})

let mediaSpies
beforeEach(() => {
  mediaSpies = [
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(),
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {}),
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {}),
  ]
})
afterEach(() => {
  mediaSpies.forEach((spy) => spy.mockRestore())
})

const track = (id, musicSrc) => ({
  trackId: id,
  uuid: 'uuid-' + id,
  name: id.toUpperCase(),
  singer: 'Artista ' + id,
  musicSrc,
  song: { id, title: id.toUpperCase(), artist: 'Artista ' + id },
})

const playerProps = (audioLists, onInstance) => ({
  audioLists,
  playMode: 'order',
  playIndex: 0,
  quietUpdate: true,
  clearPriorAudioLists: false,
  showMediaSession: false,
  onAudioListsChange: () => {},
  getAudioInstance: onInstance,
})

it('aplica la lista nueva aunque la URL del tema actual tarde en resolver', async () => {
  let calls = 0
  let releaseSecond
  const slowA = () => {
    calls += 1
    if (calls === 1) return Promise.resolve('/stream/a')
    return new Promise((resolve) => {
      releaseSecond = resolve
    })
  }
  const a = track('a', slowA)
  let audio
  const onInstance = (instance) => {
    audio = instance
  }

  const { rerender } = render(<MusicPlayer {...playerProps([a], onInstance)} />)
  await waitFor(() => expect(audio?.src).toContain('/stream/a'))

  // El append del Auto-DJ llega mientras la URL del tema actual se re-resuelve.
  // Sin el parche, `initPlayInfo` espera a esa promesa y `audioLists` sigue en
  // [a]; con el parche la lista ya tiene 2 y playByIndex(1) devuelve true.
  rerender(<MusicPlayer {...playerProps([a, track('b', '/stream/b'), track('c', '/stream/c')], onInstance)} />)

  expect(audio.playByIndex(1)).toBe(true)
  await waitFor(() => expect(audio.src).toContain('/stream/b'))

  // La resolución vieja de A no debe pisar la pista nueva.
  await act(async () => {
    releaseSecond('/stream/a')
    await Promise.resolve()
  })
  expect(audio.src).toContain('/stream/b')
})

it('no revierte la lista si la URL inicial resuelve después del append', async () => {
  let calls = 0
  let releaseMount
  const slowA = () => {
    calls += 1
    if (calls === 1) {
      return new Promise((resolve) => {
        releaseMount = resolve
      })
    }
    return Promise.resolve('/stream/a')
  }
  const a = track('a', slowA)
  let audio
  const onInstance = (instance) => {
    audio = instance
  }

  const { rerender } = render(<MusicPlayer {...playerProps([a], onInstance)} />)
  // El append del Auto-DJ llega mientras la promesa del montaje sigue pendiente.
  rerender(<MusicPlayer {...playerProps([a, track('b', '/stream/b'), track('c', '/stream/c')], onInstance)} />)
  await waitFor(() => expect(audio?.src).toContain('/stream/a'))

  expect(audio.playByIndex(1)).toBe(true)
  await waitFor(() => expect(audio.src).toContain('/stream/b'))

  // La promesa vieja del montaje no debe devolver la lista a [a] ni el src a A.
  await act(async () => {
    releaseMount('/stream/a')
    await Promise.resolve()
  })
  expect(audio.src).toContain('/stream/b')

  // La lista sigue teniendo 3 pistas: se puede saltar a C, no solo a A.
  expect(audio.playByIndex(2)).toBe(true)
  await waitFor(() => expect(audio.src).toContain('/stream/c'))
})

it('no repite el tema actual si el índice pedido no existe', async () => {
  let audio
  const a = track('a', '/stream/a')
  render(<MusicPlayer {...playerProps([a], (instance) => (audio = instance))} />)
  await waitFor(() => expect(audio?.src).toContain('/stream/a'))

  const load = HTMLMediaElement.prototype.load
  const loadsBefore = load.mock.calls.length

  expect(audio.playByIndex(1)).toBe(false)
  await new Promise((resolve) => setTimeout(resolve, 30))
  expect(audio.src).toContain('/stream/a')
  expect(load.mock.calls.length).toBe(loadsBefore)
})

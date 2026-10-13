import { it, expect, vi } from 'vitest'
import { fetchArtistContinuation } from './artistContinuation'

it('selects another random song from the same artist through the native library', async () => {
  const song = { id: 'current', artistId: 'artist', artist: 'Artista' }
  const other = { id: 'other', artistId: 'artist' }
  const provider = {
    getList: vi
      .fn()
      .mockResolvedValue({
        data: [song, other, { id: 'gone', missing: true }],
      }),
  }
  expect(await fetchArtistContinuation(provider, song)).toEqual(other)
  expect(provider.getList).toHaveBeenCalledWith(
    'song',
    expect.objectContaining({
      sort: { field: 'random', order: 'ASC' },
      filter: { artist_id: 'artist', missing: false },
    }),
  )
})
it('repeats the artist’s only song and tolerates temporary metadata failures', async () => {
  const song = { id: 'only', artistId: 'artist' }
  expect(
    await fetchArtistContinuation(
      { getList: vi.fn().mockResolvedValue({ data: [song] }) },
      song,
    ),
  ).toBe(song)
  expect(
    await fetchArtistContinuation(
      { getList: vi.fn().mockRejectedValue(new Error('offline')) },
      song,
    ),
  ).toBe(song)
})

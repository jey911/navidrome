import { describe, it, expect, vi, beforeEach } from 'vitest'
import subsonic from '../subsonic/index.js'
import { fetchRandomTracks } from './autoDj.js'

vi.mock('../subsonic/index.js', () => ({
  default: { getRandomSongs: vi.fn() },
}))

const okResponse = (songs) => ({
  json: { 'subsonic-response': { status: 'ok', randomSongs: { song: songs } } },
})

describe('fetchRandomTracks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('excluye ids en cola y devuelve mapa para addTracks', async () => {
    subsonic.getRandomSongs.mockResolvedValue(
      okResponse([
        { id: 'a', title: 'A' },
        { id: 'b', title: 'B' },
        { id: 'c', title: 'C' },
      ]),
    )
    const data = await fetchRandomTracks(['a'], 5)
    expect(Object.keys(data).sort()).toEqual(['b', 'c'])
    expect(data['b'].title).toBe('B')
  })

  it('acepta un solo objeto song (no array)', async () => {
    subsonic.getRandomSongs.mockResolvedValue(
      okResponse({ id: 'z', title: 'Z' }),
    )
    const data = await fetchRandomTracks([], 5)
    expect(Object.keys(data)).toEqual(['z'])
  })

  it('lanza error si el backend falla', async () => {
    subsonic.getRandomSongs.mockResolvedValue({
      json: {
        'subsonic-response': {
          status: 'failed',
          error: { message: 'nope', code: 99 },
        },
      },
    })
    await expect(fetchRandomTracks([], 5)).rejects.toThrow('nope')
  })
})

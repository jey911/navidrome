import { describe, it, expect, vi, beforeEach } from 'vitest'
import subsonic from '../subsonic/index.js'
import { httpClient } from '../dataProvider'
import { SEARCH_LIMIT, searchSongs } from './searchSongs'

vi.mock('../subsonic/index.js', () => ({
  default: { url: vi.fn() },
}))

vi.mock('../dataProvider', () => ({
  httpClient: vi.fn(),
}))

const okResponse = (songs) => ({
  json: {
    'subsonic-response': {
      status: 'ok',
      searchResult3: { song: songs },
    },
  },
})

describe('searchSongs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    subsonic.url.mockReturnValue('/rest/search3?query=x')
  })

  it('devuelve [] con query vacía y no llama a la API', async () => {
    expect(await searchSongs('   ')).toEqual([])
    expect(httpClient).not.toHaveBeenCalled()
  })

  it('usa search3 del cliente Subsonic y acota los resultados', async () => {
    const songs = Array.from({ length: 5 }, (_, i) => ({
      id: `s${i}`,
      title: `T${i}`,
    }))
    httpClient.mockResolvedValue(okResponse(songs))

    const res = await searchSongs('tito', 3)

    expect(subsonic.url).toHaveBeenCalledWith('search3', null, {
      query: 'tito',
      songCount: 3,
      artistCount: 0,
      albumCount: 0,
    })
    expect(res).toHaveLength(3)
    expect(res.map((s) => s.id)).toEqual(['s0', 's1', 's2'])
  })

  it('acepta una sola canción y elimina duplicados', async () => {
    httpClient.mockResolvedValue(okResponse({ id: 'a', title: 'A' }))
    expect((await searchSongs('x')).map((s) => s.id)).toEqual(['a'])
  })

  it('lanza error si el backend responde failed', async () => {
    httpClient.mockResolvedValue({
      json: {
        'subsonic-response': {
          status: 'failed',
          error: { message: 'boom', code: 99 },
        },
      },
    })
    await expect(searchSongs('x')).rejects.toThrow('boom')
  })

  it('usa el límite por defecto', async () => {
    httpClient.mockResolvedValue(okResponse([]))
    await searchSongs('x')
    expect(subsonic.url).toHaveBeenCalledWith(
      'search3',
      null,
      expect.objectContaining({ songCount: SEARCH_LIMIT }),
    )
  })
})

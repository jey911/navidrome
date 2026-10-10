import { describe, it, expect, vi, beforeEach } from 'vitest'
import subsonic from '../subsonic/index.js'
import {
  decideContinueSource,
  fetchArtistTracks,
  fetchContinueTracks,
  fetchGenreTracks,
  fetchRandomTracks,
} from './autoDj.js'

vi.mock('../subsonic/index.js', () => ({
  default: {
    getRandomSongs: vi.fn(),
    getSongsByGenre: vi.fn(),
    getTopSongs: vi.fn(),
  },
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

  it('pasa el género a getRandomSongs cuando se indica', async () => {
    subsonic.getRandomSongs.mockResolvedValue(
      okResponse([{ id: 's', title: 'S' }]),
    )
    await fetchRandomTracks([], 5, 'Salsa')
    expect(subsonic.getRandomSongs).toHaveBeenCalledWith(10, 'Salsa')
  })
})

const okGenreResponse = (songs) => ({
  json: {
    'subsonic-response': { status: 'ok', songsByGenre: { song: songs } },
  },
})

const okTopResponse = (songs) => ({
  json: { 'subsonic-response': { status: 'ok', topSongs: { song: songs } } },
})

describe('decideContinueSource', () => {
  it('shuffle => random aunque haya género', () => {
    expect(decideContinueSource({ genre: 'Salsa' }, true)).toBe('random')
  })
  it('sin shuffle y con género => genre', () => {
    expect(decideContinueSource({ genre: 'Salsa' }, false)).toBe('genre')
  })
  it('mando (preferArtist) con artista y género => artist primero', () => {
    expect(
      decideContinueSource(
        { genre: 'Salsa', artist: 'Tito Rojas' },
        false,
        true,
      ),
    ).toBe('artist')
  })
  it('mando sin artista pero con género => genre', () => {
    expect(decideContinueSource({ genre: 'Salsa' }, false, true)).toBe('genre')
  })
  it('sin género pero con artista => artist', () => {
    expect(decideContinueSource({ artist: 'Tito Rojas' }, false)).toBe('artist')
  })
  it('sin nada => random', () => {
    expect(decideContinueSource({}, false)).toBe('random')
    expect(decideContinueSource(null, false)).toBe('random')
  })
})

describe('fetchContinueTracks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sigue con el mismo género cuando hay', async () => {
    subsonic.getSongsByGenre.mockResolvedValue(
      okGenreResponse([{ id: 'g1', title: 'G1' }]),
    )
    const { songs, source } = await fetchContinueTracks(
      { genre: 'Salsa', artist: 'X' },
      { shuffle: false },
      [],
      5,
    )
    expect(source).toBe('genre')
    expect(Object.keys(songs)).toEqual(['g1'])
    expect(subsonic.getSongsByGenre).toHaveBeenCalledWith('Salsa', 10)
  })

  it('cae a artista si el género viene vacío', async () => {
    subsonic.getSongsByGenre.mockResolvedValue(okGenreResponse([]))
    subsonic.getTopSongs.mockResolvedValue(
      okTopResponse([{ id: 'a1', title: 'A1' }]),
    )
    const { songs, source } = await fetchContinueTracks(
      { genre: 'Salsa', artist: 'Tito Rojas' },
      { shuffle: false },
      [],
      5,
    )
    expect(source).toBe('artist')
    expect(Object.keys(songs)).toEqual(['a1'])
  })

  it('con shuffle va directo a aleatorios', async () => {
    subsonic.getRandomSongs.mockResolvedValue(
      okResponse([{ id: 'r1', title: 'R1' }]),
    )
    const { songs, source } = await fetchContinueTracks(
      { genre: 'Salsa' },
      { shuffle: true },
      [],
      5,
    )
    expect(source).toBe('random')
    expect(Object.keys(songs)).toEqual(['r1'])
    expect(subsonic.getSongsByGenre).not.toHaveBeenCalled()
  })

  it('mando: sigue con el mismo artista antes que el género', async () => {
    subsonic.getTopSongs.mockResolvedValue(
      okTopResponse([{ id: 'a1', title: 'A1' }]),
    )
    const { songs, source } = await fetchContinueTracks(
      { genre: 'Salsa', artist: 'Tito Rojas' },
      { shuffle: false, preferArtist: true },
      [],
      5,
    )
    expect(source).toBe('artist')
    expect(Object.keys(songs)).toEqual(['a1'])
    expect(subsonic.getTopSongs).toHaveBeenCalledWith('Tito Rojas', 10)
    expect(subsonic.getSongsByGenre).not.toHaveBeenCalled()
  })

  it('mando: al agotarse el artista cae al mismo género sin repetir', async () => {
    subsonic.getTopSongs.mockResolvedValue(
      okTopResponse([{ id: 'a1', title: 'A1' }]),
    )
    subsonic.getSongsByGenre.mockResolvedValue(
      okGenreResponse([{ id: 'g1', title: 'G1' }]),
    )
    const { songs, source } = await fetchContinueTracks(
      { genre: 'Salsa', artist: 'Tito Rojas' },
      { shuffle: false, preferArtist: true },
      ['a1'],
      5,
    )
    expect(source).toBe('genre')
    expect(Object.keys(songs)).toEqual(['g1'])
  })

  it('no repite artista agotado: devuelve vacío para permitir la cascada', async () => {
    subsonic.getTopSongs.mockResolvedValue(
      okTopResponse([{ id: 'a1', title: 'A1' }]),
    )
    const data = await fetchArtistTracks('Tito Rojas', ['a1'], 5)
    expect(Object.keys(data)).toEqual([])
  })
})

describe('fetchArtistTracks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('usa getTopSongs del artista y excluye la cola', async () => {
    subsonic.getTopSongs.mockResolvedValue(
      okTopResponse([
        { id: 'a1', title: 'A1' },
        { id: 'a2', title: 'A2' },
      ]),
    )
    const data = await fetchArtistTracks('Tito Rojas', ['a1'], 5)
    expect(subsonic.getTopSongs).toHaveBeenCalledWith('Tito Rojas', 10)
    expect(Object.keys(data)).toEqual(['a2'])
  })
})

describe('fetchGenreTracks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('devuelve mapa listo para addTracks', async () => {
    subsonic.getSongsByGenre.mockResolvedValue(
      okGenreResponse([{ id: 'g9', title: 'G9' }]),
    )
    const data = await fetchGenreTracks('Merengue', [], 5)
    expect(Object.keys(data)).toEqual(['g9'])
  })
})

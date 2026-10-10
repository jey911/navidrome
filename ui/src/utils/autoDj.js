import subsonic from '../subsonic/index.js'
import { processSongsForPlayback } from '../common/playbackActions.js'

// Auto-DJ casa: trae temas aleatorios listos para addTracks().
// Excluye los ids ya en cola para no repetir lo que suena.
export const fetchRandomTracks = async (excludeIds = [], count = 5, genre) => {
  const res = await subsonic.getRandomSongs(count * 2, genre)
  const data = res.json['subsonic-response']

  if (data.status !== 'ok') {
    throw new Error(
      `Error fetching random songs: ${data.error?.message || 'Unknown error'} (Code: ${data.error?.code || 'unknown'})`,
    )
  }

  let songs = data.randomSongs?.song || []
  if (!Array.isArray(songs)) {
    songs = [songs]
  }
  const fresh = songs.filter((s) => s && s.id && !excludeIds.includes(s.id))
  const picked = (fresh.length ? fresh : songs.filter((s) => s && s.id)).slice(
    0,
    count,
  )
  const { songData } = processSongsForPlayback(picked)
  return songData
}

// Mismo género que el tema actual (ordenado por servidor + filtro local).
// Devuelve VACÍO si no hay novedades (sin repetir): así el llamante puede
// caer en cascada a la siguiente fuente (artista/género/aleatorio).
export const fetchGenreTracks = async (genre, excludeIds = [], count = 5) => {
  const res = await subsonic.getSongsByGenre(genre, count * 2)
  const data = res.json['subsonic-response']

  if (data.status !== 'ok') {
    throw new Error(
      `Error fetching songs by genre: ${data.error?.message || 'Unknown error'} (Code: ${data.error?.code || 'unknown'})`,
    )
  }

  let songs = data.songsByGenre?.song || []
  if (!Array.isArray(songs)) {
    songs = [songs]
  }
  const fresh = songs.filter((s) => s && s.id && !excludeIds.includes(s.id))
  const picked = fresh.slice(0, count)
  const { songData } = processSongsForPlayback(picked)
  return songData
}

// Mismo artista que el tema actual (top songs del artista).
// Devuelve VACÍO si no hay novedades (sin repetir): así el llamante puede
// caer en cascada a la siguiente fuente (género/aleatorio).
export const fetchArtistTracks = async (
  artistName,
  excludeIds = [],
  count = 5,
) => {
  const res = await subsonic.getTopSongs(artistName, count * 2)
  const data = res.json['subsonic-response']

  if (data.status !== 'ok') {
    throw new Error(
      `Error fetching top songs: ${data.error?.message || 'Unknown error'} (Code: ${data.error?.code || 'unknown'})`,
    )
  }

  let songs = data.topSongs?.song || []
  if (!Array.isArray(songs)) {
    songs = [songs]
  }
  const fresh = songs.filter((s) => s && s.id && !excludeIds.includes(s.id))
  const picked = fresh.slice(0, count)
  const { songData } = processSongsForPlayback(picked)
  return songData
}

// Decisión pura (testeable): ¿de dónde sigue la música?
// shuffle (🔀) => 'random' (fuera del contexto).
// Sin shuffle y sin preferArtist (laptop) => 'genre', si no => 'artist'.
// Sin shuffle y con preferArtist (mando remoto) => 'artist' primero,
// luego 'genre': al acabar el artista se sigue con el mismo género.
// Si no hay ni género ni artista => 'random'.
export const decideContinueSource = (song, shuffle, preferArtist = false) => {
  if (shuffle) {
    return 'random'
  }
  if (preferArtist) {
    if (song?.artist) {
      return 'artist'
    }
    if (song?.genre) {
      return 'genre'
    }
    return 'random'
  }
  if (song?.genre) {
    return 'genre'
  }
  if (song?.artist) {
    return 'artist'
  }
  return 'random'
}

// Orquesta la continuación contextual con caídas en cascada:
// - laptop (preferArtist=false): género => artista => aleatorio.
// - mando remoto (preferArtist=true): artista => género => aleatorio, de modo
//   que al agotarse el artista se sigue con el mismo género sin repetir cola.
// Cada etapa tolera fallos de red (pasa a la siguiente). Nunca devuelve null:
// si todo falla, el llamante conserva el comportamiento anterior (detenerse).
export const fetchContinueTracks = async (
  song,
  { shuffle = false, preferArtist = false } = {},
  excludeIds = [],
  count = 5,
) => {
  const source = decideContinueSource(song, shuffle, preferArtist)
  if (source === 'artist') {
    try {
      const byArtist = await fetchArtistTracks(song.artist, excludeIds, count)
      if (Object.keys(byArtist).length > 0) {
        return { songs: byArtist, source }
      }
    } catch {
      // sin artista disponible: caer a género/aleatorio
    }
    if (song?.genre) {
      try {
        const byGenre = await fetchGenreTracks(song.genre, excludeIds, count)
        if (Object.keys(byGenre).length > 0) {
          return { songs: byGenre, source: 'genre' }
        }
      } catch {
        // sin género disponible: caer a aleatorio
      }
    }
    const songs = await fetchRandomTracks(excludeIds, count)
    return { songs, source: 'random' }
  }
  if (source === 'genre') {
    try {
      const byGenre = await fetchGenreTracks(song.genre, excludeIds, count)
      if (Object.keys(byGenre).length > 0) {
        return { songs: byGenre, source }
      }
    } catch {
      // sin género disponible: caer a artista/aleatorio
    }
  }
  if (source !== 'random' && song?.artist) {
    try {
      const byArtist = await fetchArtistTracks(song.artist, excludeIds, count)
      if (Object.keys(byArtist).length > 0) {
        return { songs: byArtist, source: 'artist' }
      }
    } catch {
      // sin artista disponible: caer a aleatorio
    }
  }
  const songs = await fetchRandomTracks(excludeIds, count)
  return { songs, source: 'random' }
}

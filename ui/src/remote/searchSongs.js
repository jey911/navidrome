import subsonic from '../subsonic/index.js'
import { httpClient } from '../dataProvider'

export const SEARCH_LIMIT = 25

const extractSongs = (json) => {
  const response = json?.['subsonic-response']
  if (!response || response.status !== 'ok') {
    throw new Error(response?.error?.message || 'Error searching songs')
  }
  let songs = response.searchResult3?.song || []
  if (!Array.isArray(songs)) {
    songs = [songs]
  }
  return songs
}

// Búsqueda acotada usando el cliente Subsonic existente (search3).
// Devuelve solo canciones con id, sin duplicados y como máximo `limit`.
// El móvil solo obtiene metadatos: la reproducción va por el mando.
export const searchSongs = async (query, limit = SEARCH_LIMIT) => {
  const q = (query || '').trim()
  if (!q) return []
  const path = subsonic.url('search3', null, {
    query: q,
    songCount: limit,
    artistCount: 0,
    albumCount: 0,
  })
  const res = await httpClient(path)
  const songs = extractSongs(res.json)
  const seen = new Set()
  const bounded = []
  for (const song of songs) {
    if (song && song.id && !seen.has(song.id)) {
      seen.add(song.id)
      bounded.push(song)
      if (bounded.length >= limit) break
    }
  }
  return bounded
}

import subsonic from '../subsonic/index.js'
import { processSongsForPlayback } from '../common/playbackActions.js'

// Auto-DJ casa: trae temas aleatorios listos para addTracks().
// Excluye los ids ya en cola para no repetir lo que suena.
export const fetchRandomTracks = async (excludeIds = [], count = 5) => {
  const res = await subsonic.getRandomSongs(count * 2)
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

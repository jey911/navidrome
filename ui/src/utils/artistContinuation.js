import subsonic from '../subsonic'

// The native song endpoint supports artist_id and random ordering. Fetch a
// small random sample, avoiding the current song while alternatives exist.
export async function fetchArtistContinuation(dataProvider, song) {
  if (!song?.id || song.missing) return null
  const currentId = song.mediaFileId || song.id
  let songs = []
  try {
    if (song.artistId) {
      const response = await dataProvider.getList('song', {
        pagination: { page: 1, perPage: 5 },
        sort: { field: 'random', order: 'ASC' },
        filter: { artist_id: song.artistId, missing: false },
      })
      songs = response.data || []
    } else if (song.artist) {
      const response = await subsonic.getTopSongs(song.artist, 100)
      const data = response.json?.['subsonic-response']
      const rows = data?.status === 'ok' ? data.topSongs?.song || [] : []
      songs = Array.isArray(rows) ? rows : [rows]
      songs = songs.filter(
        (item) => item.artist?.toLowerCase() === song.artist.toLowerCase(),
      )
    }
  } catch {
    // Keep playing the known song if metadata is temporarily unavailable.
  }
  const alternatives = songs.filter(
    (item) => item?.id && !item.missing && item.id !== currentId,
  )
  return alternatives.length
    ? alternatives[Math.floor(Math.random() * alternatives.length)]
    : song
}

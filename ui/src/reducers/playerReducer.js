import { v4 as uuidv4 } from 'uuid'
import subsonic from '../subsonic'
import { decisionService } from '../transcode'
import {
  PLAYER_ADD_TRACKS,
  PLAYER_MANUAL_QUEUE,
  PLAYER_CLEAR_QUEUE,
  PLAYER_CURRENT,
  PLAYER_PLAY_NEXT,
  PLAYER_PLAY_TRACKS,
  PLAYER_REMOVE_TRACK,
  PLAYER_SET_TRACK,
  PLAYER_SET_VOLUME,
  PLAYER_SYNC_QUEUE,
  PLAYER_SET_MODE,
  PLAYER_REFRESH_QUEUE,
} from '../actions'
import config from '../config'

const initialState = {
  queue: [],
  current: {},
  clear: false,
  volume: config.defaultUIVolume / 100,
  savedPlayIndex: 0,
}

const pad = (value) => {
  const str = value.toString()
  if (str.length === 1) {
    return `0${str}`
  } else {
    return str
  }
}

const makeMusicSrc = (trackId) =>
  decisionService.getProfile()
    ? () =>
        decisionService
          .resolveStreamUrl(trackId)
          .catch(() => subsonic.streamUrl(trackId))
    : subsonic.streamUrl(trackId)

const mapToAudioLists = (item) => {
  // If item comes from a playlist, trackId is mediaFileId
  const trackId = item.mediaFileId || item.id

  if (item.isRadio) {
    return {
      trackId,
      uuid: uuidv4(),
      name: item.name,
      song: item,
      musicSrc: item.streamUrl,
      cover: item.cover,
      isRadio: true,
    }
  }

  const { lyrics } = item
  let lyricText = ''

  if (lyrics) {
    const structured = JSON.parse(lyrics)
    for (const structuredLyric of structured) {
      if (structuredLyric.synced) {
        for (const line of structuredLyric.line) {
          let time = Math.floor(line.start / 10)
          const ms = time % 100
          time = Math.floor(time / 100)
          const sec = time % 60
          time = Math.floor(time / 60)
          const min = time % 60

          ms.toString()
          lyricText += `[${pad(min)}:${pad(sec)}.${pad(ms)}] ${line.value}\n`
        }
      }
    }
  }

  return {
    trackId,
    uuid: uuidv4(),
    song: item,
    name: item.title,
    lyric: lyricText,
    singer: item.artist,
    duration: item.duration,
    musicSrc: makeMusicSrc(trackId),
    cover: subsonic.getCoverArtUrl(
      {
        id: trackId,
        updatedAt: item.updatedAt,
        album: item.album,
      },
      300,
    ),
  }
}

const reduceClearQueue = () => ({ ...initialState, clear: true })

const reducePlayTracks = (state, { data, id }) => {
  let playIndex = 0
  const queue = Object.keys(data).map((key, idx) => {
    if (key === id) {
      playIndex = idx
    }
    return mapToAudioLists(data[key])
  })
  return {
    ...state,
    queue,
    playIndex,
    autoPlay: true,
    clear: true,
  }
}

const reduceSetTrack = (state, { data }) => {
  return {
    ...state,
    queue: [
      mapToAudioLists(data),
      ...(state.manualOnly
        ? state.queue.filter(
            (item) =>
              item.manualQueued &&
              item.uuid !== state.current?.uuid &&
              item.trackId !== data.id,
          )
        : []),
    ],
    playIndex: 0,
    autoPlay: true,
    clear: true,
  }
}

// Manual requests are FIFO immediately after the current song, ahead of
// album/search context and Auto-DJ. Never mutate the previous Redux queue.
const reduceAddTracks = (state, { data, automatic = false }) => {
  if (automatic && state.manualOnly) return state
  const tracks = Object.values(data).map((song) => ({
    ...mapToAudioLists(song),
    manualQueued: !automatic,
  }))
  if (!tracks.length) return state
  if (automatic) return { ...state, queue: [...state.queue, ...tracks] }
  const index = state.queue.findIndex(
    (item) => item.uuid === state.current?.uuid,
  )
  let insertAt = index >= 0 ? index + 1 : (state.playIndex ?? -1) + 1
  while (state.queue[insertAt]?.manualQueued) insertAt++
  return {
    ...state,
    queue: [
      ...state.queue.slice(0, insertAt),
      ...tracks,
      ...state.queue.slice(insertAt),
    ],
    clear: true,
  }
}

const reducePlayNext = (state, { data }) => {
  const newTracks = Object.keys(data).map((id) => ({
    ...mapToAudioLists(data[id]),
    manualQueued: true,
  }))
  const newQueue = []
  const current = state.current || {}
  let foundPos = false
  state.queue.forEach((item) => {
    newQueue.push(item)
    if (item.uuid === current.uuid) {
      foundPos = true
      newQueue.push(...newTracks)
    }
  })
  if (!foundPos) {
    newQueue.push(...newTracks)
  }

  return {
    ...state,
    queue: newQueue,
    clear: true,
  }
}

// Quita un tema futuro de la cola (borrado de archivo desde el mando).
// No reordena ni toca la selección en curso: solo filtra por trackId y
// recalcula savedPlayIndex contra el tema actual.
const reduceRemoveTrack = (state, { data: { trackId } }) => {
  if (!trackId) return state
  const queue = state.queue.filter((item) => item.trackId !== trackId)
  if (queue.length === state.queue.length) return state
  const current = state.current || {}
  return {
    ...state,
    queue,
    savedPlayIndex: queue.findIndex((item) => item.uuid === current.uuid),
  }
}

const reduceSetVolume = (state, { data: { volume } }) => {
  return {
    ...state,
    volume,
  }
}

const reduceSyncQueue = (state, { data: { audioInfo, audioLists } }) => {
  // Keep clear and playIndex alive when there is a pending track switch.
  // A switch is pending when playIndex is set AND either:
  //   - playIndex differs from savedPlayIndex, OR
  //   - clear is true (a new queue was loaded, e.g. after clearQueue + playTracks)
  // The clear check handles the edge case where both playIndex and
  // savedPlayIndex are 0 (close player then play a new album from track 1).
  const hasPendingSwitch =
    state.playIndex != null &&
    (state.clear || state.playIndex !== state.savedPlayIndex)
  return {
    ...state,
    queue: audioLists,
    clear: hasPendingSwitch ? state.clear : false,
    playIndex: hasPendingSwitch ? state.playIndex : undefined,
  }
}

const reduceCurrent = (state, { data }) => {
  const current = data.ended ? {} : data
  const savedPlayIndex = state.queue.findIndex(
    (item) => item.uuid === current.uuid,
  )
  // When a track selection is pending (playIndex is set), keep it alive
  // until the music player confirms it actually switched to the requested
  // track. Without this, a premature onAudioPlay callback for the
  // still-playing old track would overwrite the pending selection.
  const pending = state.playIndex != null && savedPlayIndex !== state.playIndex
  return {
    ...state,
    queue: state.queue.map((item) =>
      item.uuid === current.uuid && item.manualQueued
        ? { ...item, manualQueued: false }
        : item,
    ),
    current,
    playIndex: pending ? state.playIndex : undefined,
    clear: pending ? state.clear : false,
    savedPlayIndex: pending ? state.savedPlayIndex : savedPlayIndex,
    volume: data.volume,
  }
}

const reduceMode = (state, { data: { mode } }) => {
  return {
    ...state,
    mode,
  }
}

export const playerReducer = (previousState = initialState, payload) => {
  const { type } = payload
  switch (type) {
    case PLAYER_MANUAL_QUEUE: {
      if (previousState.manualOnly) return previousState
      const index = previousState.queue.findIndex(
        (item) => item.uuid === previousState.current?.uuid,
      )
      const currentItem = previousState.queue[index]
      const queue = [
        ...(currentItem ? [currentItem] : []),
        ...previousState.queue
          .slice(index + 1)
          .filter((item) => item.manualQueued),
      ]
      return {
        ...previousState,
        queue,
        manualOnly: true,
        clear: true,
        autoPlay: false,
        playIndex:
          previousState.playIndex != null && queue.length ? 0 : undefined,
        savedPlayIndex: currentItem ? 0 : -1,
      }
    }
    case PLAYER_CLEAR_QUEUE:
      return reduceClearQueue()
    case PLAYER_PLAY_TRACKS:
      if (previousState.manualOnly) {
        const song = payload.data[payload.id] || Object.values(payload.data)[0]
        return song
          ? reduceSetTrack(previousState, { data: song })
          : previousState
      }
      return reducePlayTracks(previousState, payload)
    case PLAYER_SET_TRACK:
      return reduceSetTrack(previousState, payload)
    case PLAYER_ADD_TRACKS:
      return reduceAddTracks(previousState, payload)
    case PLAYER_PLAY_NEXT:
      return reducePlayNext(previousState, payload)
    case PLAYER_REMOVE_TRACK:
      return reduceRemoveTrack(previousState, payload)
    case PLAYER_SET_VOLUME:
      return reduceSetVolume(previousState, payload)
    case PLAYER_SYNC_QUEUE:
      return reduceSyncQueue(previousState, payload)
    case PLAYER_CURRENT:
      return reduceCurrent(previousState, payload)
    case PLAYER_SET_MODE:
      return reduceMode(previousState, payload)
    case PLAYER_REFRESH_QUEUE: {
      const resolvedUrls = payload.data || {}
      return {
        ...previousState,
        queue: previousState.queue.map((item) => ({
          ...item,
          musicSrc: item.isRadio
            ? item.musicSrc
            : resolvedUrls[item.trackId] || subsonic.streamUrl(item.trackId),
        })),
        clear: true,
        autoPlay: false,
        playIndex:
          previousState.savedPlayIndex >= 0 ? previousState.savedPlayIndex : 0,
      }
    }
    default:
      return previousState
  }
}

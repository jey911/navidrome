import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  useTranslate,
  useDataProvider,
  useNotify,
  useRefresh,
} from 'react-admin'
import { useDispatch, useSelector } from 'react-redux'
import { useHistory, useLocation } from 'react-router-dom'
import { CircularProgress, useMediaQuery } from '@material-ui/core'
import SearchIcon from '@material-ui/icons/Search'
import TuneIcon from '@material-ui/icons/Tune'
import SortIcon from '@material-ui/icons/Sort'
import CloudUploadIcon from '@material-ui/icons/CloudUpload'
import PlayArrowIcon from '@material-ui/icons/PlayArrow'
import PauseIcon from '@material-ui/icons/Pause'
import SkipNextIcon from '@material-ui/icons/SkipNext'
import SkipPreviousIcon from '@material-ui/icons/SkipPrevious'
import ShuffleIcon from '@material-ui/icons/Shuffle'
import RepeatIcon from '@material-ui/icons/Repeat'
import VolumeUpIcon from '@material-ui/icons/VolumeUp'
import AddIcon from '@material-ui/icons/Add'
import DeleteIcon from '@material-ui/icons/Delete'
import ChevronRightIcon from '@material-ui/icons/ChevronRight'
import FolderOpenIcon from '@material-ui/icons/FolderOpen'
import SyncIcon from '@material-ui/icons/Sync'
import CloudDownloadIcon from '@material-ui/icons/CloudDownload'
import PhonelinkIcon from '@material-ui/icons/Phonelink'
import HelpOutlineIcon from '@material-ui/icons/HelpOutline'
import MusicNoteIcon from '@material-ui/icons/MusicNote'
import {
  addTracks,
  playTracks,
  removeTrack,
  setPlayMode,
  setTrack,
} from '../actions'
import { getAudioInstance } from '../audioplayer/audioBus'
import { deleteTrackFromServer } from '../remote/remoteCommands'
import subsonic from '../subsonic'
import { LoveButton, SongContextMenu, SongPlayButton, Title } from '../common'
import { searchSongs } from '../remote/searchSongs'
import { MobileSongRow, CompactPlayback } from './MobilePlayback'
import './home.css'

const LOSSLESS = new Set(['flac', 'alac', 'wav', 'aiff', 'dsd', 'dff'])

const formatDuration = (seconds) => {
  if (!seconds && seconds !== 0) return '--:--'
  const s = Math.floor(seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const qualityOf = (song = {}) => {
  const suffix = (song.suffix || '').toLowerCase()
  return {
    label: suffix ? suffix.toUpperCase() : '···',
    hifi: LOSSLESS.has(suffix),
  }
}

const genreClass = (genre = '') => {
  const g = genre.toLowerCase()
  if (g.includes('bachata')) return 'mm-chip mm-bachata'
  if (g.includes('salsa')) return 'mm-chip mm-salsa'
  if (g.includes('merengue')) return 'mm-chip mm-merengue'
  return 'mm-chip'
}

// --- Héroe: lo que suena ahora, con transporte real -----------------------
const NowPlaying = ({ queue, current }) => {
  const translate = useTranslate()
  const dispatch = useDispatch()
  const mode = useSelector((state) => state.player?.mode)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState({ pos: 0, dur: 0 })
  const [volume, setVolume] = useState(0.5)

  useEffect(() => {
    const t = setInterval(() => {
      const el = getAudioInstance()
      if (!el) return
      setPlaying(!el.paused)
      if (el.duration) {
        setProgress({ pos: el.currentTime || 0, dur: el.duration })
      }
    }, 1000)
    return () => clearInterval(t)
  }, [])

  const item = queue.find((i) => i.uuid === current?.uuid)
  const song = current?.song || item?.song || {}
  const isShuffle = mode === 'shufflePlay'
  const isRepeat = mode === 'orderLoop' || mode === 'singleLoop'

  if (!current?.trackId && !item) {
    return (
      <section className="mm-card mm-now-playing">
        <div className="mm-now-body">
          <div className="mm-album-art" />
          <div className="mm-now-info">
            <div>
              <div className="mm-sub-label">
                {translate('home.nowPlaying', { _: 'Reproducción actual' })}
              </div>
              <div className="mm-song-title">
                {translate('home.nothingPlaying', { _: 'Nada sonando' })}
              </div>
              <div className="mm-song-album">
                {translate('home.nothingHint', {
                  _: 'Dale ▶ a cualquier tema, álbum o carpeta.',
                })}
              </div>
            </div>
          </div>
        </div>
      </section>
    )
  }

  const quality = qualityOf(song)
  const ratio = progress.dur > 0 ? progress.pos / progress.dur : 0

  const seek = (e) => {
    const el = getAudioInstance()
    if (!el?.duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const clickRatio = Math.min(
      1,
      Math.max(0, (e.clientX - rect.left) / rect.width),
    )
    try {
      el.currentTime = clickRatio * el.duration
    } catch {
      // elemento aún sin metadatos: ignorar
    }
  }

  const changeVolume = (e) => {
    const el = getAudioInstance()
    const rect = e.currentTarget.getBoundingClientRect()
    const level = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    setVolume(level)
    if (el) el.volume = level
  }

  return (
    <section className="mm-card mm-now-playing">
      <div className="mm-now-body">
        {item?.cover ? (
          <img
            className="mm-album-art"
            src={item.cover}
            alt={song.album || ''}
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
        ) : (
          <div className="mm-album-art" />
        )}

        <div className="mm-now-info">
          <div>
            <div className="mm-sub-label">
              {translate('home.nowPlaying', { _: 'Reproducción actual' })}
            </div>
            <div className="mm-song-title" data-testid="home-now-title">
              {song.title || '—'}
            </div>
            <div className="mm-song-meta">{song.artist || ''}</div>
            <div className="mm-song-album">{song.album || ''}</div>

            <div className="mm-actions-line">
              <div className="mm-mini-actions">
                <LoveButton
                  resource="song"
                  record={song.id ? song : item?.song}
                  visible
                />
                {song.id && <SongContextMenu record={song} />}
              </div>

              <div className="mm-badge">
                {quality.hifi && <span className="mm-hires">Hi-Res</span>}
                {quality.label}
                {song.bitRate ? ` · ${song.bitRate} kbps` : ''}
              </div>
            </div>
          </div>

          <div className="mm-player-center">
            <div className="mm-progress-wrap">
              <div className="mm-transport">
                <button
                  title="Aleatorio"
                  className={isShuffle ? 'active' : ''}
                  onClick={() =>
                    dispatch(setPlayMode(isShuffle ? 'order' : 'shufflePlay'))
                  }
                  data-testid="home-shuffle"
                >
                  <ShuffleIcon />
                </button>
                <button
                  title="Anterior"
                  onClick={() => getAudioInstance()?.playPrev?.()}
                >
                  <SkipPreviousIcon fontSize="large" />
                </button>
                <button
                  className="mm-main-play"
                  title={playing ? 'Pausar' : 'Reproducir'}
                  onClick={() => getAudioInstance()?.togglePlay?.()}
                  data-testid="home-toggle"
                >
                  {playing ? (
                    <PauseIcon fontSize="large" />
                  ) : (
                    <PlayArrowIcon fontSize="large" />
                  )}
                </button>
                <button
                  title="Siguiente"
                  onClick={() => getAudioInstance()?.playNext?.()}
                >
                  <SkipNextIcon fontSize="large" />
                </button>
                <button
                  title="Repetir"
                  className={isRepeat ? 'active' : ''}
                  onClick={() =>
                    dispatch(setPlayMode(isRepeat ? 'order' : 'orderLoop'))
                  }
                >
                  <RepeatIcon />
                </button>
              </div>
              <div className="mm-time-row">
                <span>{formatDuration(progress.pos)}</span>
                <div
                  className="mm-range"
                  onClick={seek}
                  data-testid="home-seek"
                >
                  <div
                    className="mm-fill"
                    style={{ width: `${Math.round(ratio * 100)}%` }}
                  />
                </div>
                <span>{formatDuration(progress.dur)}</span>
              </div>
            </div>

            <div />

            <div className="mm-volume-wrap">
              <div className="mm-volume-row">
                <VolumeUpIcon />
                <div
                  className="mm-range"
                  onClick={changeVolume}
                  data-testid="home-volume"
                >
                  <div
                    className="mm-fill"
                    style={{ width: `${Math.round(volume * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// --- Vista Inicio ----------------------------------------------------------
const HomeView = () => {
  const translate = useTranslate()
  const notify = useNotify()
  const refresh = useRefresh()
  const dataProvider = useDataProvider()
  const dispatch = useDispatch()
  const history = useHistory()
  const playerState = useSelector((state) => state.player)

  // En el móvil Inicio se reduce a la biblioteca de canciones y su buscador.
  // Se ocultan "lo que suena", "escuchado recientemente", "playlists para
  // ti" y los botones de filtro, ordenar y subir música: nada de eso se puede
  // aprovechar cómodamente en una pantalla de 390px y, en el caso de las
  // tarjetas, ocupan más alto que la propia biblioteca.
  // 768px y no el `xs` de Material-UI (600px) para que el iPhone en
  // horizontal siga entrando: se usa el mismo corte que el reproductor.
  // `noSsr` es necesario porque sin él useMediaQuery devuelve false en el
  // primer render y devuelve el valor real en el siguiente; el efecto de
  // carga se dispararía antes con isPhone=false y pediría los álbumes y las
  // playlists que acto seguido no se pintan. La app no usa renderizado en
  // servidor, así que no hay hidratación que pueda desajustar.
  const isPhone = useMediaQuery('(max-width:768px)', { noSsr: true })

  const queue = playerState?.queue || []
  const current = playerState?.current || {}
  const displayQueue = isPhone
    ? queue.filter((item) => item.manualQueued && item.uuid !== current.uuid)
    : queue
  const deletedSongIds = useRef(new Set())
  const [query, setQuery] = useState('')
  const [recentAlbums, setRecentAlbums] = useState(null)
  const [playlists, setPlaylists] = useState(null)
  const [latestSongs, setLatestSongs] = useState(null)
  const [songsTotal, setSongsTotal] = useState(null)
  const [scanning, setScanning] = useState(false)
  const [libraryRevision, setLibraryRevision] = useState(0)
  const [searching, setSearching] = useState(false)
  const location = useLocation()
  const queueView =
    isPhone && new URLSearchParams(location.search).get('view') === 'queue'
  const [page, setPage] = useState(1)
  const [loadingMore, setLoadingMore] = useState(false)
  const [deleting, setDeleting] = useState(new Set())
  const loadGeneration = useRef(0)
  const loadingMoreRef = useRef(false)
  const loadMoreAnchor = useRef(null)
  const playFromRow = (song) => {
    const audio = getAudioInstance()
    if (
      (current?.trackId || current?.song?.id) === song.id &&
      audio &&
      !audio.ended
    ) {
      if (audio.paused) audio.play?.()
      else audio.pause?.()
    } else dispatch(setTrack(song))
  }

  useEffect(() => {
    let alive = true
    // En móvil esas dos secciones no se pintan, así que no se piden: se
    // ahorran dos llamadas a la API en cada carga de la portada.
    if (!isPhone) {
      dataProvider
        .getList('album', {
          pagination: { page: 1, perPage: 5 },
          sort: { field: 'play_date', order: 'DESC' },
          filter: { recently_played: true },
        })
        .then((res) => alive && setRecentAlbums(res.data || []))
        .catch(() => alive && setRecentAlbums([]))
      dataProvider
        .getList('playlist', {
          pagination: { page: 1, perPage: 4 },
          sort: { field: 'name', order: 'ASC' },
          filter: {},
        })
        .then((res) => alive && setPlaylists(res.data || []))
        .catch(() => alive && setPlaylists([]))
    }
    return () => {
      alive = false
    }
  }, [dataProvider, isPhone])

  const invalidateLibrary = useCallback(() => {
    loadGeneration.current++
  }, [])

  // Search replaces rows inside the library. Cleanup also rejects delayed
  // replies from an older query, including when the input is cleared.
  useEffect(() => {
    let alive = true
    const generation = ++loadGeneration.current
    loadingMoreRef.current = false
    setLoadingMore(false)
    setPage(1)
    const q = query.trim()
    const load = async () => {
      setSearching(true)
      try {
        let rows, total
        if (q) {
          const matches = await searchSongs(q, 50)
          const ids = matches.map((song) => song.id)
          const response = ids.length
            ? await dataProvider.getMany('song', { ids })
            : { data: [] }
          const byId = new Map(response.data.map((song) => [song.id, song]))
          rows = ids.map((id) => byId.get(id)).filter(Boolean)
          total = rows.length
        } else {
          const response = await dataProvider.getList('song', {
            pagination: { page: 1, perPage: isPhone ? 30 : 10 },
            sort: { field: 'recently_added', order: 'DESC' },
            filter: {},
          })
          rows = response.data || []
          total = response.total
        }
        if (alive && generation === loadGeneration.current) {
          setLatestSongs(
            rows.filter((song) => !deletedSongIds.current.has(song.id)),
          )
          setSongsTotal(total)
        }
      } catch {
        if (alive && generation === loadGeneration.current) {
          setLatestSongs([])
          notify(
            'No se pudo cargar la biblioteca. Revisa la conexión.',
            'warning',
          )
        }
      } finally {
        if (alive) setSearching(false)
      }
    }
    const timer = q ? setTimeout(load, 180) : null
    if (!q) load()
    return () => {
      alive = false
      if (timer) clearTimeout(timer)
      invalidateLibrary()
    }
  }, [query, dataProvider, libraryRevision, notify, isPhone, invalidateLibrary])
  const loadMore = useCallback(async () => {
    if (
      !isPhone ||
      query.trim() ||
      loadingMoreRef.current ||
      !latestSongs ||
      page * 30 >= songsTotal
    )
      return
    const generation = loadGeneration.current
    loadingMoreRef.current = true
    setLoadingMore(true)
    try {
      const response = await dataProvider.getList('song', {
        pagination: { page: page + 1, perPage: 30 },
        sort: { field: 'recently_added', order: 'DESC' },
        filter: {},
      })
      if (generation !== loadGeneration.current) return
      setLatestSongs((rows) => {
        const seen = new Set(rows.map((song) => song.id))
        return [
          ...rows,
          ...response.data.filter(
            (song) =>
              !seen.has(song.id) && !deletedSongIds.current.has(song.id),
          ),
        ]
      })
      setPage((value) => value + 1)
    } catch {
      if (generation === loadGeneration.current)
        notify(
          'No se pudieron cargar más canciones. Puedes reintentar.',
          'warning',
        )
    } finally {
      if (generation === loadGeneration.current) {
        loadingMoreRef.current = false
        setLoadingMore(false)
      }
    }
  }, [isPhone, query, latestSongs, page, songsTotal, dataProvider, notify])
  useEffect(() => {
    if (!loadMoreAnchor.current || typeof IntersectionObserver === 'undefined')
      return undefined
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) loadMore()
      },
      { rootMargin: '200px' },
    )
    observer.observe(loadMoreAnchor.current)
    return () => observer.disconnect()
  }, [loadMore, queueView])
  const reloadSongs = useCallback(
    () => setLibraryRevision((value) => value + 1),
    [],
  )

  const quickScan = async () => {
    setScanning(true)
    try {
      await subsonic.startScan({ fullScan: false })
      notify('resources.library.notifications.quickScanStarted', 'info')
      refresh()
    } catch {
      notify('resources.library.notifications.scanError', 'warning')
    } finally {
      setScanning(false)
    }
  }

  const jumpToQueueItem = (item) => {
    if (isPhone) {
      playFromRow(item.song)
      return
    }
    const data = {}
    const ids = queue.map((it) => {
      data[it.uuid] = it.song
      return it.uuid
    })
    dispatch(playTracks(data, ids, item.uuid))
  }

  const queueSong = (song) => {
    dispatch(addTracks({ [song.id]: song }))
    notify(
      `Añadida a la cola · posición ${displayQueue.length + 1}: ${song.title}`,
      'info',
    )
  }

  const deleteSong = async (song) => {
    if (deleting.has(song.id)) return
    if (
      !window.confirm(
        `¿Borrar "${song.title}" de la biblioteca? El archivo se elimina, no se puede deshacer.`,
      )
    ) {
      return
    }
    setDeleting((ids) => new Set(ids).add(song.id))
    notify(`Borrando: ${song.title}…`, 'info')
    try {
      const res = await deleteTrackFromServer(song.id)
      if (res?.deleted?.includes(song.id)) {
        deletedSongIds.current.add(song.id)
        setLatestSongs((rows) => rows?.filter((row) => row.id !== song.id))
        subsonic.startScan({ fullScan: false }).catch(() => {})
        reloadSongs()
        const currentTrackId = current?.trackId || current?.song?.id
        if (currentTrackId === song.id) {
          const index = queue.findIndex((item) => item.uuid === current.uuid)
          if (index >= 0 && index < queue.length - 1)
            getAudioInstance()?.playNext?.()
          else getAudioInstance()?.pause?.()
        }
        dispatch(removeTrack(song.id))
        notify(`Borrada de la biblioteca: ${song.title}`, 'info')
      } else {
        notify(
          `No se borró ${song.title}: ${res?.errors?.[0]?.error || 'error'}`,
          'warning',
        )
      }
    } catch (e) {
      notify(
        e?.status === 401
          ? 'Tu sesión caducó: vuelve a iniciar sesión en Navidrome.'
          : e.detail || e.message || 'Borrado fallido: revisa la conexión.',
        'warning',
      )
    } finally {
      setDeleting((ids) => {
        const next = new Set(ids)
        next.delete(song.id)
        return next
      })
    }
  }

  return (
    <div
      className={`mm-home ${queueView ? 'mm-show-queue' : 'mm-show-library'}`}
    >
      <Title title="Mi Música" />

      {!isPhone && (
        <div className="mm-topbar">
          <button
            className="mm-pill-btn"
            onClick={() => history.push('/song')}
            data-testid="home-filters"
          >
            <TuneIcon /> {translate('home.filters', { _: 'Filtros' })}
          </button>
          <button
            className="mm-pill-btn"
            onClick={() => history.push('/song')}
            data-testid="home-sort"
          >
            <SortIcon />{' '}
            {translate('home.sort', { _: 'Ordenar: Fecha agregada' })}
          </button>
          <a className="mm-pill-btn blue" href="/downloader">
            <CloudUploadIcon />{' '}
            {translate('home.upload', { _: 'Subir música' })}
          </a>
        </div>
      )}

      {isPhone && current?.song && <CompactPlayback song={current.song} />}
      <div className="mm-content-grid">
        <div>
          {!isPhone && <NowPlaying queue={queue} current={current} />}

          {!isPhone && (
            <div className="mm-row-grid">
              <section className="mm-card mm-section-card">
                <div className="mm-section-head">
                  <h4>
                    {translate('home.recentlyPlayed', {
                      _: 'Escuchado recientemente',
                    })}
                  </h4>
                  <a href="#/album/recentlyPlayed?sort=play_date&order=DESC&filter=%7B%22recently_played%22%3Atrue%7D">
                    {translate('home.seeAll', { _: 'Ver todo' })}
                  </a>
                </div>

                {!recentAlbums ? (
                  <div className="mm-spinner">
                    <CircularProgress size={24} />
                  </div>
                ) : recentAlbums.length === 0 ? (
                  <div className="mm-empty">
                    {translate('home.noRecent', {
                      _: 'Aún no hay reproducciones.',
                    })}
                  </div>
                ) : (
                  <div className="mm-cover-grid">
                    {recentAlbums.map((album) => (
                      <button
                        key={album.id}
                        className="mm-cover-card"
                        onClick={() => history.push(`/album/${album.id}/show`)}
                        data-testid="home-album-card"
                      >
                        <img
                          className="mm-cover-box"
                          src={subsonic.getCoverArtUrl(album, 300, true)}
                          alt={album.name}
                          loading="lazy"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none'
                          }}
                        />
                        <span
                          className="mm-cover-play"
                          role="button"
                          aria-label="play-album"
                          data-testid="home-album-play"
                          onClick={(e) => {
                            e.stopPropagation()
                            dataProvider
                              .getList('song', {
                                pagination: { page: 1, perPage: -1 },
                                sort: { field: 'album', order: 'ASC' },
                                filter: { album_id: album.id },
                              })
                              .then((res) => {
                                const data = {}
                                const ids = (res.data || []).map((s) => {
                                  data[s.id] = s
                                  return s.id
                                })
                                if (ids.length > 0)
                                  dispatch(playTracks(data, ids))
                              })
                              .catch(() => {})
                          }}
                        >
                          <PlayArrowIcon />
                        </span>
                        <b>{album.name}</b>
                        <span>{album.albumArtist || album.artist}</span>
                      </button>
                    ))}
                  </div>
                )}
              </section>

              <section className="mm-card mm-section-card">
                <div className="mm-section-head">
                  <h4>
                    {translate('home.playlists', { _: 'Playlists para ti' })}
                  </h4>
                  <a href="#/playlist">
                    {translate('home.seeAll', { _: 'Ver todo' })}
                  </a>
                </div>

                {!playlists ? (
                  <div className="mm-spinner">
                    <CircularProgress size={24} />
                  </div>
                ) : playlists.length === 0 ? (
                  <div className="mm-empty">
                    {translate('home.noPlaylists', {
                      _: 'Aún no hay playlists.',
                    })}
                  </div>
                ) : (
                  <div className="mm-cover-grid">
                    {playlists.map((pl) => (
                      <button
                        key={pl.id}
                        className="mm-cover-card"
                        onClick={() => history.push(`/playlist/${pl.id}/show`)}
                        data-testid="home-playlist-card"
                      >
                        <span className="mm-cover-box">
                          <MusicNoteIcon
                            style={{
                              width: '100%',
                              height: '100%',
                              padding: '30%',
                              color: 'rgba(255,255,255,.85)',
                            }}
                          />
                        </span>
                        <b>{pl.name}</b>
                        <span>
                          {translate('home.songsCount', {
                            _: `${pl.songCount ?? '?'} canciones`,
                            smart_count: pl.songCount,
                          })}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}

          {(!isPhone || !queueView) && (
            <section className="mm-card mm-library">
              <div className="mm-library-head">
                <div>
                  {!isPhone && (
                    <h3>
                      {translate('home.library', {
                        _: 'Biblioteca de canciones',
                      })}
                    </h3>
                  )}
                  <p>
                    {songsTotal != null
                      ? translate('home.librarySubtitle', {
                          _: query.trim()
                            ? `${songsTotal} resultados`
                            : `${songsTotal} canciones en total · últimas agregadas`,
                        })
                      : translate('home.librarySubtitleShort', {
                          _: 'Últimas canciones agregadas',
                        })}
                  </p>
                </div>

                <div className="mm-library-tools">
                  <div className="mm-library-search">
                    {searching ? (
                      <CircularProgress size={18} />
                    ) : (
                      <SearchIcon />
                    )}
                    <input
                      type="search"
                      aria-label="Buscar canción o artista"
                      placeholder={translate('home.librarySearch', {
                        _: 'Buscar en la biblioteca...',
                      })}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      data-testid="home-library-search"
                    />
                  </div>
                </div>
              </div>

              {!latestSongs ? (
                <div className="mm-spinner">
                  <CircularProgress size={24} />
                </div>
              ) : latestSongs.length === 0 ? (
                <div className="mm-empty">
                  {translate('home.noSongs', { _: 'No hay canciones.' })}
                </div>
              ) : (
                <table data-testid="home-songs-table">
                  <thead>
                    <tr>
                      <th style={{ width: 44 }} />
                      <th>{translate('home.colTitle', { _: 'Título' })}</th>
                      <th>{translate('home.colArtist', { _: 'Artista' })}</th>
                      <th>{translate('home.colAlbum', { _: 'Álbum' })}</th>
                      <th>{translate('home.colGenre', { _: 'Género' })}</th>
                      <th>
                        {translate('home.colDuration', { _: 'Duración' })}
                      </th>
                      <th>
                        {translate('home.colAdded', { _: 'Fecha agregada' })}
                      </th>
                      <th>{translate('home.colQuality', { _: 'Calidad' })}</th>
                      <th>{translate('home.colActions', { _: 'Acciones' })}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {latestSongs.map((song) => {
                      const active =
                        (current?.trackId || current?.song?.id) === song.id
                      if (isPhone)
                        return (
                          <MobileSongRow
                            key={song.id}
                            song={song}
                            active={active}
                            onPlay={playFromRow}
                            onQueue={queueSong}
                            onDelete={deleteSong}
                            deleting={deleting.has(song.id)}
                          />
                        )
                      const quality = qualityOf(song)
                      return (
                        <tr key={song.id} data-testid="home-song-row">
                          <td>
                            <SongPlayButton
                              onPlay={(record) => dispatch(setTrack(record))}
                              record={song}
                            />
                          </td>
                          <td>
                            <div className="mm-song-cell">
                              <div className="mm-truncate">{song.title}</div>
                            </div>
                          </td>
                          <td>
                            <div className="mm-truncate">{song.artist}</div>
                          </td>
                          <td>
                            <div className="mm-truncate">{song.album}</div>
                          </td>
                          <td>
                            {song.genre ? (
                              <span className={genreClass(song.genre)}>
                                {song.genre}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td>{formatDuration(song.duration)}</td>
                          <td>
                            {song.createdAt
                              ? new Date(song.createdAt).toLocaleDateString()
                              : '—'}
                          </td>
                          <td>
                            <span
                              className={
                                quality.hifi
                                  ? 'mm-quality mm-hifi'
                                  : 'mm-quality'
                              }
                            >
                              {quality.label}
                            </span>
                          </td>
                          <td>
                            <div className="mm-row-actions">
                              <LoveButton
                                resource="song"
                                record={song}
                                visible
                              />
                              <button
                                title={translate('home.queue', {
                                  _: 'Añadir a la cola',
                                })}
                                onClick={() => queueSong(song)}
                                data-testid="home-song-queue"
                              >
                                <AddIcon fontSize="small" />
                              </button>
                              <button
                                title={translate('home.delete', {
                                  _: 'Borrar de la biblioteca',
                                })}
                                className="mm-danger"
                                onClick={() => deleteSong(song)}
                                data-testid="home-song-delete"
                              >
                                <DeleteIcon fontSize="small" />
                              </button>
                              <SongContextMenu record={song} />
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
              {isPhone &&
                !query.trim() &&
                latestSongs &&
                page * 30 < songsTotal && (
                  <div ref={loadMoreAnchor} className="mm-load-more">
                    <button
                      disabled={loadingMore || searching}
                      onClick={loadMore}
                    >
                      {loadingMore ? 'Cargando…' : 'Cargar más canciones'}
                    </button>
                  </div>
                )}
            </section>
          )}
        </div>

        <div>
          {(!isPhone || queueView) && (
            <section className="mm-card mm-queue">
              <div className="mm-queue-head">
                <h3>
                  {translate('home.queue', { _: 'Cola de reproducción' })}
                </h3>
                <small>
                  {displayQueue.length > 0
                    ? translate('home.queueCount', {
                        _: `${displayQueue.length} canciones`,
                      })
                    : ''}
                </small>
              </div>

              {displayQueue.length === 0 ? (
                <div className="mm-empty">
                  {translate('home.queueEmpty', {
                    _: isPhone
                      ? 'Cola vacía: añade canciones con ＋.'
                      : 'Cola vacía: dale ▶ a algo.',
                  })}
                </div>
              ) : (
                <div className="mm-queue-list">
                  {displayQueue.map((item) => (
                    <button
                      key={item.uuid}
                      className={
                        item.uuid === current?.uuid
                          ? 'mm-queue-item active'
                          : 'mm-queue-item'
                      }
                      onClick={() => jumpToQueueItem(item)}
                      data-testid="home-queue-item"
                    >
                      {item.cover ? (
                        <img
                          className="mm-thumb"
                          src={item.cover}
                          alt=""
                          loading="lazy"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none'
                          }}
                        />
                      ) : (
                        <div className="mm-thumb" />
                      )}
                      <div className="mm-queue-info">
                        <b>{item.name}</b>
                        <span>{item.singer || item.song?.artist}</span>
                      </div>
                      <div className="mm-queue-time">
                        {formatDuration(item.duration)}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}

          {!isPhone && (
            <section className="mm-card mm-quick-tools">
              <h3>
                {translate('home.quickTools', { _: 'Herramientas rápidas' })}
              </h3>

              <div className="mm-tool-list">
                <button
                  className="mm-tool-item"
                  onClick={quickScan}
                  disabled={scanning}
                  data-testid="home-tool-scan"
                >
                  <div className="mm-tool-icon cyan">
                    <SyncIcon />
                  </div>
                  <div className="mm-tool-copy">
                    <b>{translate('home.toolScan', { _: 'Sincronización' })}</b>
                    <span>
                      {translate('home.toolScanDesc', {
                        _: 'Sincroniza con carpetas monitoreadas',
                      })}
                    </span>
                  </div>
                  <ChevronRightIcon />
                </button>

                <a className="mm-tool-item" href="#/folders">
                  <div className="mm-tool-icon orange">
                    <FolderOpenIcon />
                  </div>
                  <div className="mm-tool-copy">
                    <b>
                      {translate('home.toolFolders', {
                        _: 'Carpetas de música',
                      })}
                    </b>
                    <span>
                      {translate('home.toolFoldersDesc', {
                        _: 'Navega Género / Artista / Álbum del disco',
                      })}
                    </span>
                  </div>
                  <ChevronRightIcon />
                </a>

                <a className="mm-tool-item" href="/downloader">
                  <div className="mm-tool-icon blue">
                    <CloudDownloadIcon />
                  </div>
                  <div className="mm-tool-copy">
                    <b>
                      {translate('home.toolDownloader', {
                        _: 'Descargas',
                      })}
                    </b>
                    <span>
                      {translate('home.toolDownloaderDesc', {
                        _: 'Baja y organiza música nueva',
                      })}
                    </span>
                  </div>
                  <ChevronRightIcon />
                </a>

                <a className="mm-tool-item" href="#/remote">
                  <div className="mm-tool-icon purple">
                    <PhonelinkIcon />
                  </div>
                  <div className="mm-tool-copy">
                    <b>{translate('home.toolRemote', { _: 'Mando móvil' })}</b>
                    <span>
                      {translate('home.toolRemoteDesc', {
                        _: 'Controla este reproductor desde el móvil',
                      })}
                    </span>
                  </div>
                  <ChevronRightIcon />
                </a>

                <a className="mm-tool-item" href="#/help">
                  <div className="mm-tool-icon green">
                    <HelpOutlineIcon />
                  </div>
                  <div className="mm-tool-copy">
                    <b>{translate('home.toolHelp', { _: 'Ayuda' })}</b>
                    <span>
                      {translate('home.toolHelpDesc', {
                        _: 'Auto-DJ, mando y descargas',
                      })}
                    </span>
                  </div>
                  <ChevronRightIcon />
                </a>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}

export default HomeView

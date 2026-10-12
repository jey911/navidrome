import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslate } from 'react-admin'
import {
  Button,
  Card,
  CardContent,
  CircularProgress,
  IconButton,
  List,
  ListItem,
  ListItemText,
  TextField,
  Typography,
  makeStyles,
} from '@material-ui/core'
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Close as CloseIcon,
  Pause as PauseIcon,
  PlayArrow as PlayIcon,
  Refresh as RefreshIcon,
  Search as SearchIcon,
  SkipNext as NextIcon,
  SkipPrevious as PrevIcon,
  VolumeDown as VolDownIcon,
  VolumeUp as VolUpIcon,
} from '@material-ui/icons'
import { fetchState, listSessions, sendCommand } from './remoteApi'
import { searchSongs, SEARCH_LIMIT } from './searchSongs'
import QueuedIndicator from '../common/QueuedIndicator'
import './remote.css'

const TARGET_KEY = 'remoteTarget'

const useStyles = makeStyles((theme) => ({
  // Mando móvil: mobile-first. En pantallas grandes se centra a 640px;
  // en el móvil ocupa todo el ancho con filas y botones táctiles.
  root: {
    padding: theme.spacing(1.5),
    maxWidth: 640,
    margin: '0 auto',
    paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
    width: '100%',
    boxSizing: 'border-box',
    minWidth: 0,
    [theme.breakpoints.up('sm')]: {
      padding: theme.spacing(2),
    },
  },
  card: {
    marginBottom: theme.spacing(2),
    borderRadius: 20,
    overflow: 'hidden',
  },
  // Keep controls in normal flow: a tall sticky card obscures mobile search.
  nowPlaying: {
    position: 'relative',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    flexWrap: 'wrap',
  },
  transport: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-around',
    gap: 4,
    marginTop: theme.spacing(1),
  },
  bigToggle: {
    width: 60,
    height: 60,
  },
  grow: { flexGrow: 1, minWidth: 0 },
  session: { width: '100%', marginBottom: theme.spacing(1) },
  error: { color: theme.palette.error.main },
  hint: { marginTop: theme.spacing(1) },
  result: {
    borderBottom: `1px solid ${theme.palette.divider}`,
    paddingTop: 10,
    paddingBottom: 10,
    minHeight: 60,
  },
  // El nombre del tema ocupa todo el hueco y se corta con puntos:
  // tocarlo reproduce (equivale a ▶).
  resultText: {
    minWidth: 0,
    flexGrow: 1,
    cursor: 'pointer',
    '& .MuiListItemText-primary, & .MuiListItemText-secondary': {
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    },
  },
  resultActions: {
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
  },
  seekRow: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    marginTop: theme.spacing(1),
  },
  seek: {
    flexGrow: 1,
    height: 36,
    minWidth: 0,
    accentColor: '#4b9cff',
    cursor: 'pointer',
  },
  seekTime: {
    minWidth: 44,
    textAlign: 'center',
    fontVariantNumeric: 'tabular-nums',
  },
  nowTitle: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
}))

const readStoredTarget = () => {
  try {
    return JSON.parse(localStorage.getItem(TARGET_KEY) || 'null')
  } catch {
    return null
  }
}

const persistTarget = (value) => {
  try {
    if (value) {
      localStorage.setItem(TARGET_KEY, JSON.stringify(value))
    } else {
      localStorage.removeItem(TARGET_KEY)
    }
  } catch {
    // sin almacenamiento: el emparejamiento se pierde al recargar
  }
}

// Vista "mando": desde el móvil se controla el reproductor del laptop.
// El audio sigue sonando en el laptop; aquí solo viajan órdenes.
// Esta pantalla NUNCA reproduce localmente.
const RemoteView = () => {
  const classes = useStyles()
  const translate = useTranslate()
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  // Inicializador perezoso único: antes se llamaba a storedTarget() dos veces
  // y `storedTarget?.code` leía la FUNCIÓN (siempre '') en vez del objeto.
  const [initialTarget] = useState(readStoredTarget)
  const [target, setTarget] = useState(initialTarget)
  const [code, setCode] = useState(initialTarget?.code || '')
  const [state, setState] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [connection, setConnection] = useState('Conectando…')
  const [commandStatus, setCommandStatus] = useState('')
  const pendingCommand = useRef(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [hasSearched, setHasSearched] = useState(false)
  // Avisos puntuales del laptop (p. ej. resultado de un borrado): el estado
  // se sondea cada 3s y el aviso persiste hasta el siguiente evento, así que
  // solo se pinta cuando cambia.
  const [notice, setNotice] = useState('')
  const seenNoticeRef = useRef('')
  // Posición local de la barra de avance: mientras se arrastra manda lo
  // local; al soltar se envía la orden seek. Se resetea al cambiar de tema.
  const [seekPos, setSeekPos] = useState(null)
  const [volumeDraft, setVolumeDraft] = useState(null)
  const volumeEdit = useRef(null)
  const volumePending = useRef(null)
  const lastStateAt = useRef(0)
  const commandBusy = useRef(false)
  const searchRequest = useRef(0)

  const formatMs = (ms) => {
    if (!ms && ms !== 0) return '--:--'
    const s = Math.floor(ms / 1000)
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  }

  const handleState = useCallback((s) => {
    const timestamp = Date.parse(s?.at) || 0
    if (timestamp && timestamp < lastStateAt.current) return
    lastStateAt.current = timestamp || lastStateAt.current
    setState(s)
    const fresh = s && timestamp && Date.now() - timestamp < 15000
    setConnection(fresh ? 'Conectado' : 'Esperando al reproductor…')
    if (pendingCommand.current && s?.commandId === pendingCommand.current.id) {
      const pending = pendingCommand.current
      setCommandStatus(
        s.commandError ||
          (['queueTrack', 'playNextTrack'].includes(pending.action)
            ? 'Canción añadida a la cola'
            : pending.action === 'removeQueuedTrack'
              ? 'Canción quitada de la cola'
              : 'Orden aplicada'),
      )
      if (!s.commandError && pending.action === 'deleteTrack')
        setResults((rows) => rows.filter((song) => song.id !== pending.songId))
      pendingCommand.current = null
    } else if (
      pendingCommand.current &&
      Date.now() - pendingCommand.current.at > 10000
    ) {
      setCommandStatus(
        'Sin confirmación del equipo. Revisa la conexión antes de reintentar.',
      )
      pendingCommand.current = null
    }
    const pending = volumePending.current
    if (
      pending &&
      volumeEdit.current == null &&
      (Math.abs((s?.volume ?? -1) - pending.level) < 0.015 ||
        Date.now() - pending.at > 8000)
    ) {
      volumePending.current = null
      setVolumeDraft(null)
    }
    if (s?.notice && s.notice !== seenNoticeRef.current) {
      seenNoticeRef.current = s.notice
      setNotice(s.notice)
    }
  }, [])

  const refreshSessions = useCallback(() => {
    listSessions()
      .then((list) => {
        setSessions(Array.isArray(list) ? list : [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const drop = useCallback(() => {
    setVolumeDraft(null)
    volumeEdit.current = null
    volumePending.current = null
    pendingCommand.current = null
    setCommandStatus('')
    setConnection('Conectando…')
    setTarget(null)
    lastStateAt.current = 0
    setState(null)
    persistTarget(null)
  }, [])

  const pick = useCallback(
    (sessionId) => {
      lastStateAt.current = 0
      const next = { sessionId, code }
      setTarget(next)
      persistTarget(next)
      setError('')
    },
    [code],
  )

  // El código es editable también con la sesión ya elegida: se recuerda
  // para no obligar a reemparejar si se tecleó mal o llegó tarde.
  useEffect(() => {
    if (!target || target.code === code) return
    const next = { ...target, code }
    setTarget(next)
    persistTarget(next)
  }, [code, target])

  // Lista de sesiones: solo se refresca mientras no hay destino elegido.
  // Al elegir uno se limpia el intervalo (sin polling de fondo). Depende de
  // si HAY destino, no del objeto (editar el código no reinicia el sondeo).
  const hasTarget = !!target
  useEffect(() => {
    refreshSessions()
    if (hasTarget) return undefined
    const t = setInterval(refreshSessions, 5000)
    return () => clearInterval(t)
  }, [refreshSessions, hasTarget])

  // Estado del laptop emparejado. Si el servidor responde 404 (sesión
  // caducada/inexistente) se limpia el destino obsoleto y se vuelve a la
  // lista para reemparejar. Si solo es "aún sin estado", se sigue sondeando.
  const sessionId = target?.sessionId
  useEffect(() => {
    if (!sessionId) return undefined
    let alive = true
    let polling = false
    const poll = () => {
      if (polling) return
      polling = true
      fetchState(sessionId)
        .then((s) => alive && handleState(s))
        .catch((e) => {
          if (!alive) return
          setConnection('Reconectando…')
          if (e?.status !== 404) return
          setState(null)
          listSessions()
            .then((list) => {
              if (!alive) return
              const exists =
                Array.isArray(list) &&
                list.some((s) => s.sessionId === sessionId)
              if (!exists) {
                drop()
                setError(
                  translate('remote.sessionGone', {
                    _: 'La sesión ya no está disponible. Vuelve a emparejar.',
                  }),
                )
              }
            })
            .catch(() => {})
        })
        .finally(() => {
          polling = false
        })
    }
    poll()
    const t = setInterval(poll, 3000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [sessionId, drop, translate, handleState])

  const cmd = async (action, payload) => {
    if (!target || commandBusy.current) return
    commandBusy.current = true
    setBusy(true)
    setError('')
    try {
      const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
      pendingCommand.current = {
        id: requestId,
        at: Date.now(),
        action,
        songId: payload?.id,
      }
      setCommandStatus('Enviando orden…')
      await sendCommand(target.sessionId, code, action, {
        ...payload,
        requestId,
      })
      setCommandStatus('Orden enviada · esperando confirmación')
      const s = await fetchState(target.sessionId).catch(() => null)
      if (s) handleState(s)
      return true
    } catch (e) {
      pendingCommand.current = null
      setCommandStatus('')
      setError(
        e?.status === 403
          ? translate('remote.badCode', { _: 'Código incorrecto' })
          : translate('remote.cmdError', { _: 'No se pudo enviar la orden' }),
      )
      return false
    } finally {
      commandBusy.current = false
      setBusy(false)
    }
  }

  const runSearch = useCallback(async () => {
    const q = query.trim()
    if (!q) {
      searchRequest.current++
      setSearching(false)
      setResults([])
      setHasSearched(false)
      setSearchError('')
      return
    }
    const request = ++searchRequest.current
    setSearching(true)
    setSearchError('')
    setResults([])
    try {
      const songs = await searchSongs(q, SEARCH_LIMIT)
      if (request !== searchRequest.current) return
      setResults(songs)
      setHasSearched(true)
    } catch {
      if (request !== searchRequest.current) return
      setResults([])
      setHasSearched(true)
      setSearchError(
        translate('remote.searchError', {
          _: 'No se pudo buscar. Revisa la conexión.',
        }),
      )
    } finally {
      if (request === searchRequest.current) setSearching(false)
    }
  }, [query, translate])
  const invalidateSearch = useCallback(() => {
    searchRequest.current++
  }, [])
  useEffect(() => {
    invalidateSearch()
    const timer = setTimeout(runSearch, 180)
    return () => {
      clearTimeout(timer)
      invalidateSearch()
    }
  }, [runSearch, invalidateSearch])

  const playSong = (song) => cmd('playTrack', { id: song.id })
  // The paired player uses the same explicit FIFO queue as the library.
  const queueNextSong = (song) => cmd('playNextTrack', { id: song.id })
  const queueSong = (song) => cmd('queueTrack', { id: song.id })
  // Borrado irreversible del ARCHIVO (lo ejecuta el laptop vía Emepetre):
  // siempre con confirmación. Vale para resultados y para lo que suena.
  const deleteSong = (song) => {
    const label = song.title
      ? `"${song.title}"${song.artist ? ` (${song.artist})` : ''}`
      : 'esta canción'
    if (
      window.confirm(
        `¿Borrar ${label} de la biblioteca? El archivo se elimina, no se puede deshacer.`,
      )
    ) {
      cmd('deleteTrack', { id: song.id })
    }
  }
  const deleteCurrent = () => {
    if (!state?.trackId) return
    deleteSong({
      id: state.trackId,
      title: state.title,
      artist: state.artist,
    })
  }

  // Al cambiar de tema se descarta la posición local arrastrada.
  const trackId = state?.trackId
  useEffect(() => {
    setSeekPos(null)
  }, [trackId])

  const durationMs = state?.durationMs || 0
  const livePos = state?.positionMs || 0
  const shownPos = seekPos ?? Math.min(livePos, durationMs || livePos)

  const shownVolume = Math.round(
    volumeDraft ?? Math.max(0, Math.min(1, state?.volume ?? 0.5)) * 100,
  )
  const commitVolume = () => {
    const value = volumeEdit.current
    if (value == null) return
    volumeEdit.current = null
    volumePending.current = { level: value / 100, at: Date.now() }
    cmd('volume', { level: value / 100 }).then((ok) => {
      if (!ok) {
        volumePending.current = null
        setVolumeDraft(null)
      }
    })
  }

  const commitSeek = () => {
    if (seekPos == null || durationMs <= 0) {
      setSeekPos(null)
      return
    }
    const seconds = Math.max(0, seekPos / 1000)
    setSeekPos(null)
    cmd('seek', { seconds })
  }

  return (
    <div className={`${classes.root} mm-remote`}>
      {target && (
        <div className="mm-remote-status" role="status">
          <span className={connection === 'Conectado' ? 'connected' : ''}>
            {connection}
          </span>
          <small>{commandStatus}</small>
        </div>
      )}
      <Typography variant="h5" gutterBottom>
        {translate('menu.remote', { _: 'Control remoto' })}
      </Typography>

      {!target && (
        <Card className={`${classes.card} mm-remote-pairing`}>
          <CardContent>
            <Typography variant="subtitle1" gutterBottom>
              {translate('remote.pickSession', {
                _: '1. Activa 📱 en el reproductor del laptop y elige la sesión:',
              })}
            </Typography>
            {loading && <CircularProgress size={24} />}
            {!loading && sessions.length === 0 && (
              <Typography color="textSecondary">
                {translate('remote.noSessions', {
                  _: 'No hay reproductores esperando mando. Activa 📱 en el laptop.',
                })}
              </Typography>
            )}
            <div className={classes.row}>
              <TextField
                label={translate('remote.code', {
                  _: '2. Código de 4 dígitos',
                })}
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, '').slice(0, 4))
                }
                variant="outlined"
                inputProps={{
                  inputMode: 'numeric',
                  maxLength: 4,
                  'aria-label': 'Código de emparejamiento',
                }}
              />
              <IconButton onClick={refreshSessions} title="Actualizar">
                <RefreshIcon />
              </IconButton>
            </div>
            {sessions.map((s) => (
              <Button
                key={s.sessionId}
                className={classes.session}
                variant="outlined"
                color="primary"
                onClick={() => pick(s.sessionId)}
              >
                {s.name || s.sessionId.slice(0, 8)}
              </Button>
            ))}
            {error && (
              <Typography className={classes.error}>{error}</Typography>
            )}
          </CardContent>
        </Card>
      )}

      {target && (
        <Card className={classes.card}>
          <CardContent>
            <div className="mm-remote-connection">
              <TextField
                label={translate('remote.code', { _: 'Código' })}
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, '').slice(0, 4))
                }
                variant="outlined"
                inputProps={{
                  inputMode: 'numeric',
                  maxLength: 4,
                  'aria-label': 'Código de emparejamiento',
                }}
              />
              <span className={classes.grow} />
              <Button size="small" onClick={drop}>
                {translate('remote.disconnect', { _: 'Desconectar' })}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      {target && (
        <Card className={`${classes.card} ${classes.nowPlaying}`}>
          <CardContent>
            <Typography variant="h6" className={classes.nowTitle}>
              {state?.title || '—'}
            </Typography>
            <Typography color="textSecondary" gutterBottom>
              {state?.artist || ''}
              {state ? (state.playing ? ' · ▶' : ' · ⏸') : ''}
            </Typography>
            {notice && (
              <Typography
                color="textSecondary"
                gutterBottom
                data-testid="remote-notice"
              >
                {notice}
              </Typography>
            )}
            {durationMs > 0 && (
              <div className={classes.seekRow}>
                <Typography
                  variant="caption"
                  color="textSecondary"
                  className={classes.seekTime}
                >
                  {formatMs(shownPos)}
                </Typography>
                <input
                  type="range"
                  className={classes.seek}
                  min={0}
                  max={durationMs}
                  step={1000}
                  value={Math.min(shownPos, durationMs)}
                  onChange={(e) => setSeekPos(Number(e.target.value))}
                  onMouseUp={commitSeek}
                  onTouchEnd={commitSeek}
                  onKeyUp={commitSeek}
                  aria-label="Avance del tema"
                  data-testid="remote-seek"
                />
                <Typography
                  variant="caption"
                  color="textSecondary"
                  className={classes.seekTime}
                >
                  {formatMs(durationMs)}
                </Typography>
              </div>
            )}
            <div className={classes.transport}>
              <IconButton
                onClick={() => cmd('prev')}
                disabled={busy}
                title="Anterior"
              >
                <PrevIcon fontSize="large" />
              </IconButton>
              <IconButton
                onClick={() => cmd('toggle')}
                disabled={busy}
                title="Play/Pausa"
                color="primary"
                className={classes.bigToggle}
              >
                {state?.playing ? (
                  <PauseIcon fontSize="large" />
                ) : (
                  <PlayIcon fontSize="large" />
                )}
              </IconButton>
              <IconButton
                onClick={() => cmd('next')}
                disabled={busy}
                title="Siguiente"
              >
                <NextIcon fontSize="large" />
              </IconButton>
              <IconButton
                onClick={deleteCurrent}
                disabled={busy || !state?.trackId}
                title="Borrar lo que suena (elimina el archivo)"
                data-testid="remote-delete-current"
              >
                <DeleteIcon />
              </IconButton>
            </div>
            <div className="mm-remote-volume">
              <VolDownIcon aria-hidden="true" />
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={shownVolume}
                disabled={busy}
                aria-label="Volumen"
                aria-valuetext={`${shownVolume}%`}
                data-testid="remote-volume"
                onChange={(event) => {
                  const value = Number(event.target.value)
                  volumeEdit.current = value
                  setVolumeDraft(value)
                }}
                onMouseUp={commitVolume}
                onTouchEnd={commitVolume}
                onKeyUp={commitVolume}
              />
              <VolUpIcon aria-hidden="true" />
              <output aria-live="off">{shownVolume}%</output>
            </div>

            {state?.nextTitle && (
              <div className="mm-remote-next" data-testid="remote-next-song">
                <small>A continuación</small>
                <strong>{state.nextTitle}</strong>
                <span>{state.nextArtist}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}
      {target && (
        <Card className={classes.card}>
          <CardContent>
            <Typography variant="subtitle1">
              Cola manual · {state?.queue?.length || 0}
            </Typography>
            {state?.queue?.length ? (
              <ol className="mm-remote-queue">
                {state.queue.map((song, index) => (
                  <li key={song.queueId || `${song.id}-${index}`}>
                    <div>
                      <strong>{song.title}</strong>
                      <span>{song.artist}</span>
                    </div>
                    <IconButton
                      aria-label={`Quitar de la cola: ${song.title}`}
                      title="Quitar de la cola"
                      disabled={busy || !song.queueId}
                      data-testid="remote-remove-queued"
                      onClick={() =>
                        cmd('removeQueuedTrack', { queueId: song.queueId })
                      }
                    >
                      <CloseIcon />
                    </IconButton>
                  </li>
                ))}
              </ol>
            ) : (
              <Typography color="textSecondary">
                Cola vacía: añade canciones con ＋.
              </Typography>
            )}
          </CardContent>
        </Card>
      )}
      {target && (
        <Card className={classes.card}>
          <CardContent>
            <div className="mm-remote-search">
              <TextField
                fullWidth
                label={translate('remote.search', { _: 'Buscar canción' })}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') runSearch()
                }}
                inputProps={{ 'data-testid': 'remote-search-input' }}
              />
              <IconButton
                onClick={runSearch}
                disabled={searching}
                title="Buscar"
                color="primary"
              >
                <SearchIcon />
              </IconButton>
            </div>

            {searching && <CircularProgress size={24} />}
            {searchError && (
              <Typography className={classes.error}>{searchError}</Typography>
            )}
            {!searching &&
              hasSearched &&
              !searchError &&
              results.length === 0 && (
                <Typography color="textSecondary">
                  {translate('remote.searchEmpty', {
                    _: 'Sin resultados. Prueba con otro título o artista.',
                  })}
                </Typography>
              )}
            {results.length > 0 && (
              <>
                <Typography variant="caption" color="textSecondary">
                  {translate('remote.queueHint', {
                    _: '▶ Reproducir solo este tema · ⏭ Siguiente · ＋ Cola manual.',
                  })}
                </Typography>
                <List dense>
                  {results.map((song) => (
                    <ListItem
                      key={song.id}
                      className={classes.result}
                      data-testid="remote-result"
                    >
                      <ListItemText
                        primary={song.title}
                        secondary={
                          <>
                            <span className="mm-truncate">{song.artist}</span>
                            <QueuedIndicator
                              count={
                                (state?.queue || []).filter(
                                  (item) => item.id === song.id,
                                ).length
                              }
                            />
                          </>
                        }
                        secondaryTypographyProps={{
                          component: 'div',
                          className: 'mm-song-artist-line',
                        }}
                        className={classes.resultText}
                        onClick={() => playSong(song)}
                        data-testid="remote-result-title"
                      />
                      <div
                        className={`${classes.resultActions} mm-remote-result-actions`}
                      >
                        <IconButton
                          size="small"
                          title="Reproducir ahora"
                          onClick={() => playSong(song)}
                          disabled={busy}
                          data-testid="remote-play-now"
                        >
                          <PlayIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                          size="small"
                          title="Sonar la siguiente"
                          onClick={() => queueNextSong(song)}
                          disabled={busy}
                          data-testid="remote-play-next"
                        >
                          <NextIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                          size="small"
                          title="Añadir a la cola"
                          onClick={() => queueSong(song)}
                          disabled={busy}
                          data-testid="remote-queue"
                        >
                          <AddIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                          size="small"
                          title="Borrar de la biblioteca (elimina el archivo)"
                          onClick={() => deleteSong(song)}
                          disabled={busy}
                          data-testid="remote-delete"
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </div>
                    </ListItem>
                  ))}
                </List>
              </>
            )}

            <Typography
              variant="caption"
              color="textSecondary"
              className={classes.hint}
            >
              {translate('remote.audioNote', {
                _: 'El audio suena en el equipo emparejado, nunca en este móvil.',
              })}
            </Typography>

            {error && (
              <Typography className={classes.error}>{error}</Typography>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default RemoteView

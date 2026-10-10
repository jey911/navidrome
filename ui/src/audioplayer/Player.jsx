import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useInterval } from '../common'
import { useDispatch, useSelector } from 'react-redux'
import { useMediaQuery } from '@material-ui/core'
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Typography,
} from '@material-ui/core'
import { ThemeProvider } from '@material-ui/core/styles'
import {
  createMuiTheme,
  useAuthState,
  useDataProvider,
  useTranslate,
} from 'react-admin'
import ReactGA from 'react-ga'
import { GlobalHotKeys } from 'react-hotkeys'
import ReactJkMusicPlayer from 'navidrome-music-player'
import 'navidrome-music-player/assets/index.css'
import useCurrentTheme from '../themes/useCurrentTheme'
import config from '../config'
import useStyle from './styles'
import AudioTitle from './AudioTitle'
import {
  addTracks,
  clearQueue,
  currentPlaying,
  refreshQueue,
  setPlayMode,
  setTranscodingProfile,
  setVolume,
  syncQueue,
} from '../actions'
import PlayerToolbar from './PlayerToolbar'
import {
  announceSession,
  fetchPending,
  leaveSession,
  publishState,
  subscribeRemoteCommands,
} from '../remote/remoteApi'
import {
  createCommandDedupe,
  runDedupedRemoteCommand,
} from '../remote/remoteCommands'
import { sendNotification } from '../utils'
import { fetchContinueTracks } from '../utils/autoDj'
import { clearPreloadedStream, preloadStreamUrl } from '../utils/preloadNext'
import { registerAudioInstance } from './audioBus'
import subsonic from '../subsonic'
import locale from './locale'
import { keyMap } from '../hotkeys'
import keyHandlers from './keyHandlers'
import { calculateGain } from '../utils/calculateReplayGain'
import { detectBrowserProfile, decisionService } from '../transcode'

const Player = () => {
  const theme = useCurrentTheme()
  const translate = useTranslate()
  const playerTheme = theme.player?.theme || 'dark'
  const dataProvider = useDataProvider()
  const playerState = useSelector((state) => state.player)
  const dispatch = useDispatch()
  const [currentTrackId, setCurrentTrackId] = useState(null)
  const [heartbeatTrackId, setHeartbeatTrackId] = useState(null)
  const lastPositionMsRef = useRef(0)
  const currentTrackIdRef = useRef(null)
  const stoppedRef = useRef(false)
  const [audioInstance, setAudioInstance] = useState(null)
  const audioInstanceRef = useRef(null)
  const autodjFetchingRef = useRef(false)
  // Reintentos ante error de red en el tema actual (cortes por buffer).
  const errorRetryRef = useRef({ uuid: null, count: 0 })
  // Control remoto casa: el móvil como mando, el audio sigue aquí.
  const [remote, setRemote] = useState({
    enabled: false,
    sessionId: null,
    code: null,
    showCode: false,
  })
  const remoteRef = useRef(remote)
  remoteRef.current = remote
  const remotePublishAtRef = useRef(0)
  // El servidor puede entregar la misma orden por SSE y por /pending.
  const remoteDedupe = useMemo(() => createCommandDedupe(), [])
  const dataProviderRef = useRef(dataProvider)
  dataProviderRef.current = dataProvider
  // Auto-DJ casa (default ON, persiste en settings): al acabarse la cola,
  // seguir con temas aleatorios en vez de detenerse.
  const autodj = useSelector((state) => state.settings.autodj !== false)
  const autodjRef = useRef(autodj)
  autodjRef.current = autodj
  // La librería del reproductor decide si dibuja la vista de móvil con su
  // propio `mobileMediaQuery` (por defecto `max-width:768px and orientation:
  // portrait`). Ese defecto hace que al girar el iPhone en horizontal salte a
  // la barra de 80px, que es inservible en un móvil. Se le pasa el mismo
  // criterio que se usa aquí para que las dos piezas nunca discrepen.
  const isDesktop = useMediaQuery('(min-width:769px)')
  const isMobilePlayer =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent,
    )

  const { authenticated } = useAuthState()

  // Keep a ref to playerState so the mount effect can read the latest value
  // without re-triggering on every queue/position change
  const playerStateRef = useRef(playerState)
  playerStateRef.current = playerState

  currentTrackIdRef.current = currentTrackId

  useInterval(
    () => {
      if (heartbeatTrackId && !stoppedRef.current) {
        subsonic.reportPlayback(
          heartbeatTrackId,
          lastPositionMsRef.current,
          'playing',
        )
      }
    },
    heartbeatTrackId ? config.playbackReportIntervalMs : null,
  )

  // Detect browser codec profile and eagerly resolve transcode URLs for the
  // persisted queue once on mount (e.g. after a browser refresh)
  useEffect(() => {
    const profile = detectBrowserProfile()
    decisionService.setProfile(profile)
    dispatch(setTranscodingProfile(profile))

    const state = playerStateRef.current
    const currentIdx = state.savedPlayIndex || 0
    const trackIds = state.queue
      .slice(currentIdx, currentIdx + 4)
      .filter((item) => !item.isRadio && item.trackId)
      .map((item) => item.trackId)

    if (trackIds.length === 0) {
      dispatch(refreshQueue())
      return
    }

    Promise.allSettled(
      trackIds.map((id) =>
        decisionService.resolveStreamUrl(id).then((url) => [id, url]),
      ),
    ).then((results) => {
      const resolvedUrls = {}
      results.forEach((r) => {
        if (r.status === 'fulfilled') {
          resolvedUrls[r.value[0]] = r.value[1]
        }
      })
      dispatch(refreshQueue(resolvedUrls))
    })
  }, [dispatch])

  // --- Control remoto: publicar estado (play/pausa/pista/volumen) ---
  const publishRemote = useCallback((overrides = {}, force = false) => {
    const r = remoteRef.current
    if (!r.enabled || !r.sessionId || !r.code) return
    const now = Date.now()
    if (!force && now - remotePublishAtRef.current < 2000) return
    remotePublishAtRef.current = now
    const st = playerStateRef.current
    const song = st.current?.song || {}
    const el = audioInstanceRef.current
    // Posición/duración para la barra de avance del mando (solo si el
    // elemento las conoce; si no, se omiten y el mando oculta la barra).
    const positionMs =
      el && Number.isFinite(el.currentTime)
        ? Math.floor(el.currentTime * 1000)
        : undefined
    const durationMs =
      el && Number.isFinite(el.duration) && el.duration > 0
        ? Math.floor(el.duration * 1000)
        : undefined
    publishState(r.sessionId, r.code, {
      trackId: st.current?.trackId || song.id || '',
      title: song.title || '',
      artist: song.artist || '',
      playing: !!(el && !el.paused),
      volume: typeof el?.volume === 'number' ? el.volume : st.volume,
      positionMs,
      durationMs,
      ...overrides,
    }).catch(() => {})
  }, [])

  // --- Control remoto: ejecutar órdenes del móvil en este reproductor ---
  const executeRemoteCommand = useCallback(
    (cmd) => {
      // Deduplica por id: SSE y /pending pueden entregar la misma orden.
      const handled = runDedupedRemoteCommand(remoteDedupe, cmd, {
        audioInstance: audioInstanceRef.current,
        dataProvider: dataProviderRef.current,
        dispatch,
        getPlayerState: () => playerStateRef.current,
        notify: (overrides) => publishRemote(overrides, true),
      })
      if (handled) {
        publishRemote({}, true)
      }
    },
    [dispatch, publishRemote, remoteDedupe],
  )

  const toggleRemote = useCallback(() => {
    const r = remoteRef.current
    if (r.enabled) {
      if (r.sessionId && r.code) {
        leaveSession(r.sessionId, r.code).catch(() => {})
      }
      setRemote({
        enabled: false,
        sessionId: null,
        code: null,
        showCode: false,
      })
      return
    }
    announceSession('Reproductor web')
      .then(({ sessionId, code }) => {
        setRemote({ enabled: true, sessionId, code, showCode: true })
      })
      .catch(() => {})
  }, [])

  // SSE: órdenes en vivo. Poll de pending como red de seguridad.
  useEffect(() => {
    if (!remote.enabled || !remote.sessionId) return undefined
    const mine = remote.sessionId
    const unsubscribe = subscribeRemoteCommands((data) => {
      if (data && data.sessionId === mine) {
        let payload = null
        try {
          payload = data.payload ? JSON.parse(data.payload) : null
        } catch {
          payload = null
        }
        executeRemoteCommand({ id: data.id, action: data.action, payload })
      }
    })
    const t = setInterval(() => {
      const r = remoteRef.current
      if (!r.enabled || !r.sessionId || !r.code) return
      fetchPending(r.sessionId, r.code)
        .then((cmd) => {
          if (cmd) executeRemoteCommand(cmd)
        })
        .catch(() => {})
    }, 4000)
    return () => {
      unsubscribe()
      clearInterval(t)
    }
  }, [remote.enabled, remote.sessionId, executeRemoteCommand])

  // Pre-fetch transcode decisions for next 2-3 songs when queue or position changes.
  // Además precarga el AUDIO del siguiente tema cuando es stream directo
  // (sin transcodificar): el cambio de canción no espera a la red.
  useEffect(() => {
    if (!playerState.queue.length) {
      clearPreloadedStream()
      return
    }

    const currentIdx = playerState.savedPlayIndex || 0
    const nextSongIds = playerState.queue
      .slice(currentIdx + 1, currentIdx + 4)
      .filter((item) => !item.isRadio)
      .map((item) => item.trackId)

    if (nextSongIds.length > 0) {
      decisionService.prefetchDecisions(nextSongIds)
      const [nextId] = nextSongIds
      decisionService
        .resolveStreamUrl(nextId)
        .then((url) => {
          const cached = decisionService.getCachedDecision(nextId)
          if (cached && !cached.transcodeParams) {
            preloadStreamUrl(url)
          } else {
            clearPreloadedStream()
          }
        })
        .catch(() => {})
    } else {
      clearPreloadedStream()
    }
  }, [playerState.queue, playerState.savedPlayIndex])

  // Auto-DJ: mantener siempre temas por delante. Con la cola precargada,
  // el avance natural del reproductor (y el botón siguiente) funcionan
  // también al darle play a un tema suelto.
  // Laptop sin shuffle (🔀): MISMO género (y si no hay, mismo artista).
  // Mando remoto activo (📱 emparejado): MISMO artista primero y al
  // agotarse MISMO género (la cola manual siempre va antes: el top-up solo
  // rellena cuando quedan <=2 temas por delante). Con shuffle: aleatorios.
  const shuffleMode = playerState.mode === 'shufflePlay'
  // Se desestructura fuera del efecto porque `react-hooks/exhaustive-deps`
  // exige en la lista cada valor usado, no el objeto del que salen. Antes se
  // leía `playerState.x` y eslint pedía el `playerState` entero, que como
  // dependencia lo reejecutaría en cada render.
  const { queue: autodjQueue, current: autodjCurrent } = playerState
  useEffect(() => {
    if (!autodj || !autodjQueue.length) return
    if (autodjCurrent?.isRadio) return
    const idx = autodjQueue.findIndex(
      (item) => item.uuid === autodjCurrent?.uuid,
    )
    const remaining =
      idx >= 0 ? autodjQueue.length - idx - 1 : autodjQueue.length
    if (remaining > 2 || autodjFetchingRef.current) return
    autodjFetchingRef.current = true
    const exclude = autodjQueue.map((item) => item.trackId)
    const song = autodjCurrent?.song
    const preferArtist = remoteRef.current.enabled
    fetchContinueTracks(
      song,
      { shuffle: shuffleMode, preferArtist },
      exclude,
      5,
    )
      .then(({ songs: songData }) => {
        autodjFetchingRef.current = false
        if (Object.keys(songData).length > 0) {
          dispatch(addTracks(songData))
        }
      })
      .catch(() => {
        autodjFetchingRef.current = false
      })
  }, [autodj, shuffleMode, autodjQueue, autodjCurrent, dispatch])

  const visible = authenticated && playerState.queue.length > 0
  const isRadio = playerState.current?.isRadio || false
  const classes = useStyle({
    isRadio,
    visible,
    enableCoverAnimation: config.enableCoverAnimation,
  })
  const showNotifications = useSelector(
    (state) => state.settings.notifications || false,
  )
  const gainInfo = useSelector((state) => state.replayGain)
  const [context, setContext] = useState(null)
  const [gainNode, setGainNode] = useState(null)

  useEffect(() => {
    if (
      context === null &&
      audioInstance &&
      config.enableReplayGain &&
      'AudioContext' in window &&
      (gainInfo.gainMode === 'album' || gainInfo.gainMode === 'track')
    ) {
      const ctx = new AudioContext()
      // we need this to support radios in firefox
      audioInstance.crossOrigin = 'anonymous'
      const source = ctx.createMediaElementSource(audioInstance)
      const gain = ctx.createGain()

      source.connect(gain)
      gain.connect(ctx.destination)

      setContext(ctx)
      setGainNode(gain)
    }
  }, [audioInstance, context, gainInfo.gainMode])

  useEffect(() => {
    if (gainNode) {
      const current = playerState.current || {}
      const song = current.song || {}

      const numericGain = calculateGain(gainInfo, song)
      gainNode.gain.setValueAtTime(numericGain, context.currentTime)
    }
  }, [audioInstance, context, gainNode, playerState, gainInfo])

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (playerState.current?.uuid && audioInstance && !audioInstance.paused) {
        e.preventDefault()
        e.returnValue = ''
      }
    }

    const handlePageHide = () => {
      if (currentTrackIdRef.current && !playerState.current?.isRadio) {
        stoppedRef.current = true
        try {
          subsonic.reportPlaybackKeepalive(
            currentTrackIdRef.current,
            lastPositionMsRef.current,
            'stopped',
          )
        } catch {
          // fetch/sendBeacon may throw; ignore
        }
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    window.addEventListener('pagehide', handlePageHide)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('pagehide', handlePageHide)
    }
  }, [playerState, audioInstance])

  const defaultOptions = useMemo(
    () => ({
      theme: playerTheme,
      bounds: 'body',
      playMode: playerState.mode,
      mode: 'full',
      loadAudioErrorPlayNext: false,
      autoPlayInitLoadPlayList: true,
      clearPriorAudioLists: false,
      showDestroy: true,
      showDownload: false,
      showLyric: true,
      showReload: false,
      toggleMode: !isDesktop,
      glassBg: false,
      showThemeSwitch: false,
      showMediaSession: true,
      restartCurrentOnPrev: true,
      quietUpdate: true,
      // Sin `and (orientation: portrait)`: en horizontal el iPhone mantiene la
      // vista de reproductor a pantalla completa en vez de la barra estrecha.
      mobileMediaQuery: '(max-width: 768px)',
      defaultPosition: {
        top: 300,
        left: 120,
      },
      volumeFade: { fadeIn: 200, fadeOut: 200 },
      renderAudioTitle: (audioInfo, isMobile) => (
        <AudioTitle
          audioInfo={audioInfo}
          gainInfo={gainInfo}
          isMobile={isMobile}
        />
      ),
      locale: locale(translate),
      sortableOptions: { delay: 200, delayOnTouchOnly: true },
    }),
    [gainInfo, isDesktop, playerTheme, translate, playerState.mode],
  )

  const options = useMemo(() => {
    const current = playerState.current || {}
    return {
      ...defaultOptions,
      audioLists: playerState.queue.map((item) => item),
      playIndex: playerState.playIndex,
      autoPlay:
        playerState.queue.length > 0 &&
        playerState.autoPlay !== false &&
        (playerState.clear || playerState.playIndex === 0),
      clearPriorAudioLists: playerState.clear,
      extendsContent: (
        <PlayerToolbar
          id={current.trackId}
          isRadio={current.isRadio}
          remoteEnabled={remote.enabled}
          onToggleRemote={toggleRemote}
        />
      ),
      defaultVolume: isMobilePlayer ? 1 : playerState.volume,
      showMediaSession: !current.isRadio,
    }
  }, [
    playerState,
    defaultOptions,
    isMobilePlayer,
    remote.enabled,
    toggleRemote,
  ])

  const onAudioListsChange = useCallback(
    (_, audioLists, audioInfo) => dispatch(syncQueue(audioInfo, audioLists)),
    [dispatch],
  )

  const onAudioProgress = useCallback((info) => {
    if (info.ended) {
      document.title = 'Navidrome'
    }
    if (!info.isRadio && info.currentTime != null) {
      lastPositionMsRef.current = Math.floor(info.currentTime * 1000)
    }
  }, [])

  const onAudioVolumeChange = useCallback(
    // sqrt to compensate for the logarithmic volume
    (volume) => {
      dispatch(setVolume(Math.sqrt(volume)))
      publishRemote({}, false)
    },
    [dispatch, publishRemote],
  )

  const onAudioPlay = useCallback(
    (info) => {
      if (context && context.state !== 'running') {
        context.resume()
      }

      dispatch(currentPlaying(info))
      if (info.duration) {
        const song = info.song
        document.title = `${song.title} - ${song.artist} - Navidrome`
        if (!info.isRadio) {
          const posMs = Math.floor(info.currentTime * 1000)
          lastPositionMsRef.current = posMs
          const isNewTrack = info.trackId !== currentTrackId
          if (isNewTrack) {
            subsonic
              .reportPlayback(info.trackId, posMs, 'starting')
              .then(() =>
                subsonic.reportPlayback(info.trackId, posMs, 'playing'),
              )
            setCurrentTrackId(info.trackId)
          } else {
            subsonic.reportPlayback(info.trackId, posMs, 'playing')
          }
          setHeartbeatTrackId(info.trackId)
        }
        if (config.gaTrackingId) {
          ReactGA.event({
            category: 'Player',
            action: 'Play song',
            label: `${song.title} - ${song.artist}`,
          })
        }
        if (showNotifications) {
          sendNotification(
            song.title,
            `${song.artist} - ${song.album}`,
            info.cover,
          )
        }
        publishRemote({}, true)
      }
    },
    [context, dispatch, showNotifications, currentTrackId, publishRemote],
  )

  const onAudioPlayTrackChange = useCallback(() => {
    if (currentTrackId) {
      subsonic.reportPlayback(
        currentTrackId,
        lastPositionMsRef.current,
        'stopped',
      )
    }
    setHeartbeatTrackId(null)
    setCurrentTrackId(null)
    errorRetryRef.current = { uuid: null, count: 0 }
  }, [currentTrackId])

  const onAudioPause = useCallback(
    (info) => {
      dispatch(currentPlaying(info))
      if (!info.isRadio && currentTrackId) {
        const posMs = Math.floor(info.currentTime * 1000)
        lastPositionMsRef.current = posMs
        subsonic.reportPlayback(currentTrackId, posMs, 'paused')
      }
      setHeartbeatTrackId(null)
      publishRemote({ playing: false }, true)
    },
    [dispatch, currentTrackId, publishRemote],
  )

  const onAudioEnded = useCallback(
    (currentPlayId, audioLists, info) => {
      if (currentTrackId && !info.isRadio) {
        const posMs = Math.floor((info.duration || 0) * 1000)
        subsonic.reportPlayback(currentTrackId, posMs, 'stopped')
      }
      setHeartbeatTrackId(null)
      setCurrentTrackId(null)
      dispatch(currentPlaying(info))
      dataProvider
        .getOne('keepalive', { id: info.trackId })
        // eslint-disable-next-line no-console
        .catch((e) => console.log('Keepalive error:', e))
      // Red de seguridad Auto-DJ: si terminó el último tema de la cola
      // (p. ej. "siguiente" antes de que el buffer se precargue), trae
      // más del MISMO contexto (mando: artista=>género; laptop: género=>
      // artista; o aleatorios con 🔀) y avanza a mano para no detenerse.
      if (autodjRef.current && !info.isRadio) {
        const st = playerStateRef.current
        const idx = st.queue.findIndex((item) => item.uuid === info.uuid)
        const remaining = idx >= 0 ? st.queue.length - idx - 1 : st.queue.length
        if (idx >= 0 && remaining <= 0 && !autodjFetchingRef.current) {
          autodjFetchingRef.current = true
          const exclude = st.queue.map((item) => item.trackId)
          const endedSong = info.song || st.current?.song
          const shuffle = st.mode === 'shufflePlay'
          const preferArtist = remoteRef.current.enabled
          fetchContinueTracks(endedSong, { shuffle, preferArtist }, exclude, 3)
            .then(({ songs: songData }) => {
              autodjFetchingRef.current = false
              if (Object.keys(songData).length > 0) {
                dispatch(addTracks(songData))
                setTimeout(() => {
                  audioInstanceRef.current?.playNext?.()
                }, 600)
              }
            })
            .catch(() => {
              autodjFetchingRef.current = false
            })
        }
      }
    },
    [dispatch, dataProvider, currentTrackId],
  )

  const onCoverClick = useCallback((mode, audioLists, audioInfo) => {
    if (mode === 'full' && audioInfo?.song?.albumId) {
      window.location.href = `#/album/${audioInfo.song.albumId}/show`
    }
  }, [])

  const onAudioError = useCallback(
    (error, currentPlayId, audioLists, audioInfo) => {
      // Invalidate all cached decisions — token may be stale
      decisionService.invalidateAll()

      // Pre-fetch decisions for upcoming songs with fresh tokens
      const currentIdx = playerState.queue.findIndex(
        (item) => item.uuid === currentPlayId,
      )
      if (currentIdx >= 0) {
        const nextSongIds = playerState.queue
          .slice(currentIdx + 1, currentIdx + 4)
          .filter((item) => !item.isRadio)
          .map((item) => item.trackId)
        if (nextSongIds.length > 0) {
          decisionService.prefetchDecisions(nextSongIds)
        }
      }

      // Buffer inteligente: reintentar el MISMO tema antes de rendirse.
      // Cubre microcortes de red/wifi (misma URL aún válida). Si el token
      // expiró, se re-resuelve la URL fresca. Al tercer fallo se avanza
      // al siguiente en vez de dejar el reproductor muerto.
      const item = playerState.queue[currentIdx]
      const trackId = item?.trackId
      if (!trackId || item?.isRadio) return
      const retry =
        errorRetryRef.current.uuid === currentPlayId
          ? errorRetryRef.current.count + 1
          : 1
      errorRetryRef.current = { uuid: currentPlayId, count: retry }
      const el = audioInstanceRef.current
      if (retry <= 2 && el) {
        setTimeout(() => {
          decisionService
            .resolveStreamUrl(trackId)
            .then((url) => {
              try {
                el.src = url
                el.load()
                const p = el.play()
                if (p && p.catch) {
                  p.catch(() => el.playNext?.())
                }
              } catch {
                el.playNext?.()
              }
            })
            .catch(() => el.playNext?.())
        }, 1200 * retry)
      } else if (el) {
        el.playNext?.()
      }
    },
    [playerState.queue],
  )

  const onBeforeDestroy = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (currentTrackId && !playerStateRef.current?.current?.isRadio) {
        subsonic.reportPlayback(
          currentTrackId,
          lastPositionMsRef.current,
          'stopped',
        )
      }
      setHeartbeatTrackId(null)
      setCurrentTrackId(null)
      dispatch(clearQueue())
      reject()
    })
  }, [dispatch, currentTrackId])

  if (!visible) {
    document.title = 'Navidrome'
  }

  const handlers = useMemo(
    () => keyHandlers(audioInstance, playerState),
    [audioInstance, playerState],
  )

  useEffect(() => {
    if (isMobilePlayer && audioInstance) {
      audioInstance.volume = 1
    }
  }, [isMobilePlayer, audioInstance])

  // Report every seek (including programmatic ones the library does not surface
  // via onAudioSeeked, e.g. restartCurrentOnPrev). Debounce coalesces drag
  // bursts into one report at the final position.
  useEffect(() => {
    if (!audioInstance) return
    let timer = null
    const flush = () => {
      timer = null
      if (
        !currentTrackIdRef.current ||
        playerStateRef.current?.current?.isRadio
      ) {
        return
      }
      const posMs = Math.floor((audioInstance.currentTime || 0) * 1000)
      const state = audioInstance.paused ? 'paused' : 'playing'
      subsonic.reportPlayback(currentTrackIdRef.current, posMs, state)
    }
    const handleSeeked = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(flush, 250)
    }
    audioInstance.addEventListener('seeked', handleSeeked)
    return () => {
      if (timer) clearTimeout(timer)
      audioInstance.removeEventListener('seeked', handleSeeked)
    }
  }, [audioInstance])

  return (
    <ThemeProvider theme={createMuiTheme(theme)}>
      <ReactJkMusicPlayer
        {...options}
        className={classes.player}
        onAudioListsChange={onAudioListsChange}
        onAudioVolumeChange={onAudioVolumeChange}
        onAudioProgress={onAudioProgress}
        onAudioPlay={onAudioPlay}
        onAudioPlayTrackChange={onAudioPlayTrackChange}
        onAudioPause={onAudioPause}
        onPlayModeChange={(mode) => dispatch(setPlayMode(mode))}
        onAudioEnded={onAudioEnded}
        onCoverClick={onCoverClick}
        onAudioError={onAudioError}
        onBeforeDestroy={onBeforeDestroy}
        getAudioInstance={(instance) => {
          audioInstanceRef.current = instance
          registerAudioInstance(instance)
          setAudioInstance(instance)
        }}
      />
      <GlobalHotKeys handlers={handlers} keyMap={keyMap} allowChanges />
      <Dialog
        open={remote.showCode && !!remote.code}
        onClose={() => setRemote((r) => ({ ...r, showCode: false }))}
      >
        <DialogTitle>
          {translate('remote.title', { _: 'Mando móvil activado' })}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {translate('remote.instructions', {
              _: 'En el móvil abre Control remoto y escribe este código:',
            })}
          </DialogContentText>
          <Typography variant="h3" align="center" gutterBottom>
            {remote.code}
          </Typography>
          <DialogContentText>
            {translate('remote.note', {
              _: 'El audio sigue sonando en este equipo.',
            })}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setRemote((r) => ({ ...r, showCode: false }))}
            color="primary"
          >
            {translate('ra.action.close', { _: 'Cerrar' })}
          </Button>
          <Button onClick={toggleRemote} color="secondary">
            {translate('remote.disable', { _: 'Desactivar' })}
          </Button>
        </DialogActions>
      </Dialog>
    </ThemeProvider>
  )
}

export { Player }

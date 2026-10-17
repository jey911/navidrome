import { useCallback, useEffect, useRef } from 'react'
import { addTracks } from '../actions'
import { fetchContinueTracks } from '../utils/autoDj'

// Buffer "radio" del Auto-DJ: mantiene música por delante del tema actual.
// - Modo cola manual (móvil/PWA y equipo emparejado con el mando): aleatorios
//   de TODO el catálogo. Las peticiones manuales se insertan antes (FIFO) y
//   siempre suenan primero; el buffer nunca queda marcado como manual.
// - Escritorio sin mando: conserva la continuación por contexto (género =>
//   artista) o aleatoria con 🔀.
// Si el tema termina sin nada por delante (la red no llegó a tiempo), trae
// más y reanuda: nunca deja el reproductor detenido.
export default function useAutoDjBuffer({
  enabled,
  manualOnly = false,
  playerState,
  dispatch,
  audioInstanceRef,
  preferArtist = false,
}) {
  const fetching = useRef(false)
  const latest = useRef()
  latest.current = { enabled, manualOnly, playerState, preferArtist }

  const requestMore = useCallback(
    (song, count) => {
      const st = latest.current
      if (!st.enabled || fetching.current) return false
      fetching.current = true
      const anchor = st.playerState.queue[0]?.uuid
      const exclude = st.playerState.queue.map((item) => item.trackId)
      const shuffle = st.manualOnly || st.playerState.mode === 'shufflePlay'
      fetchContinueTracks(
        song,
        { shuffle, preferArtist: st.manualOnly ? false : st.preferArtist },
        exclude,
        count,
      )
        .then(({ songs: songData }) => {
          fetching.current = false
          if (
            latest.current.enabled &&
            latest.current.playerState.queue[0]?.uuid === anchor &&
            Object.keys(songData).length > 0
          ) {
            dispatch(addTracks(songData, undefined, { automatic: true }))
            setTimeout(() => {
              const active = audioInstanceRef.current
              // Una petición manual u otro tema pudieron empezar mientras
              // llegaba la respuesta: solo reanuda si sigue detenido en el
              // mismo contexto.
              if (
                active?.ended &&
                latest.current.playerState.queue[0]?.uuid === anchor
              )
                active.playNext?.()
            }, 600)
          }
        })
        .catch(() => {
          fetching.current = false
        })
      return true
    },
    [dispatch, audioInstanceRef],
  )

  const { queue, current, mode } = playerState
  useEffect(() => {
    if (!enabled || !queue.length) return
    if (current?.isRadio) return
    const idx = queue.findIndex((item) => item.uuid === current?.uuid)
    const remaining = idx >= 0 ? queue.length - idx - 1 : queue.length
    if (remaining > 2) return
    requestMore(current?.song, 5)
  }, [enabled, queue, current, mode, requestMore])

  // Red de seguridad para el fin natural: si terminó el último tema de la cola
  // (el buffer no llegó a tiempo), trae aleatorios y avanza a mano.
  const handleEnded = useCallback(
    (info) => {
      const st = latest.current
      if (!st.enabled || !info || info.isRadio) return
      const state = st.playerState
      const idx = state.queue.findIndex((item) => item.uuid === info.uuid)
      const remaining =
        idx >= 0 ? state.queue.length - idx - 1 : state.queue.length
      if (idx >= 0 && remaining <= 0) {
        requestMore(info.song || state.current?.song, 3)
      }
    },
    [requestMore],
  )

  return { handleEnded }
}

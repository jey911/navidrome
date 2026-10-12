import {
  addTracks,
  playNext,
  manualQueue,
  removeTrack,
  setTrack,
} from '../actions'

// Serialize async song lookups so quick remote requests retain their order.
export const createRemoteTaskQueue = () => {
  let pending = Promise.resolve()
  return (task) => {
    const result = pending.then(task)
    pending = result.catch(() => {})
    return result
  }
}

// El servidor asigna un id único a cada orden, pero puede llegar por dos
// vías (SSE en vivo y GET /pending como red de seguridad). Este registro
// acotado evita ejecutar la misma orden dos veces. Las órdenes sin id
// (eventos legados) se aceptan siempre.
export const createCommandDedupe = (limit = 100) => {
  const seen = new Set()
  return {
    accept(id) {
      if (!id) return true
      if (seen.has(id)) return false
      seen.add(id)
      if (seen.size > limit) {
        seen.delete(seen.values().next().value)
      }
      return true
    },
    get size() {
      return seen.size
    },
  }
}

// Ejecuta una orden una sola vez: descarta duplicados por id antes de
// tocar el reproductor. Órdenes sin id (legadas) se ejecutan siempre.
export const runDedupedRemoteCommand = (dedupe, cmd, deps) => {
  if (!cmd) return false
  if (!dedupe.accept(cmd.id)) return false
  return runRemoteCommand(cmd, deps)
}

// El móvil solo MANDA identificadores; el laptop resuelve y reproduce.
// Aceptamos varias formas de payload para no romper si el emisor cambia.
export const resolvePlayTrackId = (payload) => {
  if (!payload || typeof payload !== 'object') return null
  const id = payload.id || payload.songId || payload.trackId
  return typeof id === 'string' && id.length > 0 ? id : null
}

// Contexto de reproducción del mando: la lista de resultados donde el
// usuario eligió el tema. Con contexto, el laptop encola TODA la lista y
// empieza en el elegido: siguiente/anterior se mueven dentro de los
// resultados y el Auto-DJ solo entra al acabarlos. Sin contexto (mando
// viejo) se conserva el tema suelto de antes.
export const resolveContextIds = (payload) => {
  if (!payload || typeof payload !== 'object') return []
  const raw = payload.contextIds || payload.queueIds || payload.ids
  if (!Array.isArray(raw)) return []
  const seen = new Set()
  const ids = []
  for (const id of raw) {
    if (typeof id === 'string' && id.length > 0 && !seen.has(id)) {
      seen.add(id)
      ids.push(id)
    }
  }
  return ids
}

// Navidrome y Emepetre montan la misma música en /music dentro de sus
// contenedores: la ruta absoluta del song se relativiza para pedir el
// borrado a Emepetre (que sí escribe; Navidrome monta :ro).
export const MUSIC_DIR_PREFIX = '/music/'

export const toRelativeMusicPath = (absPath) => {
  if (typeof absPath !== 'string' || !absPath.startsWith(MUSIC_DIR_PREFIX)) {
    return null
  }
  const rel = absPath.slice(MUSIC_DIR_PREFIX.length)
  if (!rel || rel.startsWith('/') || rel.includes('..')) return null
  return rel
}

// Borra un archivo vía Emepetre en el MISMO origen (/downloader).
// Exige la sesión del Downloader en este navegador + cabecera XHR.
// En errores HTTP intenta rescatar el detalle del servidor para mostrarlo.
export const deleteTrackFromServer = async (songId) => {
  const token = localStorage.getItem('token')
  const res = await fetch('/api/library/delete-song', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ songId }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const error = new Error(
      body.detail || `Borrado fallido (HTTP ${res.status}).`,
    )
    error.status = res.status
    error.detail = body.detail
    throw error
  }
  return body
}

// Ejecuta una orden del mando móvil sobre el reproductor local.
// Devuelve true si la acción era conocida y se aplicó (aunque falle async).
// NUNCA reproduce en el móvil: esta función corre en el equipo emparejado.
// playTrack reproduce solo el tema elegido y conserva peticiones manuales; playNextTrack inserta
// justo después del tema actual; queueTrack mantiene las peticiones manuales en FIFO. La cola manual
// siempre suena antes que el relleno automático (artista=>género).
// deleteTrack borra el ARCHIVO de la biblioteca vía Emepetre (irreversible;
// el mando pide confirmación): si era el tema actual avanza al siguiente,
// si era un tema futuro lo quita de la cola, y avisa al mando con `notify`.
export const runRemoteCommand = (
  cmd,
  {
    audioInstance,
    dataProvider,
    dispatch,
    getPlayerState,
    notify,
    enqueue = (task) => task(),
  } = {},
) => {
  if (!cmd || !cmd.action) return false
  const el = audioInstance
  if (!el) return false
  const payload = cmd.payload || {}
  const queueSingleTrack = (action) => {
    const id = resolvePlayTrackId(payload)
    if (id && dataProvider && dispatch) {
      enqueue(() =>
        dataProvider
          .getOne('song', { id })
          .then(({ data }) => {
            dispatch(manualQueue())
            dispatch(action({ [data.id || id]: data }))
          })
          .catch(() => {}),
      )
      return true
    }
    return false
  }
  switch (cmd.action) {
    case 'play':
      el.play?.()
      break
    case 'pause':
      el.pause?.()
      break
    case 'toggle':
      el.togglePlay?.()
      break
    case 'next':
      el.playNext?.()
      break
    case 'prev':
      el.playPrev?.()
      break
    case 'volume': {
      const cur = typeof el.volume === 'number' ? el.volume : 0.5
      const level =
        typeof payload.level === 'number'
          ? payload.level
          : cur + (payload.delta || 0)
      el.volume = Math.min(1, Math.max(0, level))
      break
    }
    case 'seek':
      if (typeof payload.seconds === 'number' && el.currentTime != null) {
        el.currentTime = Math.max(0, payload.seconds)
      }
      break
    case 'playTrack': {
      const id = resolvePlayTrackId(payload)
      if (!id || !dataProvider || !dispatch) return false
      enqueue(() =>
        dataProvider
          .getOne('song', { id })
          .then(({ data }) => {
            dispatch(manualQueue())
            dispatch(setTrack(data))
          })
          .catch(() => {}),
      )
      break
    }
    case 'playNextTrack': {
      if (!queueSingleTrack(playNext)) return false
      break
    }
    case 'queueTrack': {
      if (!queueSingleTrack(addTracks)) return false
      break
    }
    case 'deleteTrack': {
      const id = resolvePlayTrackId(payload)
      if (!id || !dispatch) return false
      enqueue(() =>
        deleteTrackFromServer(id)
          .then((res) => {
            if (!res.deleted?.includes(id))
              throw new Error('El servidor no confirmó el borrado.')
            const state = getPlayerState?.() || {}
            if (state.current?.trackId === id) {
              const index =
                state.queue?.findIndex(
                  (item) => item.uuid === state.current.uuid,
                ) ?? -1
              if (index >= 0 && index < state.queue.length - 1) el.playNext?.()
              else el.pause?.()
            }
            dispatch(removeTrack(id))
            notify?.({ notice: 'Canción eliminada del disco del servidor.' })
          })
          .catch((error) =>
            notify?.({
              notice:
                error.detail ||
                error.message ||
                'No se pudo borrar la canción.',
            }),
          ),
      )
      break
    }

    default:
      return false
  }
  return true
}

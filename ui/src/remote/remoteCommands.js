import {
  addTracks,
  playNext,
  playTracks,
  removeTrack,
  setTrack,
} from '../actions'

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
export const deleteTrackViaEmepetre = async (relPath) => {
  const res = await fetch('/downloader/api/library/delete', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: JSON.stringify({ paths: [relPath] }),
  })
  if (res.status === 401) {
    const err = new Error('unauthorized')
    err.status = 401
    throw err
  }
  if (!res.ok) {
    const err = new Error(`delete ${res.status}`)
    err.status = res.status
    try {
      const body = await res.json()
      const detail = body?.detail
      err.detail = Array.isArray(detail)
        ? detail.map((d) => d?.msg || JSON.stringify(d)).join('; ')
        : typeof detail === 'string'
          ? detail
          : undefined
    } catch {
      // respuesta no JSON (p. ej. proxy): quedarse con el status
    }
    throw err
  }
  return res.json()
}

// Ejecuta una orden del mando móvil sobre el reproductor local.
// Devuelve true si la acción era conocida y se aplicó (aunque falle async).
// NUNCA reproduce en el móvil: esta función corre en el equipo emparejado.
// playTrack reemplaza la cola (reproducir ahora); playNextTrack inserta
// justo después del tema actual; queueTrack añade al final. La cola manual
// siempre suena antes que el relleno automático (artista=>género).
// deleteTrack borra el ARCHIVO de la biblioteca vía Emepetre (irreversible;
// el mando pide confirmación): si era el tema actual avanza al siguiente,
// si era un tema futuro lo quita de la cola, y avisa al mando con `notify`.
export const runRemoteCommand = (
  cmd,
  { audioInstance, dataProvider, dispatch, getPlayerState, notify } = {},
) => {
  if (!cmd || !cmd.action) return false
  const el = audioInstance
  if (!el) return false
  const payload = cmd.payload || {}
  const queueSingleTrack = (action) => {
    const id = resolvePlayTrackId(payload)
    if (id && dataProvider && dispatch) {
      dataProvider
        .getOne('song', { id })
        .then(({ data }) => dispatch(action({ [data.id || id]: data })))
        .catch(() => {})
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
      const contextIds = resolveContextIds(payload)
      if (contextIds.length > 1) {
        // Con contexto: encolar la lista de resultados y empezar en el
        // elegido (respetando su orden). Siguiente/anterior quedan dentro.
        const ordered = contextIds.includes(id)
          ? contextIds
          : [id, ...contextIds]
        dataProvider
          .getMany('song', { ids: ordered })
          .then(({ data: records }) => {
            const byId = {}
            for (const r of records || []) {
              if (r?.id) byId[r.id] = r
            }
            const present = ordered.filter((cid) => byId[cid])
            if (present.length === 0) return
            const map = {}
            present.forEach((cid) => {
              map[cid] = byId[cid]
            })
            dispatch(playTracks(map, present, byId[id] ? id : present[0]))
          })
          .catch(() => {})
      } else {
        dataProvider
          .getOne('song', { id })
          .then(({ data }) => dispatch(setTrack(data)))
          .catch(() => {})
      }
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
      if (!id || !dataProvider || !dispatch) return false
      dataProvider
        .getOne('song', { id })
        .then(({ data }) => {
          const rel = toRelativeMusicPath(data?.path)
          if (!rel) {
            throw Object.assign(new Error('Ruta fuera de /music.'), {
              code: 'norel',
            })
          }
          return deleteTrackViaEmepetre(rel).then((res) => ({ res, rel, data }))
        })
        .then(({ res, rel, data }) => {
          const trackId = data?.id || id
          const title = data?.title || rel
          if (res?.deleted?.includes(rel)) {
            const st = getPlayerState?.() || {}
            const queue = st.queue || []
            const current = st.current || {}
            const currentIdx = queue.findIndex(
              (item) => item.uuid === current.uuid,
            )
            const delIdx = queue.findIndex((item) => item.trackId === trackId)
            if (delIdx === currentIdx || current.trackId === trackId) {
              el.playNext?.()
            } else if (delIdx > currentIdx) {
              dispatch(removeTrack(trackId))
            }
            notify?.({ notice: `Borrada de la biblioteca: ${title}` })
          } else {
            const detail = res?.errors?.[0]?.error || 'no se pudo borrar'
            notify?.({ notice: `No se borró ${title}: ${detail}` })
          }
        })
        .catch((e) => {
          if (e?.status === 401) {
            notify?.({
              notice:
                'Para borrar, abre el Downloader en el laptop e inicia sesión primero.',
            })
          } else if (e?.code === 'norel') {
            notify?.({
              notice: 'Esa canción no está bajo /music: no se puede borrar.',
            })
          } else if (e?.status || e?.detail) {
            const cause = e.detail || `HTTP ${e.status}`
            notify?.({ notice: `Borrado fallido (${cause}).` })
          } else {
            notify?.({
              notice: `Borrado fallido: ${e?.message || 'sin conexión con el laptop'}.`,
            })
          }
        })
      break
    }
    default:
      return false
  }
  return true
}

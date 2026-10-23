import { useCallback, useEffect, useRef } from 'react'

// Crossfade "de verdad": la librería del reproductor solo tiene un <audio> y
// no solapa temas. Cuando faltan unos segundos, clonamos el final del tema
// actual en un elemento aparte, avanzamos la librería al siguiente y vamos
// bajando el volumen del clon. El tema nuevo empieza a sonar mientras la cola
// del anterior aún se está apagando.
export const CROSSFADE_SECONDS = 4

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

const isAppleMobile = () => {
  if (typeof navigator === 'undefined') return false
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

// Elige el mismo siguiente que elegiría la librería al terminar, para que el
// crossfade no altere el orden, el bucle ni el aleatorio.
export const pickCrossfadeTarget = ({
  queue = [],
  currentUuid,
  playMode,
} = {}) => {
  const currentIndex = queue.findIndex((item) => item.uuid === currentUuid)
  if (currentIndex < 0 || queue.length < 2) return null
  // En singleLoop la librería reinicia el mismo tema: no hay crossfade.
  if (playMode === 'singleLoop') return null

  let nextIndex = -1
  if (playMode === 'shufflePlay') {
    nextIndex = Math.floor(Math.random() * queue.length)
    if (nextIndex === currentIndex) {
      // Igual que la librería: si sale el actual, pasa al siguiente índice.
      nextIndex =
        (currentIndex + 1 + Math.floor(Math.random() * (queue.length - 1))) %
        queue.length
    }
  } else if (currentIndex + 1 < queue.length) {
    nextIndex = currentIndex + 1
  } else if (playMode === 'orderLoop') {
    nextIndex = 0
  }

  if (nextIndex < 0 || nextIndex === currentIndex) return null
  const item = queue[nextIndex]
  // Las radios no tienen final ni se pueden clonar con sentido.
  if (!item || item.isRadio) return null
  return { index: nextIndex, item }
}

export default function useCrossfade({
  enabled,
  playerState,
  playMode,
  audioInstanceRef,
  gainFactor = 1,
  maxSeconds = CROSSFADE_SECONDS,
}) {
  const activeRef = useRef(null)
  const contextRef = useRef(null)
  const lastFadeRef = useRef({ uuid: null })
  const latestRef = useRef({})
  latestRef.current = {
    enabled,
    playerState,
    playMode,
    gainFactor,
    maxSeconds,
  }

  const finish = useCallback((active) => {
    if (!active || active.finished) return
    active.finished = true
    if (active.timer) {
      clearTimeout(active.timer)
      active.timer = null
    }
    if (active.pauseTimer) {
      clearTimeout(active.pauseTimer)
      active.pauseTimer = null
    }
    try {
      active.clone.pause()
    } catch {
      // El elemento pudo quedar sin fuente.
    }
    try {
      active.clone.removeAttribute('src')
      active.clone.load()
    } catch {
      // Best effort.
    }
    try {
      active.source?.disconnect()
    } catch {
      // Best effort.
    }
    try {
      active.gain?.disconnect()
    } catch {
      // Best effort.
    }
    if (activeRef.current === active) activeRef.current = null
  }, [])

  const stop = useCallback(() => {
    if (activeRef.current) finish(activeRef.current)
  }, [finish])

  const ensureContext = useCallback(() => {
    if (typeof window === 'undefined') return null
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (!AudioContextClass) return null
    let context = contextRef.current
    if (!context || context.state === 'closed') {
      try {
        context = new AudioContextClass()
        contextRef.current = context
      } catch {
        return null
      }
    }
    if (context.state === 'suspended') {
      try {
        const resumed = context.resume()
        if (resumed && resumed.catch) resumed.catch(() => {})
      } catch {
        // Si no puede reanudarse, el crossfade usará volume como fallback.
      }
    }
    return context
  }, [])

  // iOS solo permite crear/reanudar el AudioContext dentro de un gesto. Se
  // prepara en el primer toque de la app (antes de que el usuario pulse play),
  // para que el clon pueda atenuarse cuando llegue el final del tema.
  useEffect(() => {
    if (!enabled) return undefined
    const unlock = () => {
      ensureContext()
    }
    window.addEventListener('pointerdown', unlock, { capture: true })
    window.addEventListener('touchstart', unlock, { capture: true })
    return () => {
      window.removeEventListener('pointerdown', unlock, true)
      window.removeEventListener('touchstart', unlock, true)
    }
  }, [enabled, ensureContext])

  // El contexto se crea en el primer play (dentro/reciente a un gesto del
  // usuario). En iOS esto es importante para que luego pueda sonar el clon.
  const onPlay = useCallback(
    (info) => {
      if (!latestRef.current.enabled) return
      ensureContext()
      const active = activeRef.current
      if (!active) return
      if (active.pauseTimer) {
        clearTimeout(active.pauseTimer)
        active.pauseTimer = null
      }
      // Si sonó otro tema distinto del que estamos solapando, fue una acción
      // del usuario (siguiente/anterior/elegir canción): corta el clon.
      if (info?.uuid !== active.toUuid) stop()
    },
    [ensureContext, stop],
  )

  const onPause = useCallback(() => {
    const active = activeRef.current
    if (!active) return
    // Al cambiar de tema la librería hace load() y puede emitir pause. Damos
    // un margen corto para que el onPlay del tema nuevo cancele la parada.
    if (active.pauseTimer) clearTimeout(active.pauseTimer)
    active.pauseTimer = setTimeout(() => {
      if (activeRef.current === active) stop()
    }, 350)
  }, [stop])

  const onEnded = useCallback(() => stop(), [stop])
  const onError = useCallback(() => stop(), [stop])

  const onProgress = useCallback(
    (info) => {
      const {
        enabled: isEnabled,
        playerState: state,
        playMode: mode,
        gainFactor: factor,
        maxSeconds: max,
      } = latestRef.current
      if (!isEnabled || !info || info.isRadio || info.paused || info.ended) {
        return
      }
      if (activeRef.current) return

      const duration = Number(info.duration)
      const currentTime = Number(info.currentTime)
      if (
        !Number.isFinite(duration) ||
        !Number.isFinite(currentTime) ||
        duration <= 0 ||
        currentTime < 0
      ) {
        return
      }

      const remaining = duration - currentTime
      if (remaining <= 0.15) return
      const seconds = Math.min(max, Math.max(0.6, duration * 0.25))
      if (remaining > seconds) {
        // Si el usuario retrocedió, permite un nuevo crossfade al llegar otra
        // vez al final del mismo tema.
        if (
          lastFadeRef.current.uuid === info.uuid &&
          currentTime < duration - seconds - 1
        ) {
          lastFadeRef.current = { uuid: null }
        }
        return
      }
      if (lastFadeRef.current.uuid === info.uuid) {
        if (currentTime < duration - seconds - 1) {
          lastFadeRef.current = { uuid: null }
        } else {
          return
        }
      }

      const audio = audioInstanceRef.current
      if (!audio || audio.paused || typeof audio.playByIndex !== 'function') {
        return
      }
      const target = pickCrossfadeTarget({
        queue: state.queue || [],
        currentUuid: info.uuid,
        playMode: mode,
      })
      if (!target) return

      const src = audio.currentSrc || audio.src
      if (!src) return

      const fadeSeconds = Math.max(0.2, Math.min(seconds, remaining))
      const volume = Number(audio.volume)
      const replayGain = Number.isFinite(factor) && factor > 0 ? factor : 1
      const initialGain = clamp(
        (Number.isFinite(volume) ? volume : 1) * replayGain,
        0,
        8,
      )

      const clone = new Audio()
      clone.preload = 'auto'
      try {
        // #t= hace que el clon empiece directamente en la posición actual, sin
        // depender de que loadedmetadata llegue antes de play().
        const url = new URL(src, window.location.href)
        url.hash = `t=${currentTime.toFixed(3)}`
        clone.src = url.href
      } catch {
        clone.src = src
        try {
          clone.currentTime = currentTime
        } catch {
          // Si aún no hay metadata, el clon empezará desde el principio; es
          // solo el final del tema anterior y se apaga en fadeSeconds.
        }
      }
      clone.volume = 1

      const context = ensureContext()
      let source = null
      let gainNode = null
      let usingWebAudio = false
      // En iOS el volumen de <audio> es de solo lectura; Web Audio sí permite
      // hacer el fade. Si el contexto no está corriendo, usamos volume.
      if (context && context.state === 'running') {
        try {
          source = context.createMediaElementSource(clone)
          gainNode = context.createGain()
          gainNode.gain.setValueAtTime(initialGain, context.currentTime)
          source.connect(gainNode)
          gainNode.connect(context.destination)
          usingWebAudio = true
        } catch {
          try {
            source?.disconnect()
          } catch {
            // Best effort.
          }
          try {
            gainNode?.disconnect()
          } catch {
            // Best effort.
          }
          source = null
          gainNode = null
        }
      }
      // En iOS el volumen de <audio> no se puede bajar por código. Si Web
      // Audio no está disponible, es mejor no solapar (el tema nuevo entra
      // igual, como antes) que reproducir el clon a todo volumen.
      if (!usingWebAudio && isAppleMobile()) return
      if (!usingWebAudio) clone.volume = Math.min(1, initialGain)

      const active = {
        clone,
        source,
        gain: gainNode,
        context,
        usingWebAudio,
        seconds: fadeSeconds,
        fromUuid: info.uuid,
        toUuid: target.item.uuid,
        timer: null,
        pauseTimer: null,
      }
      activeRef.current = active
      lastFadeRef.current = { uuid: info.uuid }

      const playPromise = clone.play()
      if (playPromise && playPromise.catch) {
        playPromise.catch(() => {
          if (activeRef.current === active) finish(active)
        })
      }

      let switched
      try {
        switched = audio.playByIndex(target.index)
      } catch {
        lastFadeRef.current = { uuid: null }
        finish(active)
        return
      }
      if (switched === false) {
        // La lista de la librería todavía no incluye el tema siguiente (por
        // ejemplo, el append del Auto-DJ aún no llegó). Sin cambio real de
        // pista: se corta el crossfade en vez de dejar el clon sonando.
        lastFadeRef.current = { uuid: null }
        finish(active)
        return
      }

      if (usingWebAudio && gainNode && context) {
        const now = context.currentTime
        gainNode.gain.cancelScheduledValues(now)
        gainNode.gain.setValueAtTime(initialGain, now)
        gainNode.gain.linearRampToValueAtTime(0, now + fadeSeconds)
        active.timer = setTimeout(
          () => {
            if (activeRef.current === active) finish(active)
          },
          fadeSeconds * 1000 + 120,
        )
      } else {
        const startedAt = Date.now()
        active.timer = setInterval(() => {
          if (activeRef.current !== active) return
          const progress = Math.min(
            1,
            (Date.now() - startedAt) / (fadeSeconds * 1000),
          )
          clone.volume = Math.max(0, initialGain * (1 - progress))
          if (progress >= 1) finish(active)
        }, 50)
      }
    },
    [audioInstanceRef, ensureContext, finish],
  )

  useEffect(() => {
    if (!enabled) stop()
  }, [enabled, stop])

  useEffect(
    () => () => {
      stop()
      const context = contextRef.current
      contextRef.current = null
      if (context && context.state !== 'closed') {
        try {
          const closed = context.close()
          if (closed && closed.catch) closed.catch(() => {})
        } catch {
          // Best effort.
        }
      }
    },
    [stop],
  )

  return { onPlay, onPause, onEnded, onError, onProgress, stop }
}

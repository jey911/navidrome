// Buffer inteligente casa: precarga del siguiente tema en un <audio>
// oculto para que el cambio de canción no empiece de cero.
//
// Solo se precarga cuando el stream es DIRECTO (sin transcodificación):
// un transcodificado es un pipe vivo de ffmpeg y precargarlo quemaría
// CPU y podría chocar con el límite de transcodificaciones. El llamante
// decide con decisionService.getCachedDecision(id)?.transcodeParams.
let preloadedUrl = null
let preloadedAudio = null

const audioCtor = () => (typeof Audio !== 'undefined' ? Audio : null)

export const preloadStreamUrl = (url) => {
  if (!url || url === preloadedUrl) return
  const Ctor = audioCtor()
  if (!Ctor) return
  clearPreloadedStream()
  try {
    const audio = new Ctor()
    audio.preload = 'auto'
    audio.src = url
    audio.load()
    preloadedUrl = url
    preloadedAudio = audio
  } catch {
    // Nunca romper la reproducción por la precarga
  }
}

export const clearPreloadedStream = () => {
  try {
    preloadedAudio?.removeAttribute('src')
    preloadedAudio?.load()
  } catch {
    // ignore
  }
  preloadedAudio = null
  preloadedUrl = null
}

export const currentPreloadedUrl = () => preloadedUrl

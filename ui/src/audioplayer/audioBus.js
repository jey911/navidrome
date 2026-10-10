// Bus local de la instancia de audio: Player.jsx registra aquí el elemento
// real de reproducción y vistas como Inicio pueden controlarlo
// (play/pausa/siguiente/anterior/volumen/progreso) sin prop-drilling.
let instance = null

export const registerAudioInstance = (el) => {
  instance = el
}

export const getAudioInstance = () => instance

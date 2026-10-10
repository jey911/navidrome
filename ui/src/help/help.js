import config from '../config'

// La bienvenida se muestra una vez por versión. Si cambia la versión
// (tras un despliegue), vuelve a aparecer con las novedades.
export const WELCOME_KEY = 'help.welcomeVersion'

export const readWelcomeDismissed = () => {
  try {
    return localStorage.getItem(WELCOME_KEY) === String(config.version)
  } catch {
    // Sin localStorage no se puede recordar: mejor no molestar en bucle.
    return true
  }
}

export const dismissWelcome = () => {
  try {
    localStorage.setItem(WELCOME_KEY, String(config.version))
  } catch {
    // ignore
  }
}

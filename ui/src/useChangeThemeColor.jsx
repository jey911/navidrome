import { useEffect } from 'react'
import useCurrentTheme from './themes/useCurrentTheme'

// Colores de la barra de estado del navegador. El tema "Mi Música"
// (mm-theme.css) se aplica siempre y pinta un fondo navy en oscuro y casi
// blanco en claro, así que se usan esos en lugar de `palette.background`, que
// en el tema oscuro de MUI es un gris que el tema custom tapa y que se
// vería como una franja más clara en la parte de arriba.
const CHROME = { dark: '#07101b', light: '#fafafa' }

const useChangeThemeColor = () => {
  const theme = useCurrentTheme()
  const color =
    CHROME[theme.palette?.type] ||
    theme.palette?.background?.default ||
    '#ffffff'
  useEffect(() => {
    // index.html declara una etiqueta por cada `prefers-color-scheme`, así que
    // hay que actualizarlas todas: si solo se toca la primera, el sistema claro
    // se queda con el color inicial.
    document
      .querySelectorAll("meta[name='theme-color']")
      .forEach((meta) => meta.setAttribute('content', color))
  }, [color])
}

export default useChangeThemeColor

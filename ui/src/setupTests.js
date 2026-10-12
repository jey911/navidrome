// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom'

const localStorageMock = (function () {
  let store = {}

  return {
    getItem: function (key) {
      return store[key] || null
    },
    setItem: function (key, value) {
      store[key] = value.toString()
    },
    clear: function () {
      store = {}
    },
  }
})()

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
})

localStorage.setItem('username', 'admin')

// jsdom no implementa matchMedia, así que useMediaQuery devolvería siempre
// false y ninguna prueba podría ejercitar la variante de móvil. Este mock
// resuelve `false` por defecto (escritorio) y las pruebas pueden activarlo con
// `setViewport({ phone: true })`.
let phoneViewport = false

window.matchMedia = (query) => ({
  media: query,
  matches: query.includes('max-width') ? phoneViewport : !phoneViewport,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
})

export const setViewport = ({ phone = false } = {}) => {
  phoneViewport = phone
}

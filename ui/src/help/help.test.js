import { describe, it, expect, vi, afterEach } from 'vitest'
import config from '../config'
import { WELCOME_KEY, dismissWelcome, readWelcomeDismissed } from './help'

describe('help welcome persistence', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
  })

  it('no está descartada la primera vez', () => {
    expect(readWelcomeDismissed()).toBe(false)
  })

  it('recuerda el descarte para la versión actual', () => {
    dismissWelcome()
    expect(window.localStorage.getItem(WELCOME_KEY)).toBe(
      String(config.version),
    )
    expect(readWelcomeDismissed()).toBe(true)
  })

  it('vuelve a mostrar la bienvenida si cambia la versión', () => {
    window.localStorage.setItem(WELCOME_KEY, 'old-version')
    expect(readWelcomeDismissed()).toBe(false)
  })

  it('no molesta si localStorage no está disponible', () => {
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readWelcomeDismissed()).toBe(true)
  })
})

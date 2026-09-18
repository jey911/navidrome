import { settingsReducer } from './settingsReducer'
import { setAutodjState, setNotificationsState } from '../actions/settings'

describe('settingsReducer', () => {
  it('activa Auto-DJ por defecto', () => {
    const state = settingsReducer(undefined, { type: '@@INIT' })
    expect(state.autodj).toBe(true)
  })

  it('conmuta Auto-DJ', () => {
    const off = settingsReducer(undefined, setAutodjState(false))
    expect(off.autodj).toBe(false)
    const on = settingsReducer(off, setAutodjState(true))
    expect(on.autodj).toBe(true)
  })

  it('no toca el resto al conmutar', () => {
    const state = settingsReducer(undefined, setAutodjState(false))
    expect(state.notifications).toBe(false)
    const back = settingsReducer(state, setNotificationsState(true))
    expect(back.notifications).toBe(true)
    expect(back.autodj).toBe(false)
  })
})

import { shouldBootstrapPwaAutoDj } from './pwaAutoDj'

const base = {
  bootstrapped: false,
  isDesktop: false,
  isMobilePlayer: false,
  isRadio: false,
}

describe('shouldBootstrapPwaAutoDj', () => {
  it('activa el Auto-DJ en el primer tema de la PWA/móvil', () => {
    expect(shouldBootstrapPwaAutoDj(base)).toBe(true)
  })

  it('también en el reproductor móvil abierto desde escritorio', () => {
    expect(
      shouldBootstrapPwaAutoDj({
        ...base,
        isDesktop: true,
        isMobilePlayer: true,
      }),
    ).toBe(true)
  })

  it('no lo activa en escritorio normal', () => {
    expect(shouldBootstrapPwaAutoDj({ ...base, isDesktop: true })).toBe(false)
  })

  it('no lo activa en radio ni si ya se hizo en esta sesión', () => {
    expect(shouldBootstrapPwaAutoDj({ ...base, isRadio: true })).toBe(false)
    expect(shouldBootstrapPwaAutoDj({ ...base, bootstrapped: true })).toBe(
      false,
    )
  })
})

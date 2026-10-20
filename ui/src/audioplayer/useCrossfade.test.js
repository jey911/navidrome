import { pickCrossfadeTarget } from './useCrossfade'

const song = (uuid, extra = {}) => ({ uuid, trackId: uuid, ...extra })

describe('pickCrossfadeTarget', () => {
  const queue = [song('a'), song('b'), song('c')]

  it('elige el siguiente en orden', () => {
    expect(pickCrossfadeTarget({ queue, currentUuid: 'a', playMode: 'order' }))
      .toEqual({ index: 1, item: queue[1] })
  })

  it('no cruza el final en orden sin bucle', () => {
    expect(
      pickCrossfadeTarget({ queue, currentUuid: 'c', playMode: 'order' }),
    ).toBeNull()
  })

  it('vuelve al principio en orderLoop', () => {
    expect(
      pickCrossfadeTarget({ queue, currentUuid: 'c', playMode: 'orderLoop' }),
    ).toEqual({ index: 0, item: queue[0] })
  })

  it('elige otro tema en shufflePlay', () => {
    for (let i = 0; i < 50; i += 1) {
      const target = pickCrossfadeTarget({
        queue,
        currentUuid: 'b',
        playMode: 'shufflePlay',
      })
      expect(target).not.toBeNull()
      expect(target.index).not.toBe(1)
    }
  })

  it('no hace crossfade con singleLoop', () => {
    expect(
      pickCrossfadeTarget({ queue, currentUuid: 'a', playMode: 'singleLoop' }),
    ).toBeNull()
  })

  it('no hace crossfade hacia una radio', () => {
    const withRadio = [song('a'), song('r', { isRadio: true })]
    expect(
      pickCrossfadeTarget({
        queue: withRadio,
        currentUuid: 'a',
        playMode: 'order',
      }),
    ).toBeNull()
  })

  it('devuelve null si no encuentra el tema actual o no hay cola', () => {
    expect(
      pickCrossfadeTarget({ queue, currentUuid: 'zzz', playMode: 'order' }),
    ).toBeNull()
    expect(
      pickCrossfadeTarget({ queue: [song('a')], currentUuid: 'a' }),
    ).toBeNull()
  })
})

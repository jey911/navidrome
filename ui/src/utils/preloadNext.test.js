import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  clearPreloadedStream,
  currentPreloadedUrl,
  preloadStreamUrl,
} from './preloadNext.js'

const makeAudioMock = () => {
  const inst = {
    preload: '',
    src: '',
    load: vi.fn(),
    removeAttribute: vi.fn(),
  }
  return inst
}

describe('preloadNext', () => {
  let instances
  beforeEach(() => {
    instances = []
    clearPreloadedStream()
    vi.stubGlobal('Audio', function () {
      const inst = makeAudioMock()
      instances.push(inst)
      return inst
    })
  })

  it('precarga la URL en un audio oculto con preload auto', () => {
    preloadStreamUrl('http://x/stream?id=1')
    expect(instances).toHaveLength(1)
    expect(instances[0].preload).toBe('auto')
    expect(instances[0].src).toBe('http://x/stream?id=1')
    expect(instances[0].load).toHaveBeenCalled()
    expect(currentPreloadedUrl()).toBe('http://x/stream?id=1')
  })

  it('no duplica la misma URL', () => {
    preloadStreamUrl('http://x/a')
    preloadStreamUrl('http://x/a')
    expect(instances).toHaveLength(1)
  })

  it('reemplaza la anterior al cambiar de tema', () => {
    preloadStreamUrl('http://x/a')
    preloadStreamUrl('http://x/b')
    expect(instances).toHaveLength(2)
    expect(instances[0].removeAttribute).toHaveBeenCalledWith('src')
    expect(currentPreloadedUrl()).toBe('http://x/b')
  })

  it('clear libera el elemento', () => {
    preloadStreamUrl('http://x/a')
    clearPreloadedStream()
    expect(currentPreloadedUrl()).toBeNull()
    expect(instances[0].removeAttribute).toHaveBeenCalledWith('src')
  })

  it('ignora URLs vacías', () => {
    preloadStreamUrl('')
    preloadStreamUrl(null)
    expect(instances).toHaveLength(0)
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { announceSession } from './remoteApi'

describe('remoteApi', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      status: 204,
      ok: true,
      headers: new Headers(),
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('no revienta si localStorage no está disponible', async () => {
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('localStorage blocked')
    })

    await expect(announceSession('Laptop')).resolves.toBeNull()
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('adjunta el token cuando existe', async () => {
    vi.spyOn(window.localStorage, 'getItem').mockReturnValue('tok')

    await announceSession('Laptop')

    const [, options] = global.fetch.mock.calls[0]
    expect(options.headers.get('X-ND-Authorization')).toBe('Bearer tok')
  })
})

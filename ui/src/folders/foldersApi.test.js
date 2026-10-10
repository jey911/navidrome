import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  buildFolderTree,
  fetchLibraryPaths,
  findFolderNode,
  folderPathPrefix,
  LibraryAuthError,
} from './foldersApi'

describe('buildFolderTree', () => {
  it('anida Género/Artista/Álbum con conteos recursivos', () => {
    const tree = buildFolderTree([
      'Salsa/Tito Rojas/Album A/01 Uno.mp3',
      'Salsa/Tito Rojas/Album A/02 Dos.mp3',
      'Salsa/Tito Rojas/Album B/01 Tres.mp3',
      'Rock/Banda X/Disco/01 R.mp3',
    ])
    expect(tree.totalSongs).toBe(4)
    expect(tree.subfolders.map((f) => f.name)).toEqual(['Rock', 'Salsa'])
    const salsa = tree.subfolders[1]
    expect(salsa.totalSongs).toBe(3)
    const tito = salsa.subfolders[0]
    expect(tito.relPath).toBe('Salsa/Tito Rojas')
    expect(tito.subfolders.map((f) => f.name)).toEqual(['Album A', 'Album B'])
    expect(tito.subfolders[0].files).toEqual(['01 Uno.mp3', '02 Dos.mp3'])
    expect(tito.subfolders[0].totalSongs).toBe(2)
  })

  it('ignora rutas absolutas, vacías o con ..', () => {
    const tree = buildFolderTree([
      '/music/Abs.mp3',
      '',
      'Pop/../evil.mp3',
      'Pop/Ok.mp3',
    ])
    expect(tree.totalSongs).toBe(1)
    expect(tree.subfolders.map((f) => f.name)).toEqual(['Pop'])
  })

  it('árbol vacío sin rutas', () => {
    const tree = buildFolderTree([])
    expect(tree.totalSongs).toBe(0)
    expect(tree.subfolders).toEqual([])
  })
})

describe('findFolderNode', () => {
  it('navega por segmentos y devuelve null si no existe', () => {
    const tree = buildFolderTree(['A/B/c.mp3'])
    expect(findFolderNode(tree, []).relPath).toBe('')
    expect(findFolderNode(tree, ['A']).relPath).toBe('A')
    expect(findFolderNode(tree, ['A', 'B']).files).toEqual(['c.mp3'])
    expect(findFolderNode(tree, ['X'])).toBeNull()
  })
})

describe('folderPathPrefix', () => {
  it('usa barra final para no mezclar prefijos parecidos', () => {
    expect(folderPathPrefix('Salsa/Tito')).toBe('/music/Salsa/Tito/')
    expect(folderPathPrefix('')).toBe('/music/')
  })
})

describe('fetchLibraryPaths', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('pagina hasta total y junta las rutas', async () => {
    fetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          total: 600,
          tracks: [{ path: 'A/a.mp3' }, { path: 'A/b.mp3' }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ total: 600, tracks: [{ path: 'B/c.mp3' }] }),
      })
    const paths = await fetchLibraryPaths()
    expect(paths).toEqual(['A/a.mp3', 'A/b.mp3', 'B/c.mp3'])
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      '/downloader/api/library?limit=500&offset=0',
      expect.objectContaining({ credentials: 'same-origin' }),
    )
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      '/downloader/api/library?limit=500&offset=500',
      expect.anything(),
    )
  })

  it('lanza LibraryAuthError con 401', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 401 })
    await expect(fetchLibraryPaths()).rejects.toBeInstanceOf(LibraryAuthError)
  })

  it('propaga otros errores HTTP con status', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 500 })
    await expect(fetchLibraryPaths()).rejects.toMatchObject({ status: 500 })
  })
})

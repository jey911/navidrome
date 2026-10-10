import { MUSIC_DIR_PREFIX } from '../remote/remoteCommands'

// Navegador de carpetas casa: la música en disco está organizada por
// Emepetre como Género/Artista/Álbum/*.mp3 y Navidrome no expone carpetas
// en su API nativa. El ÁRBOL se deriva de Emepetre (mismo origen vía
// /downloader, solo hacen falta las rutas) y las CANCIONES de cada carpeta
// se piden a Navidrome por prefijo de path (filtro startsWith) para
// reproducir con sus IDs reales.

export const LIBRARY_PAGE_SIZE = 500
export const LIBRARY_URL = '/downloader/api/library'

export class LibraryAuthError extends Error {
  constructor() {
    super('No hay sesión del Downloader en este navegador.')
    this.status = 401
  }
}

// Trae TODAS las rutas relativas de audio paginando (limit/offset) hasta
// `total`. Lanza LibraryAuthError con 401 para guiar al login.
export const fetchLibraryPaths = async (fetchFn = fetch) => {
  const paths = []
  let offset = 0
  let total = Infinity
  for (;;) {
    const res = await fetchFn(
      `${LIBRARY_URL}?limit=${LIBRARY_PAGE_SIZE}&offset=${offset}`,
      {
        credentials: 'same-origin',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      },
    )
    if (res.status === 401) {
      throw new LibraryAuthError()
    }
    if (!res.ok) {
      const err = new Error(`library ${res.status}`)
      err.status = res.status
      throw err
    }
    const body = await res.json()
    total = typeof body?.total === 'number' ? body.total : 0
    const tracks = body?.tracks || []
    for (const t of tracks) {
      if (t?.path) paths.push(t.path)
    }
    offset += LIBRARY_PAGE_SIZE
    if (tracks.length === 0 || offset >= total) break
  }
  return paths
}

// Nodo: { name, relPath, subfolders: [], files: [], totalSongs }.
// `files` son los audios DIRECTOS de la carpeta; `totalSongs` incluye
// subcarpetas. Todo ordenado alfabéticamente (es).
export const buildFolderTree = (paths = []) => {
  const root = {
    name: '',
    relPath: '',
    subfolders: [],
    files: [],
    totalSongs: 0,
  }
  const collator = new Intl.Collator('es')
  for (const p of paths) {
    if (!p || p.startsWith('/') || p.includes('..')) continue
    const parts = p.split('/').filter(Boolean)
    if (parts.length === 0) continue
    let node = root
    node.totalSongs += 1
    for (let i = 0; i < parts.length - 1; i++) {
      const name = parts[i]
      let child = node.subfolders.find((f) => f.name === name)
      if (!child) {
        child = {
          name,
          relPath: node.relPath ? `${node.relPath}/${name}` : name,
          subfolders: [],
          files: [],
          totalSongs: 0,
        }
        node.subfolders.push(child)
      }
      child.totalSongs += 1
      node = child
    }
    node.files.push(parts[parts.length - 1])
  }
  const sortNode = (node) => {
    node.subfolders.sort((a, b) => collator.compare(a.name, b.name))
    node.files.sort(collator.compare)
    node.subfolders.forEach(sortNode)
  }
  sortNode(root)
  return root
}

export const findFolderNode = (root, segments = []) => {
  let node = root
  for (const seg of segments) {
    node = node?.subfolders?.find((f) => f.name === seg)
    if (!node) return null
  }
  return node
}

// Prefijo absoluto para el filtro `path` de Navidrome (startsWith).
// Con barra final para no mezclar "Tito" con "Tito Rojas".
export const folderPathPrefix = (relPath) =>
  relPath ? `${MUSIC_DIR_PREFIX}${relPath}/` : MUSIC_DIR_PREFIX

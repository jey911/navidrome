import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslate, useDataProvider, useNotify } from 'react-admin'
import { useDispatch } from 'react-redux'
import {
  Button,
  CircularProgress,
  IconButton,
  Typography,
} from '@material-ui/core'
import FolderIcon from '@material-ui/icons/Folder'
import PlayArrowIcon from '@material-ui/icons/PlayArrow'
import ChevronRightIcon from '@material-ui/icons/ChevronRight'
import { playTracks } from '../actions'
import { SongContextMenu, SongPlayButton } from '../common'
import {
  buildFolderTree,
  fetchLibraryPaths,
  findFolderNode,
  folderPathPrefix,
} from './foldersApi'
import '../home/home.css'

const toSongMap = (records) => {
  const data = {}
  const ids = []
  for (const r of records) {
    if (r && r.id) {
      data[r.id] = r
      ids.push(r.id)
    }
  }
  return { data, ids }
}

const formatDuration = (seconds) => {
  if (!seconds && seconds !== 0) return '--:--'
  const s = Math.floor(seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// Vista "Carpetas": navega la música por carpetas del disco
// (Género/Artista/Álbum) y reproduce carpetas o temas sin entrar a fichas.
// El árbol sale de Emepetre (mismo origen /downloader); las canciones se
// piden a Navidrome por prefijo de path para usar sus IDs reales.
const FoldersView = () => {
  const translate = useTranslate()
  const notify = useNotify()
  const dataProvider = useDataProvider()
  const dispatch = useDispatch()
  const [tree, setTree] = useState(null)
  const [treeLoading, setTreeLoading] = useState(true)
  const [treeError, setTreeError] = useState(null)
  const [segments, setSegments] = useState([])
  const [songs, setSongs] = useState(null)
  const [songsLoading, setSongsLoading] = useState(false)

  const loadTree = useCallback(() => {
    setTreeLoading(true)
    setTreeError(null)
    fetchLibraryPaths()
      .then((paths) => {
        setTree(buildFolderTree(paths))
        setTreeLoading(false)
      })
      .catch((e) => {
        setTreeLoading(false)
        setTreeError(e?.status === 401 ? 'auth' : 'error')
      })
  }, [])

  useEffect(() => {
    loadTree()
  }, [loadTree])

  const node = tree ? findFolderNode(tree, segments) : null
  const relPath = segments.join('/')

  // Refs estables: si el proveedor/notificador cambian de identidad entre
  // renders, los efectos no deben re-dispararse en bucle.
  const dataProviderRef = useRef(dataProvider)
  dataProviderRef.current = dataProvider
  const notifyRef = useRef(notify)
  notifyRef.current = notify

  const fetchFolderSongs = useCallback(async (folderRelPath) => {
    const response = await dataProviderRef.current.getList('song', {
      pagination: { page: 1, perPage: -1 },
      sort: { field: 'path', order: 'ASC' },
      filter: { path: folderPathPrefix(folderRelPath), missing: false },
    })
    return toSongMap(response?.data || [])
  }, [])

  // Canciones de la carpeta actual (recursivo): al cambiar de carpeta se
  // recargan; la raíz solo muestra subcarpetas.
  useEffect(() => {
    if (!tree || segments.length === 0) {
      setSongs(null)
      return undefined
    }
    let alive = true
    setSongsLoading(true)
    fetchFolderSongs(relPath)
      .then((map) => {
        if (alive) {
          setSongs(map)
          setSongsLoading(false)
        }
      })
      .catch(() => {
        if (alive) {
          setSongs(null)
          setSongsLoading(false)
          notifyRef.current('ra.page.error', 'warning')
        }
      })
    return () => {
      alive = false
    }
  }, [tree, segments, relPath, fetchFolderSongs])

  const playFolder = (folderRelPath) => {
    fetchFolderSongs(folderRelPath)
      .then(({ data, ids }) => {
        if (ids.length > 0) dispatch(playTracks(data, ids))
        else notifyRef.current('ra.page.empty', 'info')
      })
      .catch(() => notifyRef.current('ra.page.error', 'warning'))
  }

  const enter = (name) => setSegments((segs) => [...segs, name])
  const goTo = (index) => setSegments((segs) => segs.slice(0, index))

  // Temas DIRECTOS de la carpeta (los de subcarpetas se ven al entrar).
  const prefix = folderPathPrefix(relPath)
  const directIds =
    songs?.ids.filter((id) => {
      const p = songs.data[id]?.path || ''
      const rest = p.startsWith(prefix) ? p.slice(prefix.length) : null
      return rest !== null && rest !== '' && !rest.includes('/')
    }) || []

  return (
    <div className="mm-home">
      <Typography variant="h5" gutterBottom>
        {translate('menu.folders', { _: 'Carpetas' })}
      </Typography>
      <section className="mm-card mm-section-card">
        {treeLoading && (
          <div className="mm-spinner">
            <CircularProgress size={24} />
          </div>
        )}
        {treeError === 'auth' && (
          <div className="mm-error">
            {translate('folders.needLogin', {
              _: 'Para ver las carpetas, abre el Downloader en otra pestaña e inicia sesión primero.',
            })}{' '}
            <a href="/downloader">
              {translate('menu.downloader', { _: 'Downloader' })}
            </a>{' '}
            <Button size="small" onClick={loadTree}>
              {translate('ra.action.refresh', { _: 'Reintentar' })}
            </Button>
          </div>
        )}
        {treeError === 'error' && (
          <div className="mm-error">
            {translate('folders.loadError', {
              _: 'No se pudieron cargar las carpetas.',
            })}{' '}
            <Button size="small" onClick={loadTree}>
              {translate('ra.action.refresh', { _: 'Reintentar' })}
            </Button>
          </div>
        )}
        {tree && !treeLoading && !treeError && (
          <>
            <div className="mm-crumb" aria-label="carpetas">
              <button
                type="button"
                className={segments.length === 0 ? 'current' : ''}
                onClick={() => goTo(0)}
              >
                {translate('folders.root', { _: 'Raíz' })}
              </button>
              {segments.map((seg, i) => (
                <React.Fragment key={`${i}-${seg}`}>
                  <span className="sep">/</span>
                  <button
                    type="button"
                    className={i === segments.length - 1 ? 'current' : ''}
                    onClick={() => goTo(i + 1)}
                  >
                    {seg}
                  </button>
                </React.Fragment>
              ))}
            </div>

            {node && segments.length > 0 && (
              <div className="mm-actions-line">
                <Typography variant="h6">
                  {node.name} ·{' '}
                  {translate('folders.songsCount', {
                    _: `${node.totalSongs} temas`,
                  })}
                </Typography>
                <button
                  type="button"
                  className="mm-pill-btn blue"
                  disabled={!songs || songs.ids.length === 0}
                  onClick={() => playFolder(relPath)}
                  data-testid="folder-play-all"
                >
                  <PlayArrowIcon />
                  {translate('folders.playFolder', {
                    _: 'Reproducir carpeta',
                  })}
                </button>
              </div>
            )}

            <div className="mm-tool-list" data-testid="folder-list">
              {(node?.subfolders || []).map((sub) => (
                <div
                  key={sub.relPath}
                  className="mm-tool-item"
                  role="button"
                  tabIndex={0}
                  onClick={() => enter(sub.name)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') enter(sub.name)
                  }}
                  data-testid="folder-row"
                >
                  <div className="mm-tool-icon orange">
                    <FolderIcon />
                  </div>
                  <div className="mm-tool-copy">
                    <b>{sub.name}</b>
                    <span>{`${sub.totalSongs} temas`}</span>
                  </div>
                  <span className="mm-row-actions">
                    <IconButton
                      size="small"
                      title={translate('folders.playFolder', {
                        _: 'Reproducir carpeta',
                      })}
                      data-testid="folder-row-play"
                      onClick={(e) => {
                        e.stopPropagation()
                        playFolder(sub.relPath)
                      }}
                    >
                      <PlayArrowIcon fontSize="small" />
                    </IconButton>
                    <ChevronRightIcon fontSize="small" />
                  </span>
                </div>
              ))}
            </div>

            {segments.length > 0 && (
              <>
                {songsLoading && (
                  <div className="mm-spinner">
                    <CircularProgress size={24} />
                  </div>
                )}
                {!songsLoading && songs && directIds.length > 0 && (
                  <table data-testid="folder-songs-table">
                    <thead>
                      <tr>
                        <th style={{ width: 44 }} />
                        <th>{translate('home.colTitle', { _: 'Título' })}</th>
                        <th>{translate('home.colArtist', { _: 'Artista' })}</th>
                        <th>
                          {translate('home.colDuration', { _: 'Duración' })}
                        </th>
                        <th>
                          {translate('home.colActions', { _: 'Acciones' })}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {directIds.map((id) => {
                        const record = songs.data[id]
                        return (
                          <tr
                            key={id}
                            data-testid="folder-song-row"
                            onClick={() =>
                              dispatch(playTracks(songs.data, songs.ids, id))
                            }
                            style={{ cursor: 'pointer' }}
                          >
                            <td>
                              <SongPlayButton
                                record={record}
                                onPlay={(r) =>
                                  dispatch(
                                    playTracks(songs.data, songs.ids, r.id),
                                  )
                                }
                              />
                            </td>
                            <td>
                              <div className="mm-truncate">{record.title}</div>
                            </td>
                            <td>
                              <div className="mm-truncate">{record.artist}</div>
                            </td>
                            <td>{formatDuration(record.duration)}</td>
                            <td>
                              <div
                                className="mm-row-actions"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <SongContextMenu record={record} />
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
                {!songsLoading &&
                  songs &&
                  directIds.length === 0 &&
                  node?.subfolders?.length > 0 && (
                    <div className="mm-empty">
                      {translate('folders.onlySubfolders', {
                        _: 'Esta carpeta solo tiene subcarpetas: entra a una para ver sus temas.',
                      })}
                    </div>
                  )}
              </>
            )}
            {tree.totalSongs === 0 && (
              <div className="mm-empty">
                {translate('folders.empty', {
                  _: 'No hay carpetas con música.',
                })}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}

export default FoldersView

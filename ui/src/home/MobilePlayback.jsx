import React, { useEffect, useState } from 'react'
import PlayArrowIcon from '@material-ui/icons/PlayArrow'
import PauseIcon from '@material-ui/icons/Pause'
import SkipNextIcon from '@material-ui/icons/SkipNext'
import AddIcon from '@material-ui/icons/Add'
import DeleteIcon from '@material-ui/icons/Delete'
import { getAudioInstance } from '../audioplayer/audioBus'

// Only mounted playback controls update; the library never ticks with audio.
const usePlayback = (active, trackId) => {
  const [state, setState] = useState({ playing: false, progress: 0 })
  useEffect(() => {
    if (!active) return undefined
    const update = () => {
      const audio = getAudioInstance()
      const next = {
        playing: !!audio && !audio.paused && !audio.ended,
        progress: audio?.duration
          ? Math.min(1, audio.currentTime / audio.duration)
          : 0,
      }
      setState((old) =>
        old.playing === next.playing && old.progress === next.progress
          ? old
          : next,
      )
    }
    update()
    const timer = setInterval(update, 500)
    return () => clearInterval(timer)
  }, [active, trackId])
  return state
}

const Progress = ({ progress }) => (
  <div
    className="mm-inline-progress"
    role="progressbar"
    aria-label="Progreso de reproducción"
    aria-valuenow={Math.round(progress * 100)}
    aria-valuemin={0}
    aria-valuemax={100}
  >
    <span style={{ width: `${progress * 100}%` }} />
  </div>
)

export const MobileSongRow = ({
  song,
  active,
  onPlay,
  onQueue,
  onDelete,
  deleting,
}) => {
  const playback = usePlayback(active, song.id)
  return (
    <tr
      data-testid="home-song-row"
      className={`mm-mobile-song ${active ? 'is-current' : ''}`}
    >
      <td className="mm-mobile-play">
        <button
          aria-label={active && playback.playing ? 'Pausar' : 'Reproducir'}
          disabled={song.missing || deleting}
          data-testid="row-play"
          onClick={() => onPlay(song)}
        >
          {active && playback.playing ? <PauseIcon /> : <PlayArrowIcon />}
        </button>
      </td>
      <td className="mm-mobile-title">
        <div className="mm-truncate">{song.title}</div>
      </td>
      <td className="mm-mobile-artist">
        <div className="mm-truncate">{song.artist}</div>
      </td>
      <td className="mm-mobile-actions">
        <div className="mm-row-actions">
          <button
            aria-label="Añadir a la cola"
            title="Añadir a la cola"
            disabled={deleting}
            onClick={() => onQueue(song)}
            data-testid="home-song-queue"
          >
            <AddIcon fontSize="small" />
          </button>
          <button
            aria-label={
              deleting ? 'Borrando canción' : 'Borrar de la biblioteca'
            }
            title="Borrar de la biblioteca"
            className="mm-danger"
            disabled={deleting}
            onClick={() => onDelete(song)}
            data-testid="home-song-delete"
          >
            <DeleteIcon fontSize="small" />
          </button>
        </div>
      </td>
      {active && (
        <td className="mm-mobile-progress">
          <Progress progress={playback.progress} />
        </td>
      )}
    </tr>
  )
}

export const CompactPlayback = ({ song }) => {
  const playback = usePlayback(true, song.id)
  return (
    <section
      className="mm-compact-playback"
      aria-label="Reproducción actual"
      data-testid="mobile-compact-playback"
    >
      <div className="mm-compact-title">
        <strong>{song.title}</strong>
        <span>{song.artist}</span>
      </div>
      <button
        aria-label={
          playback.playing
            ? 'Pausar reproducción actual'
            : 'Continuar reproducción'
        }
        onClick={() => getAudioInstance()?.togglePlay?.()}
      >
        {playback.playing ? <PauseIcon /> : <PlayArrowIcon />}
      </button>
      <button
        aria-label="Siguiente canción"
        onClick={() => getAudioInstance()?.playNext?.()}
      >
        <SkipNextIcon />
      </button>
      <Progress progress={playback.progress} />
    </section>
  )
}

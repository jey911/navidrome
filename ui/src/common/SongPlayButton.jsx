import React from 'react'
import PropTypes from 'prop-types'
import PlayArrowIcon from '@material-ui/icons/PlayArrow'
import { IconButton } from '@material-ui/core'

// Botón ▶ en la PRIMERA columna de las tablas de canciones: reproduce el
// tema directamente sin entrar a su detalle. Se usa como primer hijo del
// Datagrid (recibe `record` inyectado) en Canciones, Álbum y Playlist;
// `onPlay` replica el rowClick de cada tabla.
export const SongPlayButton = ({ record, onPlay, ...rest }) => {
  if (!record) return null
  // `rest` (label/source que inyecta el Datagrid) va primero para no pisar
  // el onClick propio.
  const { ...spanProps } = rest
  return (
    <IconButton
      size="small"
      title="Reproducir"
      aria-label="play"
      disabled={record.missing}
      data-testid="row-play"
      {...spanProps}
      onClick={(e) => {
        e.stopPropagation()
        onPlay?.(record)
      }}
    >
      <PlayArrowIcon fontSize="small" />
    </IconButton>
  )
}

SongPlayButton.propTypes = {
  record: PropTypes.object,
  onPlay: PropTypes.func,
}

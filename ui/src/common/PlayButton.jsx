import React from 'react'
import PropTypes from 'prop-types'
import PlayArrowIcon from '@material-ui/icons/PlayArrow'
import { IconButton } from '@material-ui/core'
import { useDispatch } from 'react-redux'
import { useDataProvider } from 'react-admin'
import { playTracks } from '../actions'

// ▶ por fila para álbumes (y artistas con `songFilter`): trae las canciones
// y las reproduce sin entrar al detalle. Como primer hijo del Datagrid
// recibe `record` inyectado, igual que los menús de contexto.
export const PlayButton = ({ record, size, className, songFilter }) => {
  let extractSongsData = function (response) {
    const data = response.data.reduce(
      (acc, cur) => ({ ...acc, [cur.id]: cur }),
      {},
    )
    const ids = response.data.map((r) => r.id)
    return { data, ids }
  }
  const dataProvider = useDataProvider()
  const dispatch = useDispatch()
  const playSongs = (record) => {
    dataProvider
      .getList('song', {
        pagination: { page: 1, perPage: -1 },
        sort: { field: 'album', order: 'ASC' },
        filter: songFilter
          ? songFilter(record)
          : {
              album_id: record.id,
              disc_number: record.discNumber,
            },
      })
      .then((response) => {
        let { data, ids } = extractSongsData(response)
        dispatch(playTracks(data, ids))
      })
  }

  if (!record) return null
  return (
    <IconButton
      onClick={(e) => {
        e.stopPropagation()
        e.preventDefault()
        playSongs(record)
      }}
      aria-label="play"
      title="Reproducir"
      disabled={record.missing}
      data-testid="row-play-album"
      className={className}
      size={size}
    >
      <PlayArrowIcon fontSize={size} />
    </IconButton>
  )
}

PlayButton.propTypes = {
  record: PropTypes.object.isRequired,
  size: PropTypes.string,
  className: PropTypes.string,
  songFilter: PropTypes.func,
}

PlayButton.defaultProps = {
  size: 'small',
}

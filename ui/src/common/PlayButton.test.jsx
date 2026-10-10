import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PlayButton } from './PlayButton'
import { playTracks } from '../actions'

const mockDispatch = vi.fn()
vi.mock('react-redux', () => ({ useDispatch: () => mockDispatch }))

const mockGetList = vi.fn()
vi.mock('react-admin', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useDataProvider: () => ({ getList: mockGetList }),
  }
})

describe('<PlayButton />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetList.mockResolvedValue({
      data: [{ id: 's1', title: 'Uno' }],
      total: 1,
    })
  })

  it('reproduce el álbum por defecto con filtro album_id', async () => {
    render(<PlayButton record={{ id: 'al1' }} />)
    fireEvent.click(screen.getByTestId('row-play-album'))
    await waitFor(() =>
      expect(mockGetList).toHaveBeenCalledWith(
        'song',
        expect.objectContaining({
          filter: { album_id: 'al1', disc_number: undefined },
        }),
      ),
    )
    await waitFor(() =>
      expect(mockDispatch).toHaveBeenCalledWith(
        playTracks({ s1: { id: 's1', title: 'Uno' } }, ['s1']),
      ),
    )
  })

  it('acepta songFilter personalizado (artistas)', async () => {
    render(
      <PlayButton
        record={{ id: 'ar1' }}
        songFilter={(r) => ({ album_artist_id: r.id, missing: false })}
      />,
    )
    fireEvent.click(screen.getByTestId('row-play-album'))
    await waitFor(() =>
      expect(mockGetList).toHaveBeenCalledWith(
        'song',
        expect.objectContaining({
          filter: { album_artist_id: 'ar1', missing: false },
        }),
      ),
    )
  })

  it('se desactiva con álbumes missing', () => {
    render(<PlayButton record={{ id: 'al1', missing: true }} />)
    expect(screen.getByTestId('row-play-album')).toBeDisabled()
  })
})

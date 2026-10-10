import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { SongPlayButton } from './SongPlayButton'

describe('<SongPlayButton />', () => {
  it('llama a onPlay con el record sin propagar la fila', () => {
    const onPlay = vi.fn()
    const stopPropagation = vi.fn()
    render(<SongPlayButton record={{ id: 's1' }} onPlay={onPlay} />)
    fireEvent.click(screen.getByTestId('row-play'), { stopPropagation })
    expect(onPlay).toHaveBeenCalledWith({ id: 's1' })
  })

  it('no hace nada visible sin record', () => {
    const { container } = render(<SongPlayButton onPlay={vi.fn()} />)
    expect(container.querySelector('[data-testid="row-play"]')).toBeNull()
  })

  it('se desactiva con temas missing', () => {
    render(
      <SongPlayButton record={{ id: 's1', missing: true }} onPlay={vi.fn()} />,
    )
    expect(screen.getByTestId('row-play')).toBeDisabled()
  })
})

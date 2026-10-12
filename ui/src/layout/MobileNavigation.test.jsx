import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { it, expect } from 'vitest'
import MobileNavigation from './MobileNavigation'

it('navigates between the library, queue and remote with exactly one active tab', () => {
  render(
    <MemoryRouter>
      <MobileNavigation />
    </MemoryRouter>,
  )
  const library = screen.getByRole('link', { name: 'Biblioteca' })
  const queue = screen.getByRole('link', { name: 'Cola' })
  const remote = screen.getByRole('link', { name: 'Mando' })
  expect(library).toHaveClass('active')
  fireEvent.click(queue)
  expect(queue).toHaveClass('active')
  expect(library).not.toHaveClass('active')
  fireEvent.click(remote)
  expect(remote).toHaveClass('active')
  expect(queue).not.toHaveClass('active')
})

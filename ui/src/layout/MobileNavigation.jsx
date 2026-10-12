import React from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import LibraryMusicIcon from '@material-ui/icons/LibraryMusic'
import QueueMusicIcon from '@material-ui/icons/QueueMusic'
import PhonelinkIcon from '@material-ui/icons/Phonelink'
import './mobileNavigation.css'

export default function MobileNavigation() {
  const location = useLocation()
  const queue =
    location.pathname === '/' &&
    new URLSearchParams(location.search).get('view') === 'queue'
  return (
    <nav className="mm-mobile-navigation" aria-label="Navegación principal">
      <NavLink
        exact
        to="/"
        isActive={() => location.pathname === '/' && !queue}
      >
        <LibraryMusicIcon />
        <span>Biblioteca</span>
      </NavLink>
      <NavLink to="/?view=queue" isActive={() => queue}>
        <QueueMusicIcon />
        <span>Cola</span>
      </NavLink>
      <NavLink to="/remote">
        <PhonelinkIcon />
        <span>Mando</span>
      </NavLink>
    </nav>
  )
}

import React, { useEffect, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import { NavLink, useLocation } from 'react-router-dom'
import LibraryMusicIcon from '@material-ui/icons/LibraryMusic'
import QueueMusicIcon from '@material-ui/icons/QueueMusic'
import PhonelinkIcon from '@material-ui/icons/Phonelink'
import './mobileNavigation.css'

export default function MobileNavigation() {
  const location = useLocation()
  const player = useSelector((state) => state.player)
  const pending = (player?.queue || []).filter(
    (item) => item.manualQueued && item.uuid !== player?.current?.uuid,
  )
  const pendingKey = pending.map((item) => item.uuid).join(',')
  const previous = useRef(null)
  const pulseTimer = useRef(null)
  const [added, setAdded] = useState(false)
  const [pulse, setPulse] = useState(0)
  useEffect(() => {
    const ids = pendingKey ? pendingKey.split(',') : []
    const hasNew =
      previous.current && ids.some((id) => !previous.current.has(id))
    previous.current = new Set(ids)
    if (!hasNew) return undefined
    setAdded(true)
    setPulse((value) => value + 1)
    clearTimeout(pulseTimer.current)
    pulseTimer.current = setTimeout(() => setAdded(false), 1000)
    return undefined
  }, [pendingKey])
  useEffect(() => () => clearTimeout(pulseTimer.current), [])
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
      <NavLink
        to="/?view=queue"
        aria-label="Cola"
        isActive={() => queue}
        className={added ? 'mm-queue-added' : ''}
      >
        <span key={pulse} className="mm-nav-queue-icon">
          <QueueMusicIcon />
          {pending.length > 0 && (
            <span className="mm-queue-badge" aria-hidden="true">
              {pending.length}
            </span>
          )}
        </span>
        <span className="mm-sr-only" role="status">
          {added ? 'Canción añadida a la cola' : ''}
        </span>
        <span>Cola</span>
      </NavLink>
      <NavLink to="/remote">
        <PhonelinkIcon />
        <span>Mando</span>
      </NavLink>
    </nav>
  )
}

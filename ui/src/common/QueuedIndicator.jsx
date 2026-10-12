import React from 'react'
import './queuedIndicator.css'

export default function QueuedIndicator({ count = 0 }) {
  if (!count) return null
  return (
    <span
      className="mm-queued-indicator"
      aria-label={`En cola${count > 1 ? `, ${count} veces` : ''}`}
    >
      En cola{count > 1 ? ` ×${count}` : ''}
    </span>
  )
}

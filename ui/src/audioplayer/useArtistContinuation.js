import { useEffect, useRef } from 'react'
import { setArtistContinuation } from '../actions'
import { fetchArtistContinuation } from '../utils/artistContinuation'

const EMPTY_QUEUE = []

export default function useArtistContinuation({
  enabled,
  playerState,
  dataProvider,
  dispatch,
  audioInstanceRef,
}) {
  const latest = useRef({ enabled, playerState })
  latest.current = { enabled, playerState }
  const pending = useRef(null)
  const mounted = useRef(true)
  const resumed = useRef(null)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const current = playerState.current || {}
  const queue = playerState.queue || EMPTY_QUEUE
  const hasManual = queue.some(
    (item) => item.manualQueued && item.uuid !== current.uuid,
  )
  const hasContinuation =
    !!current.uuid && queue.some((item) => item.continuationOf === current.uuid)

  useEffect(() => {
    if (
      !enabled ||
      !current.uuid ||
      !current.song?.id ||
      current.isRadio ||
      hasManual ||
      hasContinuation
    )
      return
    if (pending.current === current.uuid) return
    const anchor = current.uuid
    pending.current = anchor
    fetchArtistContinuation(dataProvider, current.song).then((song) => {
      if (pending.current === anchor) pending.current = null
      const state = latest.current
      if (
        !mounted.current ||
        !song ||
        !state.enabled ||
        state.playerState.current?.uuid !== anchor ||
        state.playerState.queue.some(
          (item) => item.manualQueued && item.uuid !== anchor,
        )
      )
        return
      dispatch(setArtistContinuation(anchor, song))
    })
  }, [
    enabled,
    current.uuid,
    current.song,
    current.isRadio,
    hasManual,
    hasContinuation,
    dataProvider,
    dispatch,
  ])

  // React has committed the new audio list before this effect runs. Only
  // resume an ended song; never override a pause or a manually started song.
  useEffect(() => {
    if (!enabled || !hasContinuation || hasManual) return
    const audio = audioInstanceRef.current
    if (audio?.ended && resumed.current !== current.uuid) {
      resumed.current = current.uuid
      audio.playNext?.()
    }
  }, [
    enabled,
    hasContinuation,
    hasManual,
    queue,
    audioInstanceRef,
    current.uuid,
  ])
}

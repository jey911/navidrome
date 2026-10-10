import { baseUrl } from '../utils'
import { clientUniqueId, clientUniqueIdHeader } from '../dataProvider'
import { REST_URL } from '../consts'

// Cliente del control remoto casa (ver server/nativeapi/remote.go).
// Todo autenticado con el mismo login de Navidrome en ambos dispositivos.
// fetch crudo (no fetchJson): varios endpoints devuelven 204 sin cuerpo.

const customAuthorizationHeader = 'X-ND-Authorization'

// localStorage puede no estar disponible (modo privado, sandbox, SSR):
// nunca debe tumbar el mando remoto.
const getToken = () => {
  try {
    return localStorage.getItem('token')
  } catch {
    return null
  }
}

const call = async (method, path, body) => {
  const headers = new Headers({ Accept: 'application/json' })
  headers.set(clientUniqueIdHeader, clientUniqueId)
  const token = getToken()
  if (token) {
    headers.set(customAuthorizationHeader, `Bearer ${token}`)
  }
  const options = { method, headers }
  if (body !== undefined) {
    headers.set('Content-Type', 'application/json')
    options.body = JSON.stringify(body)
  }
  const res = await fetch(baseUrl(`${REST_URL}${path}`), options)
  if (res.status === 204) {
    return null
  }
  if (!res.ok) {
    const err = new Error(`remote ${res.status}`)
    err.status = res.status
    throw err
  }
  return res.json()
}

export const announceSession = (name) =>
  call('POST', '/remote/announce', { name })

export const listSessions = () => call('GET', '/remote/sessions')

export const sendCommand = (sessionId, code, action, payload) =>
  call('POST', '/remote/command', { sessionId, code, action, payload })

export const fetchPending = (sessionId, code) =>
  call(
    'GET',
    `/remote/pending?sessionId=${encodeURIComponent(sessionId)}&code=${encodeURIComponent(code)}`,
  )

export const publishState = (sessionId, code, state) =>
  call('POST', '/remote/state', { sessionId, code, state })

export const fetchState = (sessionId) =>
  call('GET', `/remote/state?sessionId=${encodeURIComponent(sessionId)}`)

export const leaveSession = (sessionId, code) =>
  call('POST', '/remote/leave', { sessionId, code })

// SSE dedicado a remoteCommand (el singleton de eventStream solo atiende
// tipos fijos). Misma auth JWT por query que el stream principal.
export const subscribeRemoteCommands = (onCommand) => {
  let url = baseUrl(`${REST_URL}/events`)
  const token = getToken()
  if (token) {
    url = url + `?jwt=${token}`
  }
  const source = new EventSource(url)
  const handler = (event) => {
    try {
      onCommand(JSON.parse(event.data))
    } catch {
      // evento ajeno: ignorar
    }
  }
  source.addEventListener('remoteCommand', handler)
  return () => {
    source.removeEventListener('remoteCommand', handler)
    source.close()
  }
}

import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { Server as HttpServer } from 'node:http'
import { Server } from 'socket.io'
import type { ClientEvents, Failure, ServerEvents, SocketData } from '../../shared/types.js'
import { Stand } from './stand.js'

const sameToken = (candidate: unknown, token: string) =>
  token.length > 0 &&
  typeof candidate === 'string' &&
  Buffer.byteLength(candidate) === Buffer.byteLength(token) &&
  timingSafeEqual(Buffer.from(candidate), Buffer.from(token))
export function attachRealtime(server: HttpServer, stand: Stand) {
  const io = new Server<ClientEvents, ServerEvents, Record<string, never>, SocketData>(server, {
    path: '/socket.io',
    addTrailingSlash: false,
    maxHttpBufferSize: 8_192,
    serveClient: false,
    cors: { origin: false },
  })
  let presenterId: string | null = null,
    capability = ''
  const broadcast = () => {
    io.to('players').emit('stand:state', stand.playerState())
    if (presenterId) io.to(presenterId).emit('stand:state', stand.presenterState())
  }
  io.on('connection', (socket) => {
    let windowStart = Date.now(),
      messages = 0
    const limited = (ack: (failure: Failure) => void) => {
      if (Date.now() - windowStart > 60_000) {
        windowStart = Date.now()
        messages = 0
      }
      if (++messages <= 120) return false
      if (typeof ack === 'function')
        ack({ ok: false, error: 'Trop de demandes. Patientez quelques instants.' })
      return true
    }
    const denied = (ack: (failure: Failure) => void, presenter = false): boolean => {
      if (limited(ack)) return true
      if (
        presenter
          ? socket.data.role === 'presenter' && presenterId === socket.id
          : socket.data.role === 'player'
      )
        return false
      if (typeof ack === 'function')
        ack({
          ok: false,
          error: presenter
            ? 'Commande réservée au pupitre actif.'
            : 'Connectez-vous à l’écran joueur.',
        })
      return true
    }
    socket.on('stand:watch', (_payload, ack) => {
      if (limited(ack)) return
      if (presenterId === socket.id) presenterId = null
      socket.data.role = 'player'
      void socket.join('players')
      socket.emit('stand:state', stand.playerState())
      if (typeof ack === 'function') ack({ ok: true })
    })
    socket.on('presenter:claim', (payload, ack) => {
      if (limited(ack)) return
      const resume = sameToken(payload?.token, capability)
      if (presenterId && presenterId !== socket.id && !resume) {
        if (typeof ack === 'function')
          ack({
            ok: false,
            error: 'Un présentateur pilote déjà ce stand. Fermez son onglet pour reprendre.',
          })
        return
      }
      if (presenterId && presenterId !== socket.id) {
        const previous = io.sockets.sockets.get(presenterId)
        if (previous) {
          previous.data.role = 'player'
          void previous.join('players')
          previous.emit('presenter:replaced')
          previous.emit('stand:state', stand.playerState())
        }
      }
      if (!resume) capability = randomBytes(32).toString('hex')
      presenterId = socket.id
      socket.data.role = 'presenter'
      void socket.leave('players')
      if (typeof ack === 'function') ack({ ok: true, token: capability })
      socket.emit('stand:state', stand.presenterState())
    })
    socket.on('stand:current-question', (_payload, ack) => {
      if (limited(ack)) return
      if (!socket.data.role) {
        if (typeof ack === 'function') ack({ ok: false, error: 'Connectez-vous au stand.' })
        return
      }
      const state =
        socket.data.role === 'presenter' && presenterId === socket.id
          ? stand.presenterState()
          : stand.playerState()
      if (typeof ack === 'function') ack({ ok: true, state })
    })
    socket.on('presenter:history', (payload, ack) => {
      if (denied(ack, true)) return
      if (typeof payload?.userId !== 'string' || payload.userId.length > 128) {
        if (typeof ack === 'function') ack({ ok: false, error: 'Visiteur invalide.' })
        return
      }
      if (typeof ack === 'function')
        ack({ ok: true, attempts: stand.store.history(payload.userId) })
    })
    socket.on('presenter:command', async (command, ack) => {
      if (denied(ack, true)) return
      const result = await stand.command(command)
      if (typeof ack === 'function') ack(result)
      if (result.ok) broadcast()
    })
    socket.on('player:begin', async (payload, ack) => {
      if (denied(ack)) return
      const result = await stand.begin(payload)
      if (typeof ack === 'function') ack(result)
      if (result.ok && !result.returning) broadcast()
    })
    socket.on('player:submit', async (payload, ack) => {
      if (denied(ack)) return
      const result = await stand.submit(payload)
      if (typeof ack === 'function') ack(result)
      if (result.ok) broadcast()
    })
    socket.on('player:next', async (payload, ack) => {
      if (denied(ack)) return
      const result = await stand.next(payload)
      if (typeof ack === 'function') ack(result)
      if (result.ok) broadcast()
    })
    socket.on('player:leave', async (payload, ack) => {
      if (denied(ack)) return
      const result = await stand.leave(payload)
      if (typeof ack === 'function') ack(result)
      if (result.ok) broadcast()
    })
    socket.on('disconnect', () => {
      if (presenterId === socket.id) presenterId = null
    })
  })
  return io
}

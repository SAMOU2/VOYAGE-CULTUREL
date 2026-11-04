import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { Server as HttpServer } from 'node:http'
import { Server } from 'socket.io'
import type { Ack, ClientEvents, Result, ServerEvents, SocketData } from '../../shared/types.js'
import { Stand } from './stand.js'

type StandServer = Server<ClientEvents, ServerEvents, Record<string, never>, SocketData>
const reply = (ack: Ack | undefined, result: Result) => {
  if (typeof ack === 'function') ack(result)
}
const sameToken = (candidate: unknown, token: string) =>
  token.length > 0 &&
  typeof candidate === 'string' &&
  Buffer.byteLength(candidate) === Buffer.byteLength(token) &&
  timingSafeEqual(Buffer.from(candidate), Buffer.from(token))

export function attachRealtime(server: HttpServer, stand: Stand): StandServer {
  const io: StandServer = new Server(server, {
    path: '/socket.io',
    addTrailingSlash: false,
    maxHttpBufferSize: 8_192,
    serveClient: false,
    cors: { origin: false },
  })
  let presenterId: string | null = null
  let capability = ''

  const broadcast = () => {
    io.to('players').emit('stand:state', stand.playerState())
    if (presenterId) io.to(presenterId).emit('stand:state', stand.presenterState())
  }

  io.on('connection', (socket) => {
    let windowStart = Date.now(),
      messages = 0
    const limited = (ack: Ack) => {
      if (Date.now() - windowStart > 60_000) {
        windowStart = Date.now()
        messages = 0
      }
      if (++messages <= 120) return false
      reply(ack, { ok: false, error: 'Trop de demandes. Patientez quelques instants.' })
      return true
    }

    socket.on('stand:watch', (_payload, ack) => {
      if (limited(ack)) return
      if (presenterId === socket.id) presenterId = null
      socket.data.role = 'player'
      void socket.join('players')
      socket.emit('stand:state', stand.playerState())
      reply(ack, { ok: true })
    })

    socket.on('presenter:claim', (payload, ack) => {
      if (limited(ack)) return
      const resume = sameToken(payload?.token, capability)
      if (presenterId && presenterId !== socket.id && !resume) {
        reply(ack, {
          ok: false,
          error: 'Un présentateur pilote déjà ce stand. Fermez son onglet pour prendre la main.',
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
      reply(ack, { ok: true, token: capability })
      socket.emit('stand:state', stand.presenterState())
    })

    socket.on('presenter:command', async (command, ack) => {
      if (limited(ack)) return
      if (socket.data.role !== 'presenter' || socket.id !== presenterId) {
        reply(ack, { ok: false, error: 'Commande réservée au présentateur actif.' })
        return
      }
      const result = await stand.command(command)
      reply(ack, result)
      if (result.ok) broadcast()
    })

    socket.on('player:submit', async (payload, ack) => {
      if (limited(ack)) return
      if (!socket.data.role) {
        reply(ack, { ok: false, error: 'Connectez-vous au stand.' })
        return
      }
      const result = await stand.submit(payload)
      reply(ack, result)
      if (result.ok) broadcast()
    })

    socket.on('disconnect', () => {
      if (presenterId === socket.id) presenterId = null
    })
  })
  return io
}

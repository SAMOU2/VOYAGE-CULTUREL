import { createServer } from 'node:http'
import os from 'node:os'
import express from 'express'
import next from 'next'
import { Server as SocketServer } from 'socket.io'

import { rooms } from './rooms.mjs'
import { registerRealtime } from './realtime.mjs'
import { CHECKED_AT, QUESTIONS } from './questions.mjs'

const dev = process.env.NODE_ENV !== 'production'
const port = Number(process.env.PORT || 3000)
const hostname = '0.0.0.0'

const app = next({ dev, hostname, port, dir: process.cwd() })
const handle = app.getRequestHandler()

/** Adresse IPv4 du réseau local, pour ouvrir le jeu sur un autre appareil. */
function lanAddress() {
  const nets = os.networkInterfaces()
  for (const entries of Object.values(nets)) {
    for (const net of entries ?? []) {
      if (net.family === 'IPv4' && !net.internal) return net.address
    }
  }
  return null
}

await app.prepare()

const server = createServer()
const expressApp = express()

expressApp.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    rooms: rooms.size,
    questions: QUESTIONS.length,
    checkedAt: CHECKED_AT,
    lan: lanAddress(),
    port,
  })
})

expressApp.get('/api/bank', (_req, res) => {
  res.json({ total: QUESTIONS.length, checkedAt: CHECKED_AT })
})

expressApp.all('*', (req, res) => handle(req, res))

server.on('request', expressApp)

const io = new SocketServer(server, {
  cors: { origin: true, credentials: true },
  // Le repli en long-polling garantit le fonctionnement derrière un proxy qui bloque les WebSockets.
  transports: ['polling', 'websocket'],
  pingTimeout: 20000,
})

const { broadcastAvailability } = registerRealtime(io)

// Nettoyage périodique des salles inactives.
setInterval(() => {
  const before = rooms.size
  for (const [code, room] of rooms) {
    const idle = Date.now() - room.updatedAt
    if (idle > 6 * 60 * 60 * 1000) rooms.delete(code)
  }
  if (before !== rooms.size) {
    console.log(`[salles] ${before} → ${rooms.size}`)
    broadcastAvailability()
  }
}, 15 * 60 * 1000).unref?.()

server.listen(port, hostname, () => {
  const lan = lanAddress()
  console.log(`\n  VOYAGE CULTUREL — serveur local`)
  console.log(`  → http://localhost:${port}`)
  if (lan) console.log(`  → http://${lan}:${port}  (même Wi-Fi)`)
  console.log(`  ${QUESTIONS.length} questions chargées (vérifiées le ${CHECKED_AT})\n`)
})

export { io, server }

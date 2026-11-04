import { createServer } from 'node:http'
import os from 'node:os'
import express from 'express'
import next from 'next'
import QRCode from 'qrcode'
import { Server as SocketServer } from 'socket.io'

import {
  createRoom,
  getRoom,
  hostCommand,
  hostView,
  joinPlayer,
  playerView,
  rooms,
  startGame,
  submitAnswer,
  touch,
} from './rooms.mjs'
import { CHECKED_AT, QUESTIONS } from './questions.mjs'

const dev = process.env.NODE_ENV !== 'production'
const port = Number(process.env.PORT || 3000)
const hostname = '0.0.0.0'

const app = next({ dev, hostname, port, dir: process.cwd() })
const handle = app.getRequestHandler()

/** Adresse IPv4 du réseau local, pour le QR code « même Wi-Fi ». */
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

// QR code généré côté serveur : le navigateur n'embarque pas la bibliothèque.
expressApp.get('/api/qr', async (req, res) => {
  const data = String(req.query.data || '').slice(0, 400)
  if (!data) {
    res.status(400).json({ error: 'paramètre data manquant' })
    return
  }
  try {
    const svg = await QRCode.toString(data, {
      type: 'svg',
      margin: 1,
      width: 240,
      errorCorrectionLevel: 'M',
      color: { dark: '#050a15', light: '#ffffff' },
    })
    res.type('image/svg+xml').set('Cache-Control', 'no-store').send(svg)
  } catch {
    res.status(500).json({ error: 'QR code impossible' })
  }
})

expressApp.all('*', (req, res) => handle(req, res))

server.on('request', expressApp)

const io = new SocketServer(server, {
  cors: { origin: true, credentials: true },
  // Le repli en long-polling garantit le fonctionnement derrière un proxy qui bloque les WebSockets.
  transports: ['polling', 'websocket'],
  pingTimeout: 20000,
})

function broadcast(room) {
  if (!room) return
  const hostSocket = room.hostSocketId ? io.sockets.sockets.get(room.hostSocketId) : null
  if (hostSocket) hostSocket.emit('state', hostView(room))
  const playerSocket = room.player?.socketId ? io.sockets.sockets.get(room.player.socketId) : null
  if (playerSocket) playerSocket.emit('state', playerView(room))
}

function ack(fn, payload) {
  if (typeof fn === 'function') fn(payload)
}

io.on('connection', (socket) => {
  socket.data.roomCode = null
  socket.data.role = null

  const attach = (room, role) => {
    socket.data.roomCode = room.code
    socket.data.role = role
    socket.join(`room:${room.code}`)
    touch(room)
  }

  socket.on('host:create', (config, done) => {
    const room = createRoom(config || {})
    room.hostSocketId = socket.id
    attach(room, 'host')
    ack(done, { ok: true, code: room.code, hostToken: room.hostToken })
    broadcast(room)
  })

  socket.on('host:rejoin', (payload, done) => {
    const room = getRoom(payload?.code)
    if (!room) return ack(done, { ok: false, error: 'Salle introuvable ou expirée.' })
    if (payload?.token && payload.token !== room.hostToken) {
      return ack(done, { ok: false, error: 'Jeton de présentateur invalide.' })
    }
    room.hostSocketId = socket.id
    attach(room, 'host')
    ack(done, { ok: true, code: room.code })
    broadcast(room)
  })

  socket.on('host:command', (payload, done) => {
    const room = getRoom(payload?.code ?? socket.data.roomCode)
    if (!room) return ack(done, { ok: false, error: 'Salle introuvable.' })
    if (room.hostSocketId !== socket.id) return ack(done, { ok: false, error: 'Vous n\'êtes pas le présentateur de cette salle.' })
    const result = hostCommand(room, payload?.type, payload?.payload || {})
    ack(done, result)
    broadcast(room)
  })

  socket.on('player:join', (payload, done) => {
    const room = getRoom(payload?.code)
    if (!room) return ack(done, { ok: false, error: 'Code de salle inconnu. Vérifiez auprès du présentateur.' })
    if (room.status === 'finished') return ack(done, { ok: false, error: 'Cette partie est terminée.' })
    const result = joinPlayer(room, payload?.pseudo, socket.id)
    if (result.error) return ack(done, { ok: false, error: result.error })
    attach(room, 'player')
    ack(done, { ok: true, code: room.code, playerId: result.playerId, pseudo: room.player.pseudo })
    broadcast(room)
  })

  socket.on('player:rejoin', (payload, done) => {
    const room = getRoom(payload?.code)
    if (!room) return ack(done, { ok: false, error: 'Salle introuvable ou expirée.' })
    if (!room.player || room.player.id !== payload?.playerId) {
      return ack(done, { ok: false, error: 'Joueur inconnu dans cette salle.' })
    }
    room.player.socketId = socket.id
    room.player.connected = true
    attach(room, 'player')
    ack(done, { ok: true, code: room.code })
    broadcast(room)
  })

  socket.on('player:submit', (payload, done) => {
    const room = getRoom(payload?.code ?? socket.data.roomCode)
    if (!room) return ack(done, { ok: false, error: 'Salle introuvable.' })
    if (!room.player || room.player.socketId !== socket.id) {
      return ack(done, { ok: false, error: "Vous n'êtes pas le joueur de cette salle." })
    }
    const result = submitAnswer(room, payload || {})
    ack(done, result)
    broadcast(room)
  })

  socket.on('player:leave', () => {
    const room = getRoom(socket.data.roomCode)
    if (room && room.player?.socketId === socket.id) {
      room.player.connected = false
      room.player.socketId = null
      broadcast(room)
    }
  })

  socket.on('disconnect', () => {
    const room = getRoom(socket.data.roomCode)
    if (!room) return
    if (room.hostSocketId === socket.id) {
      room.hostSocketId = null
      touch(room)
    }
    if (room.player?.socketId === socket.id) {
      room.player.socketId = null
      room.player.connected = false
      touch(room)
    }
    broadcast(room)
  })
})

// Nettoyage périodique des salles inactives.
setInterval(() => {
  const before = rooms.size
  for (const [code, room] of rooms) {
    const idle = Date.now() - room.updatedAt
    if (idle > 6 * 60 * 60 * 1000) rooms.delete(code)
  }
  if (before !== rooms.size) console.log(`[salles] ${before} → ${rooms.size}`)
}, 15 * 60 * 1000).unref?.()

server.listen(port, hostname, () => {
  const lan = lanAddress()
  console.log(`\n  VOYAGE CULTUREL — serveur local`)
  console.log(`  → http://localhost:${port}`)
  if (lan) console.log(`  → http://${lan}:${port}  (même Wi-Fi, à scanner)`)
  console.log(`  ${QUESTIONS.length} questions chargées (vérifiées le ${CHECKED_AT})\n`)
})

export { io, server }

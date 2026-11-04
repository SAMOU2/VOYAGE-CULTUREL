import {
  availableRooms,
  createRoom,
  getRoom,
  hostCommand,
  hostView,
  joinPlayer,
  leavePlayer,
  playerView,
  rooms,
  submitAnswer,
  touch,
} from './rooms.mjs'

const DISCOVERY = 'available-games'

/** Temps réel indépendant de Next : le même protocole peut être testé sans navigateur. */
export function registerRealtime(io) {
  let lastAvailability = ''

  function broadcastAvailability() {
    const available = availableRooms()
    const snapshot = JSON.stringify(available)
    if (snapshot === lastAvailability) return
    lastAvailability = snapshot
    io.to(DISCOVERY).emit('lobby:update', available)
  }

  function broadcast(room) {
    if (!room) return
    const host = room.hostSocketId ? io.sockets.sockets.get(room.hostSocketId) : null
    const player = room.player?.socketId ? io.sockets.sockets.get(room.player.socketId) : null
    if (host) host.emit('state', hostView(room))
    if (player) player.emit('state', playerView(room))
    broadcastAvailability()
  }

  function closeRoom(room) {
    rooms.delete(room.code)
    for (const id of [room.hostSocketId, room.player?.socketId]) {
      const participant = id ? io.sockets.sockets.get(id) : null
      if (!participant || participant.data.roomCode !== room.code) continue
      participant.leave(`room:${room.code}`)
      participant.data.roomCode = null
      participant.data.role = null
      participant.emit('room:closed', {
        roomId: room.code,
        message: 'Le présentateur a fermé la partie.',
      })
    }
    broadcastAvailability()
  }

  const ack = (done, response) => {
    if (typeof done === 'function') done(response)
  }

  io.on('connection', (socket) => {
    socket.data.roomCode = null
    socket.data.role = null

    function detach(voluntary = false) {
      const previous = getRoom(socket.data.roomCode)
      if (previous) {
        if (previous.hostSocketId === socket.id) {
          previous.hostSocketId = null
          touch(previous)
        }
        leavePlayer(previous, socket.id, voluntary)
        socket.leave(`room:${previous.code}`)
        broadcast(previous)
      }
      socket.data.roomCode = null
      socket.data.role = null
    }

    function attach(room, role) {
      if (socket.data.roomCode !== room.code || socket.data.role !== role) detach(true)
      socket.data.roomCode = room.code
      socket.data.role = role
      socket.leave(DISCOVERY)
      socket.join(`room:${room.code}`)
      touch(room)
    }

    socket.on('lobby:subscribe', (_payload, done) => {
      socket.join(DISCOVERY)
      // Un seul flux ordonné pour les listes initiales et les mises à jour.
      socket.emit('lobby:update', availableRooms())
      ack(done, { ok: true })
    })
    socket.on('lobby:unsubscribe', () => socket.leave(DISCOVERY))

    socket.on('host:create', (config, done) => {
      const previous = getRoom(socket.data.roomCode)
      if (previous?.hostSocketId === socket.id) closeRoom(previous)
      const room = createRoom(config || {})
      attach(room, 'host')
      room.hostSocketId = socket.id
      ack(done, { ok: true, code: room.code, hostToken: room.hostToken })
      broadcast(room)
    })

    socket.on('host:rejoin', (payload, done) => {
      const room = getRoom(payload?.code)
      if (!room) return ack(done, { ok: false, error: 'Salle introuvable ou expirée.' })
      // Les identifiants des salles sont publics : un jeton reste toujours obligatoire.
      if (payload?.token !== room.hostToken) {
        return ack(done, { ok: false, error: 'Jeton de présentateur invalide.' })
      }
      attach(room, 'host')
      room.hostSocketId = socket.id
      ack(done, { ok: true, code: room.code })
      broadcast(room)
    })

    socket.on('host:command', (payload, done) => {
      const room = getRoom(payload?.code ?? socket.data.roomCode)
      if (!room) return ack(done, { ok: false, error: 'Salle introuvable.' })
      if (room.hostSocketId !== socket.id) {
        return ack(done, { ok: false, error: 'Vous n’êtes pas le présentateur de cette salle.' })
      }
      const result = hostCommand(room, payload?.type, payload?.payload || {})
      ack(done, result)
      broadcast(room)
    })

    socket.on('host:close', (_payload, done) => {
      const room = getRoom(socket.data.roomCode)
      if (!room || room.hostSocketId !== socket.id) {
        return ack(done, { ok: false, error: 'Seul le présentateur peut fermer cette partie.' })
      }
      ack(done, { ok: true })
      closeRoom(room)
    })

    socket.on('player:join', (payload, done) => {
      if (socket.data.role === 'host') {
        return ack(done, {
          ok: false,
          error: 'Ouvrez le joueur dans un autre onglet pour garder le présentateur connecté.',
        })
      }
      const requested = payload?.roomId ?? payload?.code
      const current = getRoom(socket.data.roomCode)
      // StrictMode, deux accusés proches ou rechargement : ne pas occuper deux sièges.
      if (current?.player?.socketId === socket.id && (!requested || requested === current.code)) {
        ack(done, {
          ok: true,
          code: current.code,
          playerId: current.player.id,
          pseudo: current.player.pseudo,
        })
        broadcast(current)
        return
      }
      if (current?.player?.socketId === socket.id) {
        return ack(done, { ok: false, error: 'Quittez la partie actuelle avant d’en rejoindre une autre.' })
      }
      const candidates = availableRooms()
      const room = requested ? getRoom(requested) : candidates.length === 1 ? getRoom(candidates[0].id) : null
      if (!room) {
        const error = requested
          ? 'Cette partie n’est plus disponible.'
          : candidates.length > 1
            ? 'Plusieurs parties sont disponibles : choisissez-en une.'
            : 'Aucune partie disponible pour le moment.'
        return ack(done, { ok: false, error })
      }
      if (!room.hostSocketId) return ack(done, { ok: false, error: 'Le présentateur est déconnecté.' })
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
      attach(room, 'player')
      room.player.socketId = socket.id
      room.player.connected = true
      ack(done, { ok: true, code: room.code })
      broadcast(room)
    })

    socket.on('player:rename', (payload, done) => {
      const room = getRoom(socket.data.roomCode)
      if (!room || room.player?.socketId !== socket.id) {
        return ack(done, { ok: false, error: 'Vous n’êtes pas le joueur de cette partie.' })
      }
      room.player.pseudo =
        String(payload?.pseudo || '')
          .trim()
          .slice(0, 18) || 'Joueur'
      touch(room)
      ack(done, { ok: true, pseudo: room.player.pseudo })
      broadcast(room)
    })

    socket.on('player:submit', (payload, done) => {
      const room = getRoom(payload?.code ?? socket.data.roomCode)
      if (!room) return ack(done, { ok: false, error: 'Salle introuvable.' })
      if (!room.player || room.player.socketId !== socket.id) {
        return ack(done, { ok: false, error: 'Vous n’êtes pas le joueur de cette salle.' })
      }
      const result = submitAnswer(room, payload || {})
      ack(done, result)
      broadcast(room)
    })

    socket.on('player:leave', (_payload, done) => {
      detach(true)
      ack(done, { ok: true })
      broadcastAvailability()
    })

    socket.on('disconnect', () => {
      detach()
      broadcastAvailability()
    })
  })

  return { broadcastAvailability }
}

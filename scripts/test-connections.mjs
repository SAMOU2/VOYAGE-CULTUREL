import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { after, afterEach, before, test } from 'node:test'
import { Server } from 'socket.io'
import { io as connect } from 'socket.io-client'
import { registerRealtime } from '../server/realtime.mjs'
import { availableRooms, getRoom, rooms } from '../server/rooms.mjs'

let server, io, url
const clients = new Set()
const call = (socket, event, payload = {}) => socket.timeout(3000).emitWithAck(event, payload)

async function until(predicate) {
  const deadline = Date.now() + 3000
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('État temps réel non reçu')
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

async function client() {
  const socket = connect(url, { transports: ['websocket'], forceNew: true, reconnection: false })
  clients.add(socket)
  socket.states = []
  socket.list = null
  socket.closedRoom = null
  socket.on('state', (state) => {
    socket.state = state
    socket.states.push(state)
  })
  socket.on('lobby:update', (list) => {
    socket.list = list
  })
  socket.on('room:closed', (payload) => {
    socket.closedRoom = payload
  })
  await new Promise((resolve, reject) => {
    socket.once('connect', resolve)
    socket.once('connect_error', reject)
  })
  return socket
}

async function host() {
  const socket = await client()
  const session = await call(socket, 'host:create', { theme: 'capitales', difficulty: 1, count: 3 })
  assert.ok(session.ok)
  await until(() => socket.state?.roomCode === session.code)
  return { socket, ...session }
}

before(async () => {
  server = createServer((_req, res) => res.end('test'))
  io = new Server(server)
  registerRealtime(io)
  await new Promise((resolve) => server.listen(0, '0.0.0.0', resolve))
  url = `http://127.0.0.1:${server.address().port}`
})

afterEach(() => {
  for (const socket of clients) socket.close()
  clients.clear()
  io.disconnectSockets(true)
  rooms.clear()
})

after(async () => {
  await new Promise((resolve) => io.close(resolve))
})

test('découverte en direct : seulement les métadonnées publiques des salles libres', async () => {
  const observer = await client()
  assert.ok((await call(observer, 'lobby:subscribe')).ok)
  await until(() => observer.list !== null)
  assert.deepEqual(observer.list, [])
  const session = await host()
  await until(() => observer.list.length === 1)
  const entry = observer.list[0]
  assert.deepEqual(Object.keys(entry).sort(), ['count', 'difficultyLabel', 'id', 'name', 'themeLabel'])
  assert.equal(entry.id, session.code)
  assert.match(entry.name, /^Partie \d+$/)
  assert.equal(entry.themeLabel, 'Capitales')
  assert.equal(entry.difficultyLabel, 'Facile')
  assert.equal(observer.states.length, 0)
  assert.ok((await call(session.socket, 'host:command', { type: 'config', payload: { difficulty: 4 } })).ok)
  await until(() => observer.list[0]?.difficultyLabel === 'Expert')
  const raw = JSON.stringify(observer.list)
  for (const key of [
    'hostToken',
    'playerId',
    'pseudo',
    'current',
    'answer',
    'accepted',
    'coords',
    'isoN',
    'history',
  ]) {
    assert.ok(!raw.includes(`"${key}"`), key)
  }
})

test('une seule salle : connexion automatique sans compte, pseudo ni code fourni', async () => {
  const session = await host()
  const player = await client()
  const joined = await call(player, 'player:join')
  assert.ok(joined.ok)
  assert.equal(joined.code, session.code)
  assert.equal(joined.pseudo, 'Joueur')
  await until(() => player.state?.role === 'player')
  assert.equal(player.state.roomName, session.socket.state.roomName)
  assert.deepEqual(availableRooms(), [])
})

test('aucune salle : attente, puis réception de la nouvelle partie sans rafraîchir la page', async () => {
  const player = await client()
  assert.ok(!(await call(player, 'player:join')).ok)
  await call(player, 'lobby:subscribe')
  await until(() => player.list !== null)
  assert.deepEqual(player.list, [])
  const session = await host()
  await until(() => player.list.length === 1)
  assert.equal(player.list[0].id, session.code)
  assert.ok((await call(player, 'player:join')).ok)
})

test('plusieurs salles : pas de choix arbitraire ; sélection explicite sans saisie de code', async () => {
  const first = await host()
  const second = await host()
  const player = await client()
  const ambiguous = await call(player, 'player:join')
  assert.ok(!ambiguous.ok)
  assert.match(ambiguous.error, /Plusieurs parties/)
  assert.equal(availableRooms().length, 2)
  const chosen = await call(player, 'player:join', { roomId: second.code, pseudo: 'Amina' })
  assert.ok(chosen.ok)
  assert.equal(chosen.code, second.code)
  assert.equal(getRoom(first.code).player, null)
  assert.equal(getRoom(second.code).player.pseudo, 'Amina')
  assert.equal(availableRooms().length, 1)
})

test('deux joueurs simultanés : un seul obtient la dernière place', async () => {
  const session = await host()
  const players = await Promise.all([client(), client()])
  const results = await Promise.all(players.map((player) => call(player, 'player:join')))
  assert.equal(results.filter((result) => result.ok).length, 1)
  const winner = results.findIndex((result) => result.ok)
  assert.equal(getRoom(session.code).player.socketId, players[winner].id)
  assert.deepEqual(availableRooms(), [])
})

test('départ volontaire du lobby : la place est libérée et annoncée immédiatement', async () => {
  const session = await host()
  const player = await client()
  const watcher = await client()
  const joined = await call(player, 'player:join')
  await call(watcher, 'lobby:subscribe')
  await until(() => watcher.list !== null)
  assert.deepEqual(watcher.list, [])
  assert.ok((await call(player, 'player:leave')).ok)
  await until(() => watcher.list.length === 1)
  assert.equal(getRoom(session.code).player, null)
  const next = await call(watcher, 'player:join')
  assert.ok(next.ok)
  assert.notEqual(next.playerId, joined.playerId)
})

test('déconnexion : place réservée, intrus refusé, reprise du même joueur sans code saisi', async () => {
  const session = await host()
  const player = await client()
  const joined = await call(player, 'player:join')
  player.close()
  await until(() => !getRoom(session.code).player.connected)
  assert.deepEqual(availableRooms(), [])
  const stranger = await client()
  assert.ok(!(await call(stranger, 'player:join', { roomId: session.code })).ok)
  assert.ok(!(await call(stranger, 'player:rejoin', { code: session.code, playerId: 'invalide' })).ok)
  const replacement = await client()
  assert.ok((await call(replacement, 'player:rejoin', { code: session.code, playerId: joined.playerId })).ok)
  await until(() => replacement.state?.role === 'player')
  assert.equal(getRoom(session.code).player.id, joined.playerId)
  assert.equal(getRoom(session.code).player.socketId, replacement.id)
})

test('partie commencée : non découvrable ; score, question et session préservés après reconnexion', async () => {
  const session = await host()
  const player = await client()
  const joined = await call(player, 'player:join')
  assert.ok((await call(session.socket, 'host:command', { type: 'start' })).ok)
  await until(() => session.socket.state?.current)
  const question = session.socket.state.current
  assert.ok((await call(player, 'player:submit', { pin: question.coords })).ok)
  await until(() => player.state?.feedback)
  const score = player.state.score
  assert.ok(score > 0)
  player.close()
  await until(() => !getRoom(session.code).player.connected)
  const stranger = await client()
  assert.deepEqual(availableRooms(), [])
  assert.ok(!(await call(stranger, 'player:join', { roomId: session.code })).ok)
  assert.ok((await call(stranger, 'player:rejoin', { code: session.code, playerId: joined.playerId })).ok)
  await until(() => stranger.state?.feedback)
  assert.equal(stranger.state.score, score)
  assert.equal(stranger.state.question.id, question.id)
  await call(stranger, 'player:leave')
  assert.deepEqual(availableRooms(), [])
})

test('présentateur déconnecté : salle retirée, puis réannoncée à sa reprise', async () => {
  const session = await host()
  const watcher = await client()
  await call(watcher, 'lobby:subscribe')
  await until(() => watcher.list?.length === 1)
  session.socket.close()
  await until(() => watcher.list.length === 0)
  const replacement = await client()
  assert.ok((await call(replacement, 'host:rejoin', { code: session.code, token: session.hostToken })).ok)
  await until(() => watcher.list.length === 1)
  assert.equal(watcher.list[0].id, session.code)
})

test('aucun écran de login, mais un visiteur ne peut ni lire le corrigé ni piloter le présentateur', async () => {
  const session = await host()
  const stranger = await client()
  for (const token of [undefined, '', 'incorrect']) {
    const result = await call(stranger, 'host:rejoin', {
      code: session.code,
      ...(token === undefined ? {} : { token }),
    })
    assert.ok(!result.ok)
  }
  assert.ok(!(await call(stranger, 'host:command', { code: session.code, type: 'start' })).ok)
  assert.ok(!(await call(stranger, 'host:close')).ok)
  assert.ok(!(await call(stranger, 'player:rename', { pseudo: 'Intrus' })).ok)
  assert.ok(!(await call(stranger, 'player:submit', { code: session.code, pin: [2.35, 48.85] })).ok)
  assert.equal(stranger.states.length, 0)
  assert.equal(getRoom(session.code).hostSocketId, session.socket.id)
})

test('fermeture de salle : retrait de la découverte et notification du joueur, sans partie fantôme', async () => {
  const session = await host()
  const player = await client()
  await call(player, 'player:join')
  assert.ok((await call(session.socket, 'host:close')).ok)
  await until(() => player.closedRoom !== null)
  assert.equal(player.closedRoom.roomId, session.code)
  assert.equal(getRoom(session.code), null)
  await call(player, 'lobby:subscribe')
  await until(() => player.list !== null)
  assert.deepEqual(player.list, [])
})

test('nouvelle salle sur le même présentateur : ancienne salle fermée, une seule nouvelle annonce', async () => {
  const session = await host()
  const next = await call(session.socket, 'host:create', {})
  assert.ok(next.ok)
  assert.notEqual(next.code, session.code)
  assert.equal(getRoom(session.code), null)
  assert.equal(availableRooms().length, 1)
  assert.equal(availableRooms()[0].id, next.code)
})

test('connexion répétée idempotente : même identité et pas de changement de salle implicite', async () => {
  const session = await host()
  const player = await client()
  const first = await call(player, 'player:join')
  const second = await call(player, 'player:join')
  assert.ok(second.ok)
  assert.equal(second.playerId, first.playerId)
  const other = await host()
  assert.ok(!(await call(player, 'player:join', { roomId: other.code })).ok)
  assert.equal(getRoom(session.code).player.id, first.playerId)
  assert.equal(getRoom(other.code).player, null)
})

test('pseudo facultatif modifiable et borné, sans inscription', async () => {
  const session = await host()
  const player = await client()
  const joined = await call(player, 'player:join')
  const renamed = await call(player, 'player:rename', { pseudo: '  Amina  ' })
  assert.ok(renamed.ok)
  assert.equal(renamed.pseudo, 'Amina')
  assert.equal(getRoom(session.code).player.id, joined.playerId)
  assert.equal((await call(player, 'player:rename', { pseudo: 'X'.repeat(50) })).pseudo.length, 18)
  assert.equal((await call(player, 'player:rename', { pseudo: '' })).pseudo, 'Joueur')
})

test('ouvrir le joueur sur le socket du présentateur ne fait pas disparaître son rôle', async () => {
  const session = await host()
  assert.ok(!(await call(session.socket, 'player:join')).ok)
  assert.equal(getRoom(session.code).hostSocketId, session.socket.id)
  assert.equal(getRoom(session.code).player, null)
})

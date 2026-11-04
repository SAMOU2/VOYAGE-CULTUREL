import test, { type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { io, type Socket } from 'socket.io-client'
import { startBackend } from '../../backend/src/app.js'
import type {
  Ack,
  ClientEvents,
  Command,
  Result,
  ServerEvents,
  StandState,
} from '../../shared/types.js'
import { temporary, landPin, wrongPin } from './helpers.js'

type Client = Socket<ServerEvents, ClientEvents>
function response(send: (ack: Ack) => void): Promise<Result> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Ack Socket.IO absent')), 3_000)
    send((result) => {
      clearTimeout(timeout)
      resolve(result)
    })
  })
}
const watch = (socket: Client) => response((ack) => socket.emit('stand:watch', {}, ack))
const claim = (socket: Client, token?: string) =>
  response((ack) => socket.emit('presenter:claim', { token }, ack))
const command = (socket: Client, command: Command) =>
  response((ack) => socket.emit('presenter:command', command, ack))
function nextState(
  socket: Client,
  predicate: (state: StandState) => boolean = () => true,
): Promise<StandState> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off('stand:state', receive)
      reject(new Error('État Socket.IO absent'))
    }, 3_000)
    const receive = (state: StandState) => {
      if (predicate(state)) {
        clearTimeout(timeout)
        socket.off('stand:state', receive)
        resolve(state)
      }
    }
    socket.on('stand:state', receive)
  })
}
async function setup(t: TestContext) {
  const directory = await temporary(t)
  const backend = await startBackend({
    port: 0,
    host: '127.0.0.1',
    usersFile: join(directory, 'users.json'),
  })
  const sockets: Client[] = []
  t.after(async () => {
    sockets.forEach((socket) => socket.disconnect())
    await backend.close()
  })
  const url = `http://127.0.0.1:${backend.port}`
  const connect = async () => {
    const socket: Client = io(url, {
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
      addTrailingSlash: false,
    })
    sockets.push(socket)
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve())
      socket.once('connect_error', reject)
    })
    return socket
  }
  return { backend, url, connect }
}

test('API publique HTTP : santé/catalogue/classement et état expurgé, anciennes salles absentes', async (t) => {
  const { url } = await setup(t)
  assert.equal((await fetch(`${url}/api/health`)).status, 200)
  const state = (await (await fetch(`${url}/api/state`)).json()) as StandState
  assert.equal(state.role, 'player')
  assert.equal(state.feedback, null)
  assert.ok(!('answer' in state))
  assert.ok(!('countryId' in state.question))
  assert.ok(!('location' in state.question))
  assert.equal((await fetch(`${url}/api/rooms`)).status, 404)
  assert.equal((await fetch(`${url}/api/questions`)).status, 404)
  assert.equal((await fetch(`${url}/api/users`)).status, 404)
  const catalog = await (await fetch(`${url}/api/catalog`)).json()
  assert.equal(catalog.questions, 120)
  assert.deepEqual(await (await fetch(`${url}/api/leaderboard`)).json(), [])
})
test('watch automatique sans compte, code, nom obligatoire ou mot de passe', async (t) => {
  const { connect } = await setup(t),
    socket = await connect(),
    state = nextState(socket)
  assert.deepEqual(await watch(socket), { ok: true })
  assert.equal((await state).role, 'player')
})
test('premier présentateur : capacité interne opaque et corrigé privé, sans formulaire de connexion', async (t) => {
  const { connect } = await setup(t),
    socket = await connect(),
    state = nextState(socket)
  const result = await claim(socket)
  assert.ok(result.ok && result.token)
  if (result.ok) assert.match(result.token!, /^[a-f0-9]{64}$/)
  const privateState = await state
  assert.equal(privateState.role, 'presenter')
  if (privateState.role === 'presenter') assert.ok(privateState.answer.country.id)
})
test('joueur : pas de commande présentateur ni d’élévation de rôle via watch', async (t) => {
  const { connect, backend } = await setup(t),
    socket = await connect()
  await watch(socket)
  const before = backend.stand.playerState()
  assert.equal((await command(socket, { type: 'skip' })).ok, false)
  await response((ack) => socket.emit('stand:watch', { role: 'presenter' } as never, ack))
  assert.equal((await command(socket, { type: 'hint' })).ok, false)
  assert.deepEqual(backend.stand.playerState(), before)
})
test('socket non abonné : validation impossible', async (t) => {
  const { connect, backend } = await setup(t),
    socket = await connect()
  assert.equal(
    (
      await response((ack) =>
        socket.emit(
          'player:submit',
          { turn: backend.stand.playerState().question.turn, pin: [2, 48] },
          ack,
        ),
      )
    ).ok,
    false,
  )
})
test('second présentateur sans capacité : refus et aucun corrigé transmis', async (t) => {
  const { connect } = await setup(t),
    first = await connect(),
    second = await connect(),
    states: StandState[] = []
  await claim(first)
  second.on('stand:state', (state) => states.push(state))
  const result = await claim(second)
  assert.equal(result.ok, false)
  assert.equal(states.length, 0)
  assert.equal((await command(second, { type: 'skip' })).ok, false)
})
test('reprise avec la bonne capacité : ancien onglet révoqué, sa commande et son état privé retirés', async (t) => {
  const { connect } = await setup(t),
    first = await connect(),
    second = await connect()
  const result = await claim(first)
  assert.ok(result.ok && result.token)
  const replaced = new Promise<void>((resolve) => first.once('presenter:replaced', resolve))
  assert.ok((await claim(second, result.ok ? result.token : undefined)).ok)
  await replaced
  assert.equal((await command(first, { type: 'skip' })).ok, false)
  const publicState = nextState(first),
    privateState = nextState(second)
  await command(second, { type: 'hint' })
  assert.equal((await publicState).role, 'player')
  assert.equal((await privateState).role, 'presenter')
})
test('présentateur parti : un nouvel animateur peut reprendre sans compte, code ni ancien token', async (t) => {
  const { connect } = await setup(t),
    first = await connect()
  const previous = await claim(first)
  first.disconnect()
  const second = await connect(),
    result = await claim(second)
  assert.ok(result.ok)
  if (previous.ok && result.ok) assert.notEqual(previous.token, result.token)
})
test('reconnexion avec sa capacité : état du stand et indices conservés', async (t) => {
  const { connect, backend } = await setup(t),
    first = await connect(),
    result = await claim(first)
  await command(first, { type: 'hint' })
  const turn = backend.stand.playerState().question.turn
  first.disconnect()
  const resumed = await connect(),
    state = nextState(resumed)
  assert.ok((await claim(resumed, result.ok ? result.token : undefined)).ok)
  const restored = await state
  assert.equal(restored.question.turn, turn)
  assert.equal(restored.question.hints.length, 1)
})
test('seconde chance réseau : ack et broadcasts sans pays, source ou corrigé', async (t) => {
  const { connect, backend } = await setup(t),
    socket = await connect()
  await watch(socket)
  const turn = backend.stand.playerState().question.turn,
    id = backend.stand.presenterState().answer.country.id
  const state = nextState(socket)
  const result = await response((ack) =>
    socket.emit('player:submit', { turn, pin: wrongPin(id) }, ack),
  )
  assert.deepEqual(result, { ok: true, retry: true })
  const publicState = await state
  assert.equal(publicState.feedback, null)
  assert.ok(!('answer' in publicState))
  assert.ok(!('countryId' in publicState.question))
  assert.ok(!('location' in publicState.question))
})
test('validation réseau simultanée : score unique, corrigé public seulement après verdict', async (t) => {
  const { connect, backend } = await setup(t),
    one = await connect(),
    two = await connect()
  await watch(one)
  await watch(two)
  const turn = backend.stand.playerState().question.turn,
    pin = landPin(backend.stand.presenterState().answer.country.id)
  const state = nextState(two, (s) => s.phase === 'feedback')
  const results = await Promise.all([
    response((ack) => one.emit('player:submit', { turn, pin }, ack)),
    response((ack) => two.emit('player:submit', { turn, pin }, ack)),
  ])
  assert.equal(results.filter((result) => result.ok).length, 1)
  const resolved = await state
  assert.equal(resolved.participant.score, 10)
  assert.ok(resolved.feedback?.country.name)
})
test('terminer le passage diffuse le nouveau visiteur et le classement sauvegardé', async (t) => {
  const { connect, backend } = await setup(t),
    host = await connect(),
    player = await connect()
  await claim(host)
  await watch(player)
  await command(host, { type: 'rename', nickname: 'Étudiante test' })
  const turn = backend.stand.playerState().question.turn,
    pin = landPin(backend.stand.presenterState().answer.country.id)
  await response((ack) => player.emit('player:submit', { turn, pin }, ack))
  const state = nextState(player, (s) => s.phase === 'question' && s.participant.answered === 0)
  await command(host, { type: 'new-participant' })
  const updated = await state
  assert.equal(updated.leaderboard[0].nickname, 'Étudiante test')
  assert.equal(updated.leaderboard[0].score, 10)
  assert.equal(updated.participant.score, 0)
})

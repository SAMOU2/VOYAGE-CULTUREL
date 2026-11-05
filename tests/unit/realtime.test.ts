import test, { type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { startBackend } from '../../backend/src/app.js'
import { temporary, landPin, turnOf, wrongPin } from './helpers.js'
import {
  claim,
  command,
  connect as connection,
  nextState,
  response,
  snapshot,
  watch,
  type Client,
} from '../support/network.js'
import type { PlayerState, StandState } from '../../shared/types.js'

async function setup(t: TestContext) {
  const directory = await temporary(t),
    backend = await startBackend({
      port: 0,
      host: '127.0.0.1',
      usersFile: join(directory, 'users.json'),
      random: () => 0,
    }),
    sockets: Client[] = []
  t.after(async () => {
    sockets.forEach((s) => s.disconnect())
    await backend.close()
  })
  const url = `http://127.0.0.1:${backend.port}`
  const connect = async () => {
    const socket = await connection(url)
    sockets.push(socket)
    return socket
  }
  const player = async () => {
    const socket = await connect()
    await watch(socket)
    assert.equal(
      (await response((ack) => socket.emit('player:begin', { fullName: 'Lina Benali' }, ack))).ok,
      true,
    )
    return socket
  }
  return { backend, url, connect, player }
}
test('HTTP public : santé, current-question, faits, catalogue et leaderboard sans corrigé', async (t) => {
  const { url, player } = await setup(t)
  await player()
  for (const route of ['health', 'current-question', 'state', 'catalog', 'facts', 'leaderboard']) {
    const result = await fetch(`${url}/api/${route}`)
    assert.equal(result.status, 200)
    assert.equal(result.headers.get('cache-control'), 'no-store')
    assert.equal(result.headers.get('x-powered-by'), null)
  }
  const state = (await (await fetch(`${url}/api/current-question`)).json()) as PlayerState
  assert.equal(state.role, 'player')
  assert.ok(!('answer' in state))
  assert.equal(state.feedback, null)
  for (const key of ['countryId', 'location', 'source', 'explanation'])
    assert.ok(!(key in state.question!))
  const catalog = await (await fetch(`${url}/api/catalog`)).json()
  assert.equal(catalog.questions, 1080)
  assert.equal(catalog.countries.length, 240)
  assert.deepEqual(await (await fetch(`${url}/api/leaderboard`)).json(), [])
  for (const route of ['rooms', 'questions', 'users', 'attempts', 'settings', 'answer'])
    assert.equal((await fetch(`${url}/api/${route}`)).status, 404)
})
test('abonnement sans compte ni code ; identification complète uniquement au début du jeu', async (t) => {
  const { connect } = await setup(t),
    socket = await connect(),
    state = nextState(socket)
  assert.deepEqual(await watch(socket), { ok: true })
  assert.equal((await state).phase, 'idle')
  assert.equal(
    (await response((ack) => socket.emit('player:begin', { fullName: '' }, ack))).ok,
    false,
  )
  assert.equal(
    (await response((ack) => socket.emit('player:begin', { fullName: 'أمين بن علي' }, ack))).ok,
    true,
  )
})
test('pupitre automatique : capacité opaque et corrigé privé sans login', async (t) => {
  const { connect, player } = await setup(t)
  await player()
  const host = await connect(),
    state = nextState(host),
    result = await claim(host)
  assert.ok(result.ok)
  if (result.ok) assert.match(result.token, /^[a-f0-9]{64}$/)
  const privateState = await state
  assert.equal(privateState.role, 'presenter')
  if (privateState.role === 'presenter') {
    assert.ok(privateState.answer!.country.id)
    assert.equal(privateState.answer!.hints.length, 2)
  }
})
test('joueur : pas de commande ou d’historique privé, watch ne permet pas une élévation', async (t) => {
  const { player, backend } = await setup(t),
    socket = await player(),
    before = backend.stand.playerState()
  assert.equal((await command(socket, { type: 'hint', ...turnOf(backend.stand) })).ok, false)
  const history = await response<{ attempts: unknown[] }>((ack) =>
    socket.emit('presenter:history', { userId: 'inconnu' }, ack as never),
  )
  assert.equal(history.ok, false)
  await response((ack) => socket.emit('stand:watch', { role: 'presenter' } as never, ack))
  const result = await snapshot(socket)
  assert.ok(result.ok && result.state.role === 'player')
  assert.deepEqual(backend.stand.playerState(), before)
})
test('socket non abonné : ni début, ni validation, ni snapshot', async (t) => {
  const { connect } = await setup(t),
    socket = await connect()
  assert.equal(
    (await response((ack) => socket.emit('player:begin', { fullName: 'Lina Benali' }, ack))).ok,
    false,
  )
  assert.equal(
    (
      await response((ack) =>
        socket.emit('player:submit', { attemptId: 'x', turn: 1, pin: [2, 48] }, ack),
      )
    ).ok,
    false,
  )
  assert.equal((await snapshot(socket)).ok, false)
})
test('second pupitre sans capacité : refus et aucun snapshot privé reçu', async (t) => {
  const { connect } = await setup(t),
    first = await connect(),
    second = await connect(),
    states: StandState[] = []
  await claim(first)
  second.on('stand:state', (state) => states.push(state))
  assert.equal((await claim(second)).ok, false)
  assert.equal(states.length, 0)
  assert.equal((await command(second, { type: 'reset' })).ok, false)
})
test('reprise avec capacité : ancien onglet révoqué et ramené au public', async (t) => {
  const { connect, player, backend } = await setup(t)
  await player()
  const first = await connect(),
    second = await connect(),
    result = await claim(first)
  assert.ok(result.ok)
  const replaced = new Promise<void>((resolve) => first.once('presenter:replaced', resolve)),
    publicState = nextState(first, (s) => s.role === 'player'),
    privateState = nextState(second, (s) => s.role === 'presenter')
  assert.equal((await claim(second, result.ok ? result.token : undefined)).ok, true)
  await replaced
  assert.equal((await publicState).role, 'player')
  assert.equal((await privateState).role, 'presenter')
  assert.equal((await command(first, { type: 'hint', ...turnOf(backend.stand) })).ok, false)
  const snap = await snapshot(first)
  assert.ok(snap.ok && snap.state.role === 'player' && !('answer' in snap.state))
})
test('présentateur déconnecté : reprise sans compte avec une nouvelle capacité', async (t) => {
  const { connect } = await setup(t),
    first = await connect(),
    old = await claim(first)
  first.disconnect()
  const second = await connect(),
    result = await claim(second)
  assert.ok(result.ok)
  if (old.ok && result.ok) assert.notEqual(result.token, old.token)
})
test('reconnexion avec capacité : même question et indices conservés', async (t) => {
  const { connect, player, backend } = await setup(t)
  await player()
  const first = await connect(),
    result = await claim(first)
  await command(first, { type: 'hint', ...turnOf(backend.stand) })
  const before = backend.stand.playerState()
  first.disconnect()
  const second = await connect(),
    state = nextState(second)
  assert.equal((await claim(second, result.ok ? result.token : undefined)).ok, true)
  const after = await state
  assert.deepEqual(after.question, before.question)
  assert.equal(after.question!.hints.length, 1)
})
test('seconde chance réseau : ack et broadcast expurgés du corrigé et de la position', async (t) => {
  const { connect, player, backend } = await setup(t),
    host = await connect()
  await claim(host)
  await command(host, {
    type: 'settings',
    settings: { ...backend.stand.settings, allowRetry: true },
  })
  const socket = await player(),
    turn = turnOf(backend.stand),
    id = backend.stand.presenterState().answer!.country.id,
    state = nextState(socket)
  assert.deepEqual(
    await response((ack) => socket.emit('player:submit', { ...turn, pin: wrongPin(id) }, ack)),
    { ok: true, retry: true },
  )
  const publicState = await state
  assert.equal(publicState.feedback, null)
  assert.ok(!('answer' in publicState))
  assert.ok(!('countryId' in publicState.question!))
  assert.ok(!('location' in publicState.question!))
  assert.equal(publicState.game!.answered, 0)
})
test('validation réseau simultanée : score unique et corrigé seulement après résolution', async (t) => {
  const { connect, player, backend } = await setup(t),
    one = await player(),
    two = await connect()
  await watch(two)
  const payload = {
      ...turnOf(backend.stand),
      pin: landPin(backend.stand.presenterState().answer!.country.id),
    },
    resolved = nextState(two, (s) => s.phase === 'feedback')
  const results = await Promise.all([
    response((ack) => one.emit('player:submit', payload, ack)),
    response((ack) => two.emit('player:submit', payload, ack)),
  ])
  assert.equal(results.filter((r) => r.ok).length, 1)
  const state = await resolved
  assert.equal(state.game!.score, 10)
  assert.ok(state.feedback!.country.name)
})
test('remplacement réseau synchronisé, sans gain de compteur ou de score', async (t) => {
  const { connect, player, backend } = await setup(t),
    socket = await player(),
    host = await connect()
  await claim(host)
  const before = backend.stand.playerState(),
    updated = nextState(socket, (s) => s.question!.turn !== before.question!.turn)
  assert.equal(
    (await command(host, { type: 'replace-question', ...turnOf(backend.stand) })).ok,
    true,
  )
  const state = await updated
  assert.equal(state.game!.answered, 0)
  assert.equal(state.game!.score, 0)
  assert.equal(state.game!.stage, 1)
  assert.ok(state.revision > before.revision)
})
test('fin de passage : meilleur score public, nombre de tentatives et historique privés', async (t) => {
  const { connect, player, backend } = await setup(t),
    socket = await player(),
    host = await connect()
  await claim(host)
  await response((ack) =>
    socket.emit(
      'player:submit',
      { ...turnOf(backend.stand), pin: landPin(backend.stand.presenterState().answer!.country.id) },
      ack,
    ),
  )
  const updated = nextState(socket, (s) => s.phase === 'finished')
  await command(host, { type: 'end-game', attemptId: turnOf(backend.stand).attemptId })
  const state = await updated
  assert.equal(state.leaderboard[0].fullName, 'Lina Benali')
  assert.equal(state.leaderboard[0].score, 10)
  assert.ok(!('attempts' in state.leaderboard[0]))
  const result = await response<{ attempts: unknown[] }>((ack) =>
    host.emit('presenter:history', { userId: state.leaderboard[0].userId }, ack as never),
  )
  assert.ok(result.ok)
  if (result.ok) {
    assert.equal(result.attempts.length, 1)
    assert.ok(!('answers' in (result.attempts[0] as object)))
  }
})
test('limite réseau : les rafales sont refusées explicitement', async (t) => {
  const { connect } = await setup(t),
    socket = await connect()
  await watch(socket)
  const responses = await Promise.all(Array.from({ length: 125 }, () => snapshot(socket)))
  assert.ok(responses.some((r) => !r.ok && /Trop de demandes/.test(r.error)))
  assert.ok(responses.some((r) => r.ok))
})

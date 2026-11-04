/** Test bout en bout Express + Socket.IO isolé : ne modifie jamais les visiteurs du stand réel. */
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { io, type Socket } from 'socket.io-client'
import { startBackend } from '../backend/src/app.js'
import type { Ack, ClientEvents, Command, Result, ServerEvents } from '../shared/types.js'
import { landPin, wrongPin } from '../tests/unit/helpers.js'

const directory = await mkdtemp(join(tmpdir(), 'voyage-smoke-'))
const backend = await startBackend({
  port: 0,
  host: '127.0.0.1',
  usersFile: join(directory, 'users.json'),
})
const sockets: Socket<ServerEvents, ClientEvents>[] = []
let checks = 0
function check(condition: unknown, label: string): asserts condition {
  assert.ok(condition, label)
  checks++
  console.log(`✓ ${label}`)
}
function request(send: (ack: Ack) => void): Promise<Result> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Ack absent')), 4_000)
    send((result) => {
      clearTimeout(timer)
      resolve(result)
    })
  })
}
async function connect() {
  const socket: Socket<ServerEvents, ClientEvents> = io(`http://127.0.0.1:${backend.port}`, {
    transports: ['websocket'],
    reconnection: false,
    addTrailingSlash: false,
  })
  sockets.push(socket)
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve())
    socket.once('connect_error', reject)
  })
  return socket
}
try {
  const base = `http://127.0.0.1:${backend.port}`
  for (const route of ['health', 'catalog', 'state', 'leaderboard']) {
    const response = await fetch(`${base}/api/${route}`)
    check(response.ok, `GET /api/${route}`)
    check(response.headers.get('cache-control') === 'no-store', `${route} non mis en cache`)
  }
  for (const route of ['rooms', 'questions', 'users'])
    check((await fetch(`${base}/api/${route}`)).status === 404, `Aucune API publique /${route}`)
  const host = await connect(),
    player = await connect(),
    outsider = await connect()
  check(
    host.io.engine.transport.name === 'websocket',
    'WebSocket réel via TCP sur un backend isolé',
  )
  const claimed = await request((ack) => host.emit('presenter:claim', {}, ack))
  check(
    claimed.ok && claimed.token?.length === 64,
    'Présentateur automatique, capacité interne sans code à saisir',
  )
  const cmd = (command: Command) => request((ack) => host.emit('presenter:command', command, ack))
  check(
    (await request((ack) => player.emit('stand:watch', {}, ack))).ok,
    'Joueur connecté sans compte',
  )
  check(
    !(await request((ack) => outsider.emit('presenter:claim', {}, ack))).ok,
    'Un seul contrôleur actif',
  )
  check(
    !(await request((ack) => player.emit('presenter:command', { type: 'skip' }, ack))).ok,
    'Commandes privées protégées',
  )
  check(backend.stand.playerState().feedback === null, 'Aucun corrigé avant réponse')
  check(!('answer' in backend.stand.playerState()), 'Aucun champ answer public')
  check(
    (
      await cmd({
        type: 'settings',
        settings: { theme: 'capitales', difficulty: 4, allowRetry: true },
      })
    ).ok,
    'Thème et niveau expert',
  )
  check(backend.stand.playerState().question.points === 40, 'Barème expert 40 points')
  check((await cmd({ type: 'rename', nickname: 'Visiteur smoke' })).ok, 'Pseudo facultatif')
  check((await cmd({ type: 'hint' })).ok, 'Indice publié')
  check(backend.stand.playerState().question.points === 35, 'Pénalité indice de 5 points')
  const state = backend.stand.playerState(),
    answer = backend.stand.presenterState().answer
  const retry = await request((ack) =>
    player.emit(
      'player:submit',
      { turn: state.question.turn, pin: wrongPin(answer.country.id) },
      ack,
    ),
  )
  check(retry.ok && retry.retry, 'Seconde chance proposée')
  check(
    JSON.stringify(retry) === '{"ok":true,"retry":true}',
    'Ack de seconde chance sans corrigé ni coordonnées',
  )
  check(backend.stand.playerState().feedback === null, 'État public encore confidentiel')
  check(
    (
      await request((ack) =>
        player.emit(
          'player:submit',
          { turn: state.question.turn, pin: landPin(answer.country.id) },
          ack,
        ),
      )
    ).ok,
    'Choix géographique validé par le serveur',
  )
  check(backend.stand.playerState().participant.score === 18, 'Score demi-barème arrondi')
  check(
    backend.stand.playerState().feedback?.country.id === answer.country.id,
    'Pays révélé après résolution seulement',
  )
  check(
    !(
      await request((ack) =>
        player.emit(
          'player:submit',
          { turn: state.question.turn, pin: landPin(answer.country.id) },
          ack,
        ),
      )
    ).ok,
    'Double validation refusée',
  )
  check((await cmd({ type: 'new-participant' })).ok, 'Passage terminé et nouveau visiteur prêt')
  const stored = JSON.parse(await readFile(join(directory, 'users.json'), 'utf8'))
  check(
    stored.users.length === 1 && stored.leaderboard.length === 1,
    'Utilisateurs et classement enregistrés dans le JSON isolé',
  )
  check(
    backend.stand.playerState().leaderboard[0].nickname === 'Visiteur smoke',
    'Classement diffusé',
  )
  check(backend.stand.playerState().participant.score === 0, 'Nouveau visiteur à zéro')
  console.log(`\n${checks} vérifications smoke réussies. Aucune donnée réelle modifiée.`)
} finally {
  sockets.forEach((socket) => socket.disconnect())
  await backend.close()
  await rm(directory, { recursive: true, force: true })
}

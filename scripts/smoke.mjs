/**
 * Test de bout en bout du moteur de jeu (sans navigateur).
 * Usage : node scripts/smoke.mjs [http://localhost:3000]
 */
import { io } from 'socket.io-client'

const URL = process.argv[2] || 'http://localhost:3000'
const log = (...args) => console.log('·', ...args)
let failures = 0

function check(condition, label) {
  if (condition) log(`OK  ${label}`)
  else {
    failures += 1
    console.error(`KO  ${label}`)
  }
}

const emitAck = (socket, event, payload) =>
  new Promise((resolve) => socket.emit(event, payload, resolve))

/** Attend un état correspondant au prédicat (sur l'état courant, mis en mémoire). */
function waitFor(getter, predicate = () => true, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const tick = () => {
      const state = getter()
      if (state && predicate(state)) return resolve(state)
      if (Date.now() - started > timeout) return reject(new Error('état non reçu'))
      setTimeout(tick, 25)
    }
    tick()
  })
}

const host = io(URL, { transports: ['websocket'] })
const player = io(URL, { transports: ['websocket'] })

let hostState = null
let playerState = null
host.on('state', (s) => {
  hostState = s
})
player.on('state', (s) => {
  playerState = s
})

const waitHost = (predicate, timeout) => waitFor(() => hostState, predicate, timeout)
const waitPlayer = (predicate, timeout) => waitFor(() => playerState, predicate, timeout)

await Promise.all([waitHost(), waitPlayer()]).catch(() => {})

const created = await emitAck(host, 'host:create', {
  theme: 'tous',
  difficulty: 'mixte',
  count: 3,
  allowRetry: true,
})
check(created?.ok && created.code?.length === 5, `salle créée (${created?.code})`)

const badJoin = await emitAck(player, 'player:join', { code: 'ZZZZZ', pseudo: 'Test' })
check(!badJoin?.ok, 'mauvais code refusé')

const joined = await emitAck(player, 'player:join', { code: created.code, pseudo: 'Amina' })
check(joined?.ok, 'joueur admis dans la salle')

const lobby = await waitHost((s) => s.player?.pseudo === 'Amina')
check(lobby.status === 'lobby', 'le présentateur voit le joueur')

const started = await emitAck(host, 'host:command', { code: created.code, type: 'start' })
check(started?.ok, 'partie démarrée')

const p1 = await waitPlayer((s) => s.status === 'playing' && s.question)
check(Boolean(p1.question?.question), 'question affichée au joueur')
const rawPlayer = JSON.stringify(p1)
check(!('answer' in (p1.question ?? {})), "la réponse attendue n'est pas dans l'état joueur")
check(!rawPlayer.includes('"accepted"'), 'les variantes ne sont pas exposées au joueur')
check(!rawPlayer.includes('"explanation"'), "l'explication reste privée pendant la question")

const h1 = await waitHost((s) => s.status === 'playing' && s.current)
check(Boolean(h1.current?.answer), 'le présentateur voit la réponse attendue')

const hint = await emitAck(host, 'host:command', { code: created.code, type: 'hint' })
check(hint?.ok, 'indice envoyé')

const withHint = await waitPlayer((s) => (s.question?.hintLevel ?? 0) > 0)
check(withHint.question.hints.length === 1, 'le joueur reçoit un seul indice')

const submitted = await emitAck(player, 'player:submit', {
  code: created.code,
  text: 'une réponse',
  pin: [10, 20],
})
check(submitted?.ok, 'réponse soumise')

const h2 = await waitHost((s) => s.current?.status === 'answered')
check(h2.current.autoMatch === false, 'saisie non reconnue signalée au présentateur')
check(typeof h2.current.distanceKm === 'number', 'distance du repère calculée')

const correct = await emitAck(host, 'host:command', { code: created.code, type: 'correct' })
check(correct?.ok, 'réponse validée')

const fb = await waitPlayer((s) => s.status === 'playing' && s.feedback)
check(fb.feedback.outcome === 'correct', 'résultat correct reçu par le joueur')
check(Boolean(fb.feedback.answer), 'la réponse est révélée après validation seulement')
check(fb.score > 0, `score mis à jour (${fb.score})`)
check(fb.found.length === 1, 'pays ajouté au carnet de voyage')

// Question 2 : seconde chance
await emitAck(host, 'host:command', { code: created.code, type: 'next' })
const q2 = await waitPlayer((s) => s.progress?.index === 2 && s.question)
check(q2.feedback === null, 'nouvelle question sans feedback résiduel')

await emitAck(player, 'player:submit', { code: created.code, text: 'faux', pin: null })
const retry = await emitAck(host, 'host:command', { code: created.code, type: 'incorrect' })
check(retry?.ok && retry.retry === true, 'seconde chance accordée')
const q2b = await waitPlayer((s) => s.question?.attempts === 1 && s.question?.status === 'open')
check(q2b.question.status === 'open', 'le joueur peut répondre à nouveau')

await emitAck(host, 'host:command', { code: created.code, type: 'skip' })
const skipped = await waitPlayer((s) => s.feedback?.outcome === 'skipped')
check(skipped.feedback.points === 0, 'question passée sans point')

await emitAck(host, 'host:command', { code: created.code, type: 'next' })
const q3 = await waitPlayer((s) => s.progress?.index === 3 && s.question?.status === 'open')
check(Boolean(q3.question), 'troisième question affichée')

const tooSoon = await emitAck(host, 'host:command', { code: created.code, type: 'next' })
check(!tooSoon?.ok, 'impossible de passer à la suite sans résoudre la question')

await emitAck(host, 'host:command', { code: created.code, type: 'skip' })
await emitAck(host, 'host:command', { code: created.code, type: 'next' })
const finished = await waitPlayer((s) => s.status === 'finished')
check(Boolean(finished.finished?.badge), `badge de fin : ${finished.finished?.badge?.label}`)

// Deuxième joueur refusé (une place par salle)
const intruder = io(URL, { transports: ['websocket'] })
await new Promise((r) => intruder.on('connect', r))
const rejected = await emitAck(intruder, 'player:join', { code: created.code, pseudo: 'Intrus' })
check(!rejected?.ok, 'second joueur refusé dans la salle')
const stolenSubmit = await emitAck(intruder, 'player:submit', { code: created.code, text: 'triche', pin: null })
check(!stolenSubmit?.ok, 'soumission refusée à un socket étranger')
intruder.close()

// Reconnexion
const rejoin = await emitAck(player, 'player:rejoin', { code: created.code, playerId: joined.playerId })
check(rejoin?.ok, 'reconnexion du joueur')

// Sécurité : le jeton du présentateur est requis
const other = io(URL, { transports: ['websocket'] })
await new Promise((r) => other.on('connect', r))
const stolen = await emitAck(other, 'host:rejoin', { code: created.code, token: 'mauvais-jeton' })
check(!stolen?.ok, 'jeton présentateur invalide rejeté')
const wrongHost = await emitAck(other, 'host:command', { code: created.code, type: 'next' })
check(!wrongHost?.ok, 'commande refusée à un socket non présentateur')
other.close()

host.close()
player.close()

console.log(failures === 0 ? '\nTous les contrôles sont passés.' : `\n${failures} contrôle(s) en échec.`)
process.exit(failures === 0 ? 0 : 1)

/**
 * Test de bout en bout du moteur de jeu (sans navigateur).
 * Usage : node scripts/smoke.mjs [http://localhost:3000]
 *
 * Le joueur répond en cliquant sur la carte : le serveur vérifie le pays cliqué
 * et la distance au lieu attendu, puis applique le barème.
 */
import { io } from 'socket.io-client'
import { countryAt } from '../server/geo.mjs'
import { distanceKm } from '../server/questions.mjs'

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

const emitAck = (socket, event, payload) =>
  new Promise((resolve) => socket.emit(event, payload, resolve))

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

await Promise.all([host, player].map((socket) => new Promise((resolve, reject) => {
  if (socket.connected) return resolve()
  const timer = setTimeout(() => reject(new Error('connexion impossible')), 5000)
  socket.once('connect', () => { clearTimeout(timer); resolve() })
})))

/* ------------------------------ mise en place ---------------------------- */

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

/* -------------------------------- question 1 ----------------------------- */

const p1 = await waitPlayer((s) => s.status === 'playing' && s.question)
check(Boolean(p1.question?.question), 'question affichée au joueur')
const rawPlayer = JSON.stringify(p1)
check(!rawPlayer.includes('"answer"'), "la réponse attendue n'est pas dans l'état joueur")
check(!rawPlayer.includes('"accepted"'), 'les variantes ne sont pas exposées au joueur')
check(!rawPlayer.includes('"explanation"'), "l'explication reste privée pendant la question")
check(!rawPlayer.includes('"isoN"'), 'le pays attendu reste caché pendant la question')

const h1 = await waitHost((s) => s.status === 'playing' && s.current)
check(Boolean(h1.current?.answer), 'le présentateur voit la réponse attendue')

const noPin = await emitAck(player, 'player:submit', { code: created.code, pin: null })
check(!noPin?.ok, 'réponse sans clic sur la carte refusée')

const hint = await emitAck(host, 'host:command', { code: created.code, type: 'hint' })
check(hint?.ok, 'indice envoyé')
const withHint = await waitPlayer((s) => (s.question?.hintLevel ?? 0) > 0)
check(withHint.question.hints.length === 1, 'le joueur reçoit un seul indice')

// Un pays éloigné de la cible → seconde chance accordée.
const wrongPin = [[18, 12], [139.69, 35.69], [-77.04, 38.91]].find((pin) =>
  countryAt(...pin)?.id !== h1.current.isoN && distanceKm(pin, h1.current.coords) > 400
)
const first = await emitAck(player, 'player:submit', { code: created.code, pin: wrongPin })
check(first?.ok && first.precision === 'miss', 'mauvais clic détecté')
check(!('targetCountry' in first) && !('coords' in first) && !('isoN' in first) && !('distanceKm' in first),
  'accusé de réception de seconde chance sans pays attendu ni coordonnées privées')
const retry = await waitPlayer((s) => s.question?.attempts === 1 && s.question?.status === 'open')
check(retry.question.status === 'open', 'seconde chance : la question reste ouverte')
check(retry.feedback === null, 'la réponse reste cachée pendant la seconde chance')

// Deuxième mauvais clic → la question est résolue en échec
const second = await emitAck(player, 'player:submit', { code: created.code, pin: wrongPin })
check(second?.ok && second.outcome === 'incorrect', 'second échec résolu')
const missed = await waitPlayer((s) => s.status === 'playing' && s.feedback)
check(missed.feedback.precision === 'miss' && missed.feedback.points === 0, 'aucun point pour un mauvais clic')
check(missed.score === 0, 'score inchangé après échec')

// Correction du présentateur
const fix = await emitAck(host, 'host:command', { code: created.code, type: 'correct' })
check(fix?.ok, 'le présentateur peut accorder les points')
const granted = await waitPlayer((s) => s.score > 0)
check(granted.score > 0, `points accordés après correction (${granted.score})`)
check(granted.feedback.precision === 'force', 'verdict signalé comme corrigé')

/* -------------------------------- question 2 ----------------------------- */

await emitAck(host, 'host:command', { code: created.code, type: 'next' })
const q2 = await waitPlayer((s) => s.progress?.index === 2 && s.question)
check(q2.feedback === null, 'nouvelle question sans feedback résiduel')
const h2 = await waitHost((s) => s.progress?.index === 2 && s.current)
// Certains lieux sont en mer (Grande Barrière) ou exactement sur une frontière
// (Everest). Le joueur choisit un pays : on clique sur une terre proche du lieu.
const [lon, lat] = h2.current.coords
let target = null
for (const offset of [0, 0.05, 0.1, 0.25, 0.5, 1, 2]) {
  for (const [dx, dy] of [[0, 1], [1, 0], [1, 1], [-1, 0], [0, -1], [-1, -1], [1, -1], [-1, 1]]) {
    const candidate = [lon + dx * offset, lat + dy * offset]
    if (countryAt(...candidate)?.id === h2.current.isoN && distanceKm(candidate, h2.current.coords) <= 400) {
      target = candidate
      break
    }
  }
  if (target) break
}
if (!target) throw new Error(`Pas de terre proche du lieu attendu : ${h2.current.id}`)

const exact = await emitAck(player, 'player:submit', { code: created.code, pin: target })
check(exact?.ok && exact.precision === 'exact', 'clic sur le lieu exact reconnu')
const solved = await waitPlayer((s) => s.feedback?.outcome === 'correct')
check(solved.feedback.points > 0, `points attribués (${solved.feedback.points})`)
check(solved.feedback.answer, 'la réponse est révélée après résolution')
check(solved.score > granted.score, 'score cumulé')

// Le présentateur peut retirer les points
const removed = await emitAck(host, 'host:command', { code: created.code, type: 'incorrect' })
check(removed?.ok, 'le présentateur peut retirer les points')
const revoked = await waitPlayer((s) => s.feedback?.outcome === 'incorrect')
check(revoked.score === granted.score, 'score revenu au niveau précédent après retrait')

/* -------------------------------- question 3 ----------------------------- */

await emitAck(host, 'host:command', { code: created.code, type: 'next' })
const q3 = await waitPlayer((s) => s.progress?.index === 3 && s.question)
check(Boolean(q3.question), 'troisième question affichée')

const tooSoon = await emitAck(host, 'host:command', { code: created.code, type: 'next' })
check(!tooSoon?.ok, 'impossible de passer à la suite sans résoudre la question')

await emitAck(host, 'host:command', { code: created.code, type: 'skip' })
const skipped = await waitPlayer((s) => s.feedback?.outcome === 'skipped')
check(skipped.feedback.points === 0, 'question passée sans point')

await emitAck(host, 'host:command', { code: created.code, type: 'next' })
const finished = await waitPlayer((s) => s.status === 'finished')
check(Boolean(finished.finished?.badge), `badge de fin : ${finished.finished?.badge?.label}`)

/* -------------------------------- sécurité ------------------------------- */

const intruder = io(URL, { transports: ['websocket'] })
await new Promise((r) => intruder.on('connect', r))
const rejected = await emitAck(intruder, 'player:join', { code: created.code, pseudo: 'Intrus' })
check(!rejected?.ok, 'second joueur refusé dans la salle')
const stolenSubmit = await emitAck(intruder, 'player:submit', { code: created.code, pin: [0, 0] })
check(!stolenSubmit?.ok, 'soumission refusée à un socket étranger')

const stolen = await emitAck(intruder, 'host:rejoin', { code: created.code, token: 'mauvais-jeton' })
check(!stolen?.ok, 'jeton présentateur invalide rejeté')
const wrongHost = await emitAck(intruder, 'host:command', { code: created.code, type: 'next' })
check(!wrongHost?.ok, 'commande refusée à un socket non présentateur')
intruder.close()

const rejoin = await emitAck(player, 'player:rejoin', { code: created.code, playerId: joined.playerId })
check(rejoin?.ok, 'reconnexion du joueur')

host.close()
player.close()

console.log(failures === 0 ? '\nTous les contrôles sont passés.' : `\n${failures} contrôle(s) en échec.`)
process.exit(failures === 0 ? 0 : 1)

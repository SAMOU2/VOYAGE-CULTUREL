/** HTTP et vrais WebSockets sur des JSON temporaires : ne touche jamais au stand réel. */
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startBackend } from '../backend/src/app.js'
import {
  claim,
  command,
  connect,
  response,
  snapshot,
  watch,
  type Client,
} from '../tests/support/network.js'
import { landPin, turnOf, wrongPin } from '../tests/unit/helpers.js'

const directory = await mkdtemp(join(tmpdir(), 'algomania-smoke-')),
  usersFile = join(directory, 'users.json')
let backend = await startBackend({ port: 0, host: '127.0.0.1', usersFile }),
  checks = 0
const sockets: Client[] = []
function check(condition: unknown, label: string): asserts condition {
  assert.ok(condition, label)
  checks++
  console.log(`✓ ${label}`)
}
const client = async () => {
  const socket = await connect(`http://127.0.0.1:${backend.port}`)
  sockets.push(socket)
  return socket
}
try {
  const base = `http://127.0.0.1:${backend.port}`
  for (const route of ['health', 'current-question', 'state', 'catalog', 'facts', 'leaderboard']) {
    const result = await fetch(`${base}/api/${route}`)
    check(result.ok, `GET /api/${route}`)
    check(result.headers.get('cache-control') === 'no-store', `${route} non mis en cache`)
  }
  for (const route of ['rooms', 'questions', 'users', 'attempts', 'answer'])
    check((await fetch(`${base}/api/${route}`)).status === 404, `Pas d’API publique /${route}`)
  const host = await client(),
    player = await client(),
    outsider = await client(),
    claimed = await claim(host)
  check(claimed.ok && claimed.token.length === 64, 'Pupitre automatique, capacité interne opaque')
  check((await watch(player)).ok, 'Écran joueur connecté sans compte ni code')
  check(!(await claim(outsider)).ok, 'Un seul pupitre actif')
  check(!(await command(player, { type: 'reset' })).ok, 'Commandes privées protégées')
  check(
    !(await response((ack) => player.emit('player:begin', { fullName: '' }, ack))).ok,
    'Nom complet obligatoire',
  )
  check(
    (
      await command(host, {
        type: 'settings',
        settings: {
          ...backend.stand.settings,
          mode: 'world',
          questionsPerStage: 2,
          allowRetry: true,
        },
      })
    ).ok,
    'Monde entier et 2 questions par niveau configurés',
  )
  check(
    (
      await response((ack) =>
        player.emit('player:begin', { fullName: 'Visiteur Démonstration' }, ack),
      )
    ).ok,
    'Début de tentative nommé',
  )
  const initial = backend.stand.playerState(),
    oldTurn = turnOf(backend.stand)
  check(initial.game!.totalQuestions === 8, 'Quatre niveaux, huit questions au total')
  check(
    !('answer' in initial) && !('countryId' in initial.question!) && initial.feedback === null,
    'Corrigé absent du snapshot public',
  )
  check(
    (await command(host, { type: 'replace-question', ...oldTurn })).ok,
    'Question remplacée au pupitre',
  )
  check(
    backend.stand.playerState().game!.answered === 0 && turnOf(backend.stand).turn > oldTurn.turn,
    'Remplacement sans progression, nouveau tour',
  )
  check((await command(host, { type: 'hint', ...turnOf(backend.stand) })).ok, 'Un indice partagé')
  const answer = backend.stand.presenterState().answer!
  const retry = await response((ack) =>
    player.emit(
      'player:submit',
      { ...turnOf(backend.stand), pin: wrongPin(answer.country.id) },
      ack,
    ),
  )
  check(JSON.stringify(retry) === '{"ok":true,"retry":true}', 'Ack de seconde chance sans corrigé')
  const publicSnapshot = await snapshot(player)
  check(
    publicSnapshot.ok &&
      publicSnapshot.state.feedback === null &&
      !('answer' in publicSnapshot.state),
    'Snapshot réseau encore confidentiel',
  )
  check(
    (
      await response((ack) =>
        player.emit(
          'player:submit',
          { ...turnOf(backend.stand), pin: landPin(answer.country.id) },
          ack,
        ),
      )
    ).ok,
    'Réponse juste validée sur une vraie terre',
  )
  check(
    backend.stand.playerState().feedback?.outcome === 'correct',
    'Corrigé public seulement après résolution',
  )
  check(
    backend.stand.playerState().game!.score === 5,
    'Plancher de points après indice et seconde chance',
  )
  while (backend.stand.playerState().game!.status === 'playing') {
    assert.ok((await response((ack) => player.emit('player:next', turnOf(backend.stand), ack))).ok)
    const pin = landPin(backend.stand.presenterState().answer!.country.id)
    assert.ok(
      (
        await response((ack) =>
          player.emit('player:submit', { ...turnOf(backend.stand), pin }, ack),
        )
      ).ok,
    )
  }
  const finished = backend.stand.playerState()
  check(
    finished.phase === 'finished' && finished.game!.answered === 8,
    'Fin de partie après les quatre niveaux',
  )
  check(
    finished.game!.score === 195 && finished.game!.stage === 4,
    'Barème 10/20/30/40 et progression expert',
  )
  check(
    finished.leaderboard.length === 1 && finished.leaderboard[0].score === 195,
    'Meilleur score sauvegardé au classement',
  )
  const returning = await response((ack) =>
    player.emit('player:begin', { fullName: 'Visiteur Démonstration' }, ack),
  )
  check(
    returning.ok && returning.returning?.attempts === 1,
    'Nom connu : confirmation explicite demandée',
  )
  check(
    (
      await response((ack) =>
        player.emit(
          'player:begin',
          { fullName: 'Visiteur Démonstration', confirmExisting: true },
          ack,
        ),
      )
    ).ok,
    'Rejouer avec le même profil',
  )
  check(
    backend.stand.store.adminLeaderboard()[0].attempts === 2 &&
      backend.stand.store.leaderboard().length === 1,
    'Deux tentatives, une seule ligne',
  )
  const before = backend.stand.playerState(),
    data = JSON.parse(await readFile(usersFile, 'utf8'))
  check(
    data.version === 2 && data.attempts.length === 2 && data.attempts[0].answers.length === 8,
    'JSON v2 : toutes les tentatives et réponses détaillées',
  )
  check(data.attempts[0].answers[0].tries === 2, 'Nombre d’essais conservé')
  sockets.forEach((socket) => socket.disconnect())
  await backend.close()
  backend = await startBackend({ port: 0, host: '127.0.0.1', usersFile })
  check(
    backend.stand.playerState().question?.id === before.question?.id &&
      backend.stand.playerState().question?.turn === before.question?.turn,
    'Question active restaurée après redémarrage',
  )
  check(
    backend.stand.settings.mode === 'world' && backend.stand.settings.allowRetry,
    'Réglages locaux restaurés',
  )
  check(
    !(await backend.stand.submit({ ...oldTurn, pin: landPin(answer.country.id) })).ok,
    'Validation ancienne rejetée après redémarrage',
  )
  check(
    (await backend.stand.command({ type: 'end-game', attemptId: turnOf(backend.stand).attemptId }))
      .ok,
    'Fin anticipée persistée',
  )
  check(
    (await backend.stand.leave({ attemptId: turnOf(backend.stand).attemptId })).ok,
    'Retour à l’accueil sans supprimer l’historique',
  )
  check(
    backend.stand.store.leaderboard()[0].score === 195 &&
      backend.stand.store.adminLeaderboard()[0].attempts === 2,
    'Meilleur score et tentatives préservés',
  )
  console.log(`\n${checks} contrôles smoke réussis.`)
} finally {
  sockets.forEach((socket) => socket.disconnect())
  await backend.close()
  await rm(directory, { recursive: true, force: true })
}

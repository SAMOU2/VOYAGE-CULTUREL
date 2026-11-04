import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, rename, rm } from 'node:fs/promises'
import { fixture, landPin, wrongPin } from './helpers.js'

function privateKeys(value: unknown): string[] {
  if (!value || typeof value !== 'object') return []
  return Object.entries(value).flatMap(([key, child]) =>
    ['answer', 'countryId', 'country', 'location', 'source', 'explanation'].includes(key)
      ? [key]
      : privateKeys(child),
  )
}

test('accès direct : une question et un visiteur anonymes, aucun modèle de salle/partie', async (t) => {
  const { stand } = await fixture(t),
    state = stand.playerState()
  assert.equal(state.phase, 'question')
  assert.equal(state.participant.nickname, 'Visiteur 1')
  assert.equal(state.participant.score, 0)
  assert.equal(state.question.difficulty, 1)
  for (const obsolete of ['room', 'rooms', 'code', 'rounds', 'queue', 'maxQuestions'])
    assert.ok(!(obsolete in state))
})
test('avant résolution : aucun pays cible, coordonnées, source ou corrigé dans la vue joueur', async (t) => {
  const { stand } = await fixture(t)
  assert.deepEqual(privateKeys(stand.playerState()), [])
  assert.ok(stand.presenterState().answer.country.id)
  await stand.command({ type: 'hint' })
  assert.deepEqual(privateKeys(stand.playerState()), [])
})
test('bonne réponse calculée côté serveur, points attribués une seule fois', async (t) => {
  const { stand } = await fixture(t),
    before = stand.playerState(),
    pin = landPin(stand.presenterState().answer.country.id)
  const result = await stand.submit({ turn: before.question.turn, pin })
  assert.deepEqual(result, { ok: true })
  const state = stand.playerState()
  assert.equal(state.phase, 'feedback')
  assert.equal(state.feedback?.outcome, 'correct')
  assert.equal(state.participant.score, 10)
  assert.equal(state.participant.correct, 1)
  assert.equal(state.participant.answered, 1)
  assert.equal((await stand.submit({ turn: before.question.turn, pin })).ok, false)
  assert.equal(stand.playerState().participant.score, 10)
})
test('validation simultanée : une seule réponse consomme les points', async (t) => {
  const { stand } = await fixture(t),
    turn = stand.playerState().question.turn,
    pin = landPin(stand.presenterState().answer.country.id)
  const results = await Promise.all([stand.submit({ turn, pin }), stand.submit({ turn, pin })])
  assert.equal(results.filter((result) => result.ok).length, 1)
  assert.equal(stand.playerState().participant.score, 10)
})
test('première erreur : seconde chance sans fuite de corrigé dans l’ack ou le nouvel état', async (t) => {
  const { stand } = await fixture(t),
    before = stand.playerState()
  const ack = await stand.submit({
    turn: before.question.turn,
    pin: wrongPin(stand.presenterState().answer.country.id),
  })
  assert.deepEqual(ack, { ok: true, retry: true })
  assert.deepEqual(privateKeys(ack), [])
  assert.deepEqual(privateKeys(stand.playerState()), [])
  assert.equal(stand.playerState().question.attempts, 1)
  assert.equal(stand.playerState().participant.answered, 0)
  assert.equal(stand.playerState().question.points, 5)
})
test('seconde chance correcte : moitié des points, jamais moins de 5', async (t) => {
  const { stand } = await fixture(t),
    turn = stand.playerState().question.turn,
    id = stand.presenterState().answer.country.id
  await stand.submit({ turn, pin: wrongPin(id) })
  await stand.submit({ turn, pin: landPin(id) })
  assert.equal(stand.playerState().participant.score, 5)
  assert.equal(stand.playerState().feedback?.outcome, 'correct')
})
test('deuxième erreur : résolution et pays cible révélés uniquement après la dernière tentative', async (t) => {
  const { stand } = await fixture(t),
    turn = stand.playerState().question.turn,
    id = stand.presenterState().answer.country.id
  await stand.submit({ turn, pin: wrongPin(id) })
  const ack = await stand.submit({ turn, pin: wrongPin(id) }),
    state = stand.playerState()
  assert.deepEqual(ack, { ok: true })
  assert.equal(state.feedback?.outcome, 'incorrect')
  assert.equal(state.feedback?.country.id, id)
  assert.equal(state.participant.score, 0)
  assert.equal(state.participant.answered, 1)
})
test('océan, valeurs non finies, mauvais schéma : aucune tentative consommée', async (t) => {
  const { stand } = await fixture(t),
    turn = stand.playerState().question.turn
  for (const payload of [
    null,
    {},
    [],
    { turn, pin: ['2', 48] },
    { turn, pin: [2, NaN] },
    { turn, pin: [181, 48] },
    { turn, pin: [2, 48, 0] },
    { turn, pin: [-30, 0] },
  ]) {
    assert.equal((await stand.submit(payload)).ok, false)
    assert.equal(stand.playerState().question.attempts, 0)
    assert.equal(stand.playerState().participant.answered, 0)
  }
})
test('une requête retardée d’une question précédente est rejetée', async (t) => {
  const { stand } = await fixture(t),
    turn = stand.playerState().question.turn,
    pin = landPin(stand.presenterState().answer.country.id)
  await stand.command({ type: 'skip' })
  await stand.command({ type: 'next' })
  assert.equal((await stand.submit({ turn, pin })).ok, false)
  assert.equal(stand.playerState().question.attempts, 0)
})
test('indices : deux maximum, pénalité de 5 points et plancher à 5', async (t) => {
  const { stand } = await fixture(t)
  assert.ok((await stand.command({ type: 'hint' })).ok)
  assert.ok((await stand.command({ type: 'hint' })).ok)
  assert.equal((await stand.command({ type: 'hint' })).ok, false)
  assert.equal(stand.playerState().question.hints.length, 2)
  assert.equal(stand.playerState().question.points, 5)
})
test('la question suivante n’est disponible qu’après un verdict ou Passer', async (t) => {
  const { stand } = await fixture(t),
    before = stand.playerState().question.turn
  assert.equal((await stand.command({ type: 'next' })).ok, false)
  await stand.command({ type: 'skip' })
  assert.equal(stand.playerState().feedback?.outcome, 'skipped')
  assert.equal((await stand.command({ type: 'skip' })).ok, false)
  assert.ok((await stand.command({ type: 'next' })).ok)
  assert.ok(stand.playerState().question.turn > before)
})
test('la décision animateur est réversible sans double score ni double compteur', async (t) => {
  const { stand } = await fixture(t)
  assert.equal((await stand.command({ type: 'correct' })).ok, false)
  await stand.command({ type: 'skip' })
  await stand.command({ type: 'correct' })
  await stand.command({ type: 'correct' })
  assert.equal(stand.playerState().participant.score, 10)
  assert.equal(stand.playerState().participant.correct, 1)
  await stand.command({ type: 'incorrect' })
  await stand.command({ type: 'incorrect' })
  assert.equal(stand.playerState().participant.score, 0)
  assert.equal(stand.playerState().participant.correct, 0)
  assert.equal(stand.playerState().participant.answered, 1)
  await stand.command({ type: 'correct' })
  assert.equal(stand.playerState().participant.score, 10)
})
test('filtre thème/niveau appliqué immédiatement et validé entièrement côté serveur', async (t) => {
  const { stand } = await fixture(t),
    original = { ...stand.settings }
  for (const settings of [
    null,
    {},
    'wrong',
    { ...original, theme: 'inconnu' },
    { ...original, difficulty: 99 },
    { ...original, allowRetry: 'oui' },
  ]) {
    assert.equal((await stand.command({ type: 'settings', settings })).ok, false)
    assert.deepEqual(stand.settings, original)
  }
  await stand.command({
    type: 'settings',
    settings: { theme: 'capitales', difficulty: 4, allowRetry: false },
  })
  assert.equal(stand.playerState().question.themeLabel, 'Capitales')
  assert.equal(stand.playerState().question.difficulty, 4)
  assert.equal(stand.playerState().question.points, 40)
})
test('seconde chance désactivable, sans changer la question ni son indice', async (t) => {
  const { stand } = await fixture(t),
    turn = stand.playerState().question.turn
  await stand.command({ type: 'hint' })
  await stand.command({ type: 'settings', settings: { ...stand.settings, allowRetry: false } })
  assert.equal(stand.playerState().question.turn, turn)
  assert.equal(stand.playerState().question.hints.length, 1)
  await stand.submit({ turn, pin: wrongPin(stand.presenterState().answer.country.id) })
  assert.equal(stand.playerState().phase, 'feedback')
})
test('progression simple → moyen → difficile → expert toutes les deux questions, sans fin de partie', async (t) => {
  const { stand } = await fixture(t),
    levels: number[] = []
  for (let i = 0; i < 16; i++) {
    levels.push(stand.playerState().question.difficulty)
    await stand.command({ type: 'skip' })
    await stand.command({ type: 'next' })
  }
  assert.deepEqual(levels, [1, 1, 2, 2, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4])
  assert.equal(stand.playerState().phase, 'question')
})
test('tirage sans doublon jusqu’à épuisement du filtre puis reprise continue', async (t) => {
  const { stand } = await fixture(t)
  await stand.command({
    type: 'settings',
    settings: { theme: 'capitales', difficulty: 1, allowRetry: true },
  })
  const ids: string[] = []
  for (let i = 0; i < 5; i++) {
    ids.push(stand.playerState().question.id)
    await stand.command({ type: 'skip' })
    await stand.command({ type: 'next' })
  }
  assert.equal(new Set(ids).size, 5)
  assert.ok(ids.includes(stand.playerState().question.id))
})
test('terminer le passage sauvegarde le classement puis repart immédiatement pour un visiteur', async (t) => {
  const { stand, store } = await fixture(t),
    turn = stand.playerState().question.turn
  await stand.command({ type: 'rename', nickname: '  أمين · Léa  ' })
  await stand.submit({ turn, pin: landPin(stand.presenterState().answer.country.id) })
  assert.ok((await stand.command({ type: 'new-participant' })).ok)
  assert.equal(store.count, 1)
  assert.equal(store.leaderboard()[0].nickname, 'أمين · Léa')
  assert.equal(store.leaderboard()[0].score, 10)
  assert.equal(stand.playerState().participant.nickname, 'Visiteur 2')
  assert.equal(stand.playerState().participant.score, 0)
  assert.equal(stand.playerState().phase, 'question')
})
test('pseudos facultatifs normalisés, bornés à 24 caractères et sans contrôles', async (t) => {
  const { stand } = await fixture(t)
  await stand.command({ type: 'rename', nickname: '   \u0000  ' })
  assert.equal(stand.playerState().participant.nickname, 'Visiteur 1')
  await stand.command({ type: 'rename', nickname: 'é'.repeat(50) })
  assert.equal([...stand.playerState().participant.nickname].length, 24)
  assert.equal((await stand.command({ type: 'rename', nickname: 123 })).ok, false)
  assert.equal((await stand.command({ type: 'new-participant', nickname: {} })).ok, false)
})
test('échec disque : le passage reste actif et peut être sauvegardé à nouveau', async (t) => {
  const { stand, store } = await fixture(t)
  await stand.command({ type: 'skip' })
  const previous = stand.participant.id
  await rename(store.file, `${store.file}.backup`)
  await mkdir(store.file)
  const errorLog = t.mock.method(console, 'error', () => undefined)
  assert.equal((await stand.command({ type: 'new-participant' })).ok, false)
  assert.equal(stand.participant.id, previous)
  assert.equal(stand.participant.answered, 1)
  assert.ok(errorLog.mock.callCount() > 0)
  await rm(store.file, { recursive: true })
  await rename(`${store.file}.backup`, store.file)
  assert.ok((await stand.command({ type: 'new-participant' })).ok)
  assert.equal(store.count, 1)
})
test('commandes malformées rejetées sans exception ni mutation', async (t) => {
  const { stand } = await fixture(t),
    before = stand.playerState()
  for (const payload of [
    null,
    undefined,
    12,
    'skip',
    {},
    [],
    { type: 'inconnu' },
    { type: 'settings', settings: 'wrong' },
  ])
    assert.equal((await stand.command(payload)).ok, false)
  assert.deepEqual(stand.playerState(), before)
})

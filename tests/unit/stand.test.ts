import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Stand } from '../../backend/src/stand.js'
import { JsonStore } from '../../backend/src/store.js'
import { SettingsStore } from '../../backend/src/settings.js'
import { countries } from '../../backend/src/data.js'
import {
  DEFAULT_SETTINGS,
  levelFor,
  nameKey,
  normalizeName,
  isValidName,
} from '../../shared/game.js'
import { fixture, landPin, solve, turnOf, wrongPin } from './helpers.js'

async function begin(stand: Stand, name = 'Lina Benali') {
  assert.deepEqual(await stand.begin({ fullName: name }), { ok: true })
}
async function finish(stand: Stand, correct = true) {
  const total = stand.playerState().game!.totalQuestions
  while (stand.playerState().game!.answered < total) {
    assert.equal((await solve(stand, correct)).ok, true)
    if (stand.playerState().game!.status === 'playing')
      assert.equal((await stand.next(turnOf(stand))).ok, true)
  }
}
test('hors partie : pas de question, de joueur anonyme ni de corrigé', async (t) => {
  const { stand } = await fixture(t),
    state = stand.playerState()
  assert.equal(state.phase, 'idle')
  assert.equal(state.question, null)
  assert.equal(state.game, null)
  assert.equal(state.feedback, null)
  assert.equal(stand.presenterState().answer, null)
})
test('nom complet obligatoire dans un champ ; refus des demandes malformées', async (t) => {
  const { stand, store } = await fixture(t)
  for (const payload of [
    null,
    [],
    {},
    'nom',
    { fullName: '' },
    { fullName: ' ' },
    { fullName: 'A' },
    { fullName: '123' },
    { fullName: 'x'.repeat(65) },
    { fullName: 42 },
    { fullName: 'Lina Benali', confirmExisting: 'oui' },
  ])
    assert.equal((await stand.begin(payload)).ok, false)
  assert.equal(store.count, 0)
  assert.equal(stand.playerState().phase, 'idle')
})
test('noms internationaux : Unicode, espaces, normalisation et longueur en caractères', () => {
  assert.equal(normalizeName('  Ame\u0301lie  \u200bBenali\u202e '), 'Amélie Benali')
  assert.equal(nameKey('  LINA  Benali '), nameKey('Lina Benali'))
  assert.equal(nameKey('Ｌina Benali'), nameKey('Lina Benali'))
  assert.equal(isValidName('أمين بن علي'), true)
  assert.equal(isValidName('李明'), true)
})
test('configuration initiale : 33 pays, quatre niveaux, 12 questions, une réponse', async (t) => {
  const { stand } = await fixture(t)
  await begin(stand)
  const state = stand.playerState(),
    game = state.game!
  assert.equal(game.mode, 'club33')
  assert.equal(game.totalQuestions, 12)
  assert.equal(game.questionsPerStage, 3)
  assert.equal(game.stages, 4)
  assert.equal(game.allowRetry, false)
  assert.equal(new Set(game.scopeCountryIds).size, 33)
  assert.ok(game.scopeCountryIds!.includes(stand.presenterState().answer!.country.id))
})
test('deux démarrages simultanés : une seule tentative active et un profil', async (t) => {
  const { stand, store } = await fixture(t)
  const results = await Promise.all([
    stand.begin({ fullName: 'Lina Benali' }),
    stand.begin({ fullName: 'Amine Saadi' }),
  ])
  assert.equal(results.filter((r) => r.ok).length, 1)
  assert.equal(store.count, 1)
  assert.equal(store.history(store.findUser('Lina Benali')!.id).length, 1)
})
test('question publique opaque : ni ID de banque, pays, position, source, ni indices privés', async (t) => {
  const { stand, store } = await fixture(t)
  await begin(stand)
  const state = stand.playerState(),
    question = state.question!,
    answer = stand.presenterState().answer!
  assert.notEqual(question.id, store.session!.questionId)
  assert.match(question.id, /^[a-f\d-]{36}$/)
  assert.equal(state.feedback, null)
  assert.ok(!('answer' in state))
  assert.equal(question.hints.length, 0)
  for (const key of ['countryId', 'country', 'location', 'source', 'explanation', 'questionId'])
    assert.ok(!(key in question))
  assert.equal(answer.hints.length, 2)
  assert.ok(answer.country.id)
  assert.ok(answer.source.url)
})
test('coordonnées invalides et océan : aucun point, compteur ou essai consommé', async (t) => {
  const { stand } = await fixture(t)
  await begin(stand)
  const before = stand.playerState()
  for (const pin of [
    null,
    [],
    [0],
    [0, 0, 0],
    [Infinity, 0],
    [181, 0],
    [0, 91],
    ['2', 48],
    [0, -40],
  ])
    assert.equal((await stand.submit({ ...turnOf(stand), pin })).ok, false)
  assert.deepEqual(stand.playerState(), before)
})
test('sélection des 33 pays : refus serveur d’une terre hors sélection', async (t) => {
  const { stand } = await fixture(t)
  await begin(stand)
  assert.ok(!DEFAULT_SETTINGS.clubCountryIds.includes('152'))
  assert.equal((await stand.submit({ ...turnOf(stand), pin: landPin('152') })).ok, false)
  assert.equal(stand.playerState().game!.answered, 0)
})
test('tentative ou tour périmé : rejet sans mutation', async (t) => {
  const { stand } = await fixture(t)
  await begin(stand)
  const before = stand.playerState(),
    payload = turnOf(stand),
    pin = landPin(stand.presenterState().answer!.country.id)
  for (const change of [{ turn: payload.turn - 1 }, { attemptId: 'ancien' }])
    assert.equal((await stand.submit({ ...payload, ...change, pin })).ok, false)
  assert.deepEqual(stand.playerState(), before)
})
test('bonne réponse : score serveur et une seule résolution malgré 8 validations simultanées', async (t) => {
  const { stand, store } = await fixture(t)
  await begin(stand)
  const payload = { ...turnOf(stand), pin: landPin(stand.presenterState().answer!.country.id) }
  const results = await Promise.all(Array.from({ length: 8 }, () => stand.submit(payload)))
  assert.equal(results.filter((r) => r.ok).length, 1)
  const state = stand.playerState()
  assert.equal(state.phase, 'feedback')
  assert.equal(state.game!.score, 10)
  assert.equal(state.game!.answered, 1)
  assert.equal(state.game!.correct, 1)
  assert.equal(store.attempt(state.game!.id)!.answers.length, 1)
  assert.equal(state.feedback!.outcome, 'correct')
})
test('réponse fausse sans seconde chance : verdict, bonne réponse et zéro point', async (t) => {
  const { stand } = await fixture(t)
  await begin(stand)
  const answer = stand.presenterState().answer!
  assert.deepEqual(await solve(stand, false), { ok: true })
  const state = stand.playerState()
  assert.equal(state.phase, 'feedback')
  assert.equal(state.feedback!.outcome, 'incorrect')
  assert.equal(state.feedback!.country.id, answer.country.id)
  assert.equal(state.game!.score, 0)
  assert.equal(state.game!.answered, 1)
})
test('suivant est impossible avant validation ; il ouvre ensuite un nouveau tour', async (t) => {
  const { stand } = await fixture(t)
  await begin(stand)
  const old = turnOf(stand)
  assert.equal((await stand.next(old)).ok, false)
  await solve(stand)
  assert.equal((await stand.next(old)).ok, true)
  assert.ok(turnOf(stand).turn > old.turn)
  assert.equal(stand.playerState().feedback, null)
  assert.equal((await stand.next(old)).ok, false)
})
test('remplacer une question ne rapporte rien et ne fait pas avancer les compteurs', async (t) => {
  const { stand, store } = await fixture(t)
  await begin(stand)
  const before = stand.playerState(),
    old = store.session!,
    turn = turnOf(stand)
  assert.equal((await stand.command({ type: 'replace-question', ...turn })).ok, true)
  const after = stand.playerState()
  assert.deepEqual(after.game, before.game)
  assert.notEqual(after.question!.id, before.question!.id)
  assert.ok(after.question!.turn > turn.turn)
  assert.notEqual(store.session!.questionId, old.questionId)
  assert.equal(store.attempt(after.game!.id)!.answers.length, 0)
})
test('remplacement : efface les indices/essais, refuse un tour périmé ou déjà résolu', async (t) => {
  const { stand } = await fixture(t, { allowRetry: true })
  await begin(stand)
  const old = turnOf(stand)
  await stand.command({ type: 'hint', ...old })
  await solve(stand, false)
  assert.equal((await stand.command({ type: 'replace-question', ...old })).ok, true)
  assert.equal(stand.playerState().question!.hints.length, 0)
  assert.equal(stand.playerState().question!.attempts, 0)
  assert.equal((await stand.command({ type: 'replace-question', ...old })).ok, false)
  await solve(stand)
  assert.equal((await stand.command({ type: 'replace-question', ...turnOf(stand) })).ok, false)
})
test('deux indices maximum ; pénalité de 5 points, plancher à 5', async (t) => {
  const { stand } = await fixture(t)
  await begin(stand)
  for (const count of [1, 2]) {
    assert.equal((await stand.command({ type: 'hint', ...turnOf(stand) })).ok, true)
    assert.equal(stand.playerState().question!.hints.length, count)
    assert.equal(stand.playerState().question!.points, 5)
  }
  assert.equal((await stand.command({ type: 'hint', ...turnOf(stand) })).ok, false)
  await solve(stand)
  assert.equal(stand.playerState().game!.score, 5)
})
test('seconde chance : ack minimal et état public sans corrigé, puis moitié des points', async (t) => {
  const { stand, store } = await fixture(t, { allowRetry: true })
  await begin(stand)
  assert.deepEqual(await solve(stand, false), { ok: true, retry: true })
  const state = stand.playerState()
  assert.equal(state.phase, 'question')
  assert.equal(state.feedback, null)
  assert.equal(state.game!.answered, 0)
  assert.equal(state.question!.attempts, 1)
  assert.equal(state.question!.points, 5)
  assert.ok(!('answer' in state))
  assert.ok(!('countryId' in state.question!))
  await solve(stand)
  assert.equal(stand.playerState().game!.score, 5)
  assert.equal(store.attempt(state.game!.id)!.answers[0].tries, 2)
})
test('seconde mauvaise réponse : fin de la question, pas de troisième chance', async (t) => {
  const { stand } = await fixture(t, { allowRetry: true })
  await begin(stand)
  await solve(stand, false)
  await solve(stand, false)
  assert.equal(stand.playerState().phase, 'feedback')
  assert.equal(stand.playerState().game!.answered, 1)
  assert.equal(stand.playerState().game!.score, 0)
  assert.equal((await solve(stand)).ok, false)
})
test('progression des 4 niveaux et fin normale des 12 questions : 300 points maximum', async (t) => {
  const { stand, store } = await fixture(t)
  await begin(stand)
  const levels: number[] = []
  for (let i = 0; i < 12; i++) {
    levels.push(stand.playerState().question!.difficulty)
    assert.equal(stand.playerState().game!.stageAnswered, i % 3)
    await solve(stand)
    if (i < 11) await stand.next(turnOf(stand))
  }
  assert.deepEqual(levels, [1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4])
  const state = stand.playerState()
  assert.equal(state.phase, 'finished')
  assert.equal(state.game!.score, 300)
  assert.equal(state.game!.correct, 12)
  assert.equal(state.game!.status, 'completed')
  assert.equal(store.attempt(state.game!.id)!.answers.length, 12)
  assert.equal(store.leaderboard()[0].score, 300)
  assert.equal((await stand.next(turnOf(stand))).ok, false)
})
test('longueur réglable : 2 questions par niveau donnent 8 questions et 200 points', async (t) => {
  const { stand } = await fixture(t, { questionsPerStage: 2 })
  await begin(stand)
  await finish(stand)
  assert.equal(stand.playerState().game!.answered, 8)
  assert.equal(stand.playerState().game!.score, 200)
  assert.equal(stand.playerState().game!.stage, 4)
  for (const n of [0, 1, 2, 3, 6, 8, 40])
    assert.equal(levelFor(n, 2), Math.min(4, 1 + Math.floor(n / 2)))
})
test('réglages appliqués au prochain joueur uniquement, snapshot de la partie inchangé', async (t) => {
  const { stand } = await fixture(t)
  await begin(stand)
  assert.equal(
    (
      await stand.command({
        type: 'settings',
        settings: { ...stand.settings, mode: 'world', questionsPerStage: 2, allowRetry: true },
      })
    ).ok,
    true,
  )
  assert.equal(stand.settings.mode, 'world')
  assert.equal(stand.playerState().game!.mode, 'club33')
  assert.equal(stand.playerState().game!.questionsPerStage, 3)
  assert.equal(stand.playerState().game!.allowRetry, false)
  await stand.command({ type: 'end-game', attemptId: turnOf(stand).attemptId })
  await stand.leave({ attemptId: turnOf(stand).attemptId })
  await begin(stand, 'Amine Saadi')
  assert.equal(stand.playerState().game!.mode, 'world')
  assert.equal(stand.playerState().game!.scopeCountryIds, null)
  assert.equal(stand.playerState().game!.totalQuestions, 8)
})
test('la sélection équilibrée est personnalisable avec exactement 33 pays connus', async (t) => {
  const { stand } = await fixture(t),
    clubCountryIds = stand.settings.clubCountryIds.map((id) => (id === '012' ? '152' : id))
  assert.equal(
    (await stand.command({ type: 'settings', settings: { ...stand.settings, clubCountryIds } })).ok,
    true,
  )
  await begin(stand)
  assert.ok(stand.playerState().game!.scopeCountryIds!.includes('152'))
  assert.ok(!stand.playerState().game!.scopeCountryIds!.includes('012'))
  for (const ids of [
    clubCountryIds.slice(1),
    [...clubCountryIds, '012'],
    clubCountryIds.map(() => '250'),
    clubCountryIds.map((id, i) => (i === 0 ? 'inconnu' : id)),
  ])
    assert.equal(
      (
        await stand.command({
          type: 'settings',
          settings: { ...stand.settings, clubCountryIds: ids },
        })
      ).ok,
      false,
    )
})
test('nom connu : choix explicite requis, pas de nouvelle tentative avant confirmation', async (t) => {
  const { stand, store } = await fixture(t)
  await begin(stand)
  await solve(stand)
  const id = turnOf(stand).attemptId
  await stand.command({ type: 'end-game', attemptId: id })
  const user = store.findUser('Lina Benali')!,
    before = stand.playerState()
  assert.deepEqual(await stand.begin({ fullName: '  LINA  Benali ' }), {
    ok: true,
    returning: { fullName: 'Lina Benali', attempts: 1, bestScore: 10 },
  })
  assert.equal(store.attemptCount(user.id), 1)
  assert.deepEqual(stand.playerState(), before)
  assert.equal((await stand.begin({ fullName: 'lina benali', confirmExisting: true })).ok, true)
  assert.equal(store.count, 1)
  assert.equal(store.attemptCount(user.id), 2)
  assert.equal(stand.playerState().game!.fullName, 'Lina Benali')
})
test('meilleur score : toutes les tentatives, une seule ligne par personne', async (t) => {
  const { stand, store } = await fixture(t)
  await begin(stand)
  await solve(stand)
  await stand.command({ type: 'end-game', attemptId: turnOf(stand).attemptId })
  await stand.begin({ fullName: 'Lina Benali', confirmExisting: true })
  await solve(stand, false)
  await stand.command({ type: 'end-game', attemptId: turnOf(stand).attemptId })
  await stand.begin({ fullName: 'Lina Benali', confirmExisting: true })
  await solve(stand)
  await stand.next(turnOf(stand))
  await solve(stand)
  await stand.command({ type: 'end-game', attemptId: turnOf(stand).attemptId })
  assert.equal(store.leaderboard().length, 1)
  assert.equal(store.leaderboard()[0].score, 20)
  assert.equal(store.adminLeaderboard()[0].attempts, 3)
  assert.equal(store.history(store.leaderboard()[0].userId).length, 3)
})
test('une tentative active ne remplace pas le meilleur score terminé', async (t) => {
  const { stand, store } = await fixture(t)
  await begin(stand)
  await solve(stand)
  await stand.command({ type: 'end-game', attemptId: turnOf(stand).attemptId })
  await stand.begin({ fullName: 'Lina Benali', confirmExisting: true })
  await solve(stand)
  await stand.next(turnOf(stand))
  await solve(stand)
  assert.equal(store.leaderboard()[0].score, 10)
  assert.equal(store.adminLeaderboard()[0].attempts, 2)
})
test('terminer sans réponse conserve l’historique mais n’encombre pas le classement', async (t) => {
  const { stand, store } = await fixture(t)
  await begin(stand)
  const id = turnOf(stand).attemptId
  assert.equal((await stand.command({ type: 'end-game', attemptId: id })).ok, true)
  assert.equal(stand.playerState().phase, 'finished')
  assert.equal(store.attempt(id)!.status, 'stopped')
  assert.equal(store.adminLeaderboard().length, 0)
  assert.equal(store.history(store.findUser('Lina Benali')!.id).length, 1)
})
test('retour au stand ne supprime aucune tentative ; refus pendant une partie active', async (t) => {
  const { stand, store } = await fixture(t)
  await begin(stand)
  const id = turnOf(stand).attemptId
  assert.equal((await stand.leave({ attemptId: id })).ok, false)
  await solve(stand)
  await stand.command({ type: 'end-game', attemptId: id })
  assert.equal((await stand.leave({ attemptId: 'autre' })).ok, false)
  assert.equal((await stand.leave({ attemptId: id })).ok, true)
  assert.equal(stand.playerState().phase, 'idle')
  assert.equal(store.attempt(id)!.score, 10)
})
test('reset arrête proprement le passage, sans vider les résultats ni les profils', async (t) => {
  const { stand, store } = await fixture(t)
  await begin(stand)
  await solve(stand)
  const id = turnOf(stand).attemptId
  assert.equal((await stand.command({ type: 'reset' })).ok, true)
  assert.equal(stand.playerState().phase, 'idle')
  assert.equal(store.attempt(id)!.status, 'stopped')
  assert.equal(store.leaderboard().length, 1)
  assert.equal(store.count, 1)
})
test('correction du présentateur : idempotence et recalcul sans progression supplémentaire', async (t) => {
  const { stand, store } = await fixture(t)
  await begin(stand)
  const turn = turnOf(stand)
  assert.equal((await stand.command({ type: 'correct', ...turn })).ok, false)
  await solve(stand, false)
  for (const type of ['correct', 'correct', 'incorrect', 'incorrect', 'correct'] as const) {
    assert.equal((await stand.command({ type, ...turn })).ok, true)
    assert.equal(stand.playerState().game!.answered, 1)
    assert.equal(stand.playerState().game!.score, type === 'correct' ? 10 : 0)
  }
  assert.equal(store.attempt(turn.attemptId)!.answers.length, 1)
  assert.equal(store.attempt(turn.attemptId)!.correct, 1)
})
test('la dernière réponse reste rectifiable après la fin normale', async (t) => {
  const { stand, store } = await fixture(t, { questionsPerStage: 2 })
  await begin(stand)
  await finish(stand)
  assert.equal((await stand.command({ type: 'incorrect', ...turnOf(stand) })).ok, true)
  assert.equal(store.leaderboard()[0].score, 160)
  assert.equal(store.leaderboard()[0].answered, 8)
  assert.equal((await stand.command({ type: 'correct', ...turnOf(stand) })).ok, true)
  assert.equal(store.leaderboard()[0].score, 200)
})
test('reprise après redémarrage : question, tour, indices et score privés persistés', async (t) => {
  const { stand, store, configuration } = await fixture(t)
  await begin(stand)
  await solve(stand)
  await stand.next(turnOf(stand))
  await stand.command({ type: 'hint', ...turnOf(stand) })
  const before = stand.playerState(),
    restored = new Stand(
      await JsonStore.open(store.file),
      await SettingsStore.open(configuration.file),
    )
  assert.deepEqual(restored.playerState().game, before.game)
  assert.deepEqual(restored.playerState().question, before.question)
  assert.equal(restored.playerState().feedback, null)
  assert.deepEqual(restored.presenterState().answer, stand.presenterState().answer)
  assert.equal((await solve(restored)).ok, true)
})
test('tour global monotone, y compris après reset et redémarrage', async (t) => {
  const { stand, store, configuration } = await fixture(t)
  await begin(stand)
  const old = turnOf(stand)
  await stand.command({ type: 'replace-question', ...old })
  await stand.command({ type: 'reset' })
  const restored = new Stand(
    await JsonStore.open(store.file),
    await SettingsStore.open(configuration.file),
  )
  await begin(restored, 'Amine Saadi')
  assert.ok(turnOf(restored).turn > old.turn)
  assert.equal(
    (await restored.submit({ ...old, pin: landPin(restored.presenterState().answer!.country.id) }))
      .ok,
    false,
  )
})
test('chaque réponse résolue est détaillée dans users.json, historique public expurgé', async (t) => {
  const { stand, store } = await fixture(t)
  await begin(stand)
  await solve(stand, false)
  await stand.next(turnOf(stand))
  await solve(stand)
  const data = JSON.parse(await readFile(store.file, 'utf8')),
    answers = data.attempts[0].answers
  assert.equal(answers.length, 2)
  assert.ok(answers[0].id)
  assert.ok(answers[0].questionId)
  assert.ok(countries.has(answers[0].countryId))
  assert.ok(answers[0].selectedCountryId)
  assert.equal(answers[0].outcome, 'incorrect')
  assert.equal(answers[1].outcome, 'correct')
  assert.ok(Array.isArray(answers[1].pin))
  assert.ok(answers[1].answeredAt)
  assert.ok(!('answers' in store.history(data.users[0].id)[0]))
})
test('commandes non reconnues et payloads malformés : refus explicite', async (t) => {
  const { stand } = await fixture(t)
  for (const payload of [
    null,
    {},
    [],
    { type: 'skip' },
    { type: 'new-participant' },
    { type: 'rename', nickname: 'autre' },
  ])
    assert.equal((await stand.command(payload)).ok, false)
})

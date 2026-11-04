import assert from 'node:assert/strict'
import test from 'node:test'
import iso from 'i18n-iso-countries'
import { countryAt } from '../server/geo.mjs'
import {
  DIFFICULTIES,
  POINTS_BY_DIFFICULTY,
  QUESTIONS,
  THEMES,
  buildQueue,
  difficultyLabel,
  distanceKm,
  getQuestion,
  normalize,
  shuffle,
} from '../server/questions.mjs'
import {
  createRoom,
  evaluatePin,
  hostCommand,
  hostView,
  joinPlayer,
  normalizeDifficulty,
  playerView,
  rooms,
  startGame,
  submitAnswer,
} from '../server/rooms.mjs'

const LEVELS = [1, 2, 3, 4]
const PRIVATE_FIELDS = [
  'answer',
  'accepted',
  'explanation',
  'country',
  'countryCode',
  'isoN',
  'coords',
  'source',
]

/** Un site peut se trouver sur une côte, une frontière ou en mer : cliquer sur une terre proche. */
function landNear(question) {
  const [lon, lat] = question.coords
  for (const offset of [0, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2]) {
    for (const [dx, dy] of [
      [0, 1],
      [1, 0],
      [1, 1],
      [-1, 0],
      [0, -1],
      [-1, -1],
      [1, -1],
      [-1, 1],
    ]) {
      const point = [lon + dx * offset, lat + dy * offset]
      if (countryAt(...point)?.id === question.isoN && distanceKm(point, question.coords) <= 400) return point
    }
  }
  return null
}

function levelsIn(queue) {
  return queue.map((id) => getQuestion(id).difficulty)
}

function quotaFor(queue) {
  return LEVELS.map((level) => levelsIn(queue).filter((value) => value === level).length)
}

function joinedRoom(config = {}) {
  const room = createRoom(config)
  joinPlayer(room, 'Test', 'test-questions')
  return room
}

test('quatre niveaux cohérents : facile, moyen, difficile, expert ; 10 à 40 points', () => {
  assert.deepEqual(
    DIFFICULTIES.map((d) => d.value),
    LEVELS,
  )
  assert.deepEqual(
    DIFFICULTIES.map((d) => d.label),
    ['Facile', 'Moyen', 'Difficile', 'Expert'],
  )
  assert.deepEqual(POINTS_BY_DIFFICULTY, { 1: 10, 2: 20, 3: 30, 4: 40 })
  for (const difficulty of DIFFICULTIES) {
    assert.equal(difficultyLabel(difficulty.value), difficulty.label)
    assert.equal(difficultyLabel(String(difficulty.value)), difficulty.label)
    assert.equal(normalizeDifficulty(difficulty.value), difficulty.value)
    assert.equal(normalizeDifficulty(String(difficulty.value)), difficulty.value)
  }
  for (const value of ['mixte', undefined, null, '', 'expert', 0, 5, 3.5]) {
    assert.equal(normalizeDifficulty(value), 'mixte')
  }
})

test('banque : 120 identifiants uniques et les 72 fiches historiques conservées', () => {
  assert.equal(QUESTIONS.length, 120)
  assert.equal(new Set(QUESTIONS.map((q) => q.id)).size, QUESTIONS.length)
  for (const prefix of ['cap', 'mon', 'lan', 'nat', 'tra', 'his']) {
    for (let i = 1; i <= 12; i += 1) assert.ok(getQuestion(`${prefix}-${String(i).padStart(3, '0')}`))
  }
})

for (const theme of THEMES) {
  test(`fiches ${theme.id} : cinq questions par niveau, pays, indices, source et cible jouable`, () => {
    const pool = QUESTIONS.filter((q) => q.theme === theme.id)
    assert.equal(pool.length, 20)
    for (const level of LEVELS) assert.equal(pool.filter((q) => q.difficulty === level).length, 5)
    for (const q of pool) {
      assert.match(q.id, /^(cap|mon|lan|nat|tra|his)-\d{3}$/)
      assert.ok(LEVELS.includes(q.difficulty), q.id)
      assert.equal(q.answer, q.country, `${q.id} attend un pays et non une ville/langue`)
      assert.ok(q.accepted.includes(q.country), q.id)
      assert.equal(q.isoN, iso.alpha2ToNumeric(q.countryCode), q.id)
      assert.equal(q.hints.length, 2, q.id)
      assert.ok(
        q.hints.every((hint) => typeof hint === 'string' && hint.length > 10),
        q.id,
      )
      assert.ok(q.explanation.length > 30, q.id)
      assert.ok(q.source.label.length > 5, q.id)
      assert.equal(new URL(q.source.url).protocol, 'https:', q.id)
      assert.match(q.question, /pays/i, q.id)
      const expected = normalize(q.country)
      assert.ok(
        !new RegExp(`(?:^|\\s)${expected}(?:\\s|$)`).test(normalize(q.question)),
        `${q.id} donne le pays dans l’énoncé`,
      )
      assert.equal(q.coords.length, 2, q.id)
      assert.ok(q.coords.every(Number.isFinite), q.id)
      assert.ok(Math.abs(q.coords[0]) <= 180 && Math.abs(q.coords[1]) <= 90, q.id)
      assert.ok(landNear(q), `${q.id} : aucune terre du pays attendu à moins de 400 km`)
    }
  })
}

const COUNTS = [3, 5, 8, 10, 12, 15]
for (const theme of ['tous', ...THEMES.map((t) => t.id)]) {
  test(`progression ${theme} : tous les formats montent du facile à l’expert sans doublon`, () => {
    for (const count of COUNTS) {
      for (let run = 0; run < 8; run += 1) {
        const queue = buildQueue({ theme, difficulty: 'mixte', count })
        assert.equal(queue.length, count)
        assert.equal(new Set(queue).size, count)
        const levels = levelsIn(queue)
        assert.equal(levels[0], 1)
        assert.equal(levels.at(-1), 4)
        assert.deepEqual(
          levels,
          [...levels].sort((a, b) => a - b),
        )
        if (count >= 4) {
          assert.deepEqual([...new Set(levels)], LEVELS)
          const quotas = quotaFor(queue)
          assert.ok(Math.max(...quotas) - Math.min(...quotas) <= 1)
        }
        if (theme !== 'tous') assert.ok(queue.every((id) => getQuestion(id).theme === theme))
      }
    }
  })
}

test('quotas progressifs explicites : 1/2/3 questions et formats proposés dans le formulaire', () => {
  const quotas = new Map([
    [1, [1, 0, 0, 0]],
    [2, [1, 0, 0, 1]],
    [3, [1, 0, 1, 1]],
    [5, [2, 1, 1, 1]],
    [8, [2, 2, 2, 2]],
    [10, [3, 3, 2, 2]],
    [12, [3, 3, 3, 3]],
    [15, [4, 4, 4, 3]],
  ])
  for (const [count, expected] of quotas) {
    assert.deepEqual(quotaFor(buildQueue({ theme: 'capitales', difficulty: 'mixte', count })), expected)
  }
})

for (const level of LEVELS) {
  test(`niveau fixe ${level} : filtre strict, numérique ou chaîne, sans répétition pour allonger la partie`, () => {
    for (const difficulty of [level, String(level)]) {
      for (const theme of ['tous', ...THEMES.map((t) => t.id)]) {
        const queue = buildQueue({ theme, difficulty, count: 15 })
        assert.equal(queue.length, theme === 'tous' ? 15 : 5)
        assert.equal(new Set(queue).size, queue.length)
        for (const id of queue) {
          assert.equal(getQuestion(id).difficulty, level)
          if (theme !== 'tous') assert.equal(getQuestion(id).theme, theme)
        }
      }
    }
  })
}

test('nombre demandé borné aux fiches disponibles, valeurs par défaut et entières', () => {
  assert.equal(buildQueue({ theme: 'capitales', difficulty: 'mixte', count: 1000 }).length, 20)
  assert.equal(buildQueue({ theme: 'tous', difficulty: 'mixte', count: 1000 }).length, 120)
  assert.equal(buildQueue({}).length, 8)
  assert.equal(buildQueue({ count: 5.9 }).length, 5)
  assert.equal(buildQueue({ count: -3 }).length, 1)
  assert.deepEqual(levelsIn(buildQueue({ theme: 'capitales', difficulty: '', count: 5 })), [1, 1, 2, 3, 4])
})

test('filtres vides : pas de repli vers toute la banque et erreur de démarrage sans mutation', () => {
  assert.deepEqual(buildQueue({ theme: 'inconnu', difficulty: 'mixte', count: 8 }), [])
  assert.deepEqual(buildQueue({ theme: 'capitales', difficulty: 99, count: 8 }), [])
  const room = joinedRoom({ theme: 'inconnu' })
  try {
    assert.match(startGame(room).error, /Aucune question/)
    assert.equal(room.status, 'lobby')
    assert.equal(room.startedAt, null)
    assert.equal(room.question, null)
    assert.deepEqual(room.queue, [])
  } finally {
    rooms.delete(room.code)
  }
})

test('mélange : nouveau tableau ; les tirages et les copies de manche ne mutent pas la banque', (t) => {
  const original = JSON.stringify(QUESTIONS)
  t.mock.method(Math, 'random', () => 0)
  const input = [1, 2, 3, 4]
  assert.deepEqual(shuffle(input), [2, 3, 4, 1])
  assert.deepEqual(input, [1, 2, 3, 4])
  buildQueue({ theme: 'tous', difficulty: 'mixte', count: 15 })
  const room = joinedRoom({ difficulty: 4 })
  try {
    assert.ok(startGame(room).ok)
    assert.notEqual(room.question, getQuestion(room.question.id))
    hostCommand(room, 'hint')
    assert.equal(JSON.stringify(QUESTIONS), original)
  } finally {
    rooms.delete(room.code)
  }
})

test('réglage expert sauvegardé côté serveur, puis barème exact de 40 points', () => {
  const room = joinedRoom({ theme: 'capitales', count: 5 })
  try {
    assert.ok(hostCommand(room, 'config', { difficulty: '4' }).ok)
    assert.equal(hostView(room).config.difficulty, 4)
    assert.equal(hostView(room).config.difficultyLabel, 'Expert')
    assert.ok(startGame(room).ok)
    assert.ok(room.queue.every((id) => getQuestion(id).difficulty === 4))
    const pin = landNear(room.question)
    assert.equal(evaluatePin(room, room.question, pin).points, 40)
    assert.equal(submitAnswer(room, { pin }).points, 40)
    assert.equal(playerView(room).score, 40)
  } finally {
    rooms.delete(room.code)
  }
})

test('expert : corrigé privé, deux indices, seconde chance, puis 15 points et correction hôte', () => {
  const room = joinedRoom({ theme: 'capitales', difficulty: 4, count: 5 })
  try {
    assert.ok(startGame(room).ok)
    const before = playerView(room)
    assert.equal(before.question.difficulty, 4)
    assert.equal(before.feedback, null)
    assert.ok(hostView(room).current.answer)
    for (const key of PRIVATE_FIELDS) assert.ok(!Object.hasOwn(before.question, key), key)
    assert.equal(before.question.hints.length, 0)
    assert.ok(hostCommand(room, 'hint').ok)
    assert.equal(evaluatePin(room, room.question, landNear(room.question)).points, 35)
    assert.ok(hostCommand(room, 'hint').ok)
    assert.equal(evaluatePin(room, room.question, landNear(room.question)).points, 30)
    assert.equal(playerView(room).question.hints.length, 2)
    assert.ok(hostCommand(room, 'hint').error)
    const retry = submitAnswer(room, { pin: [3.06, 36.75] })
    assert.ok(retry.retry)
    assert.equal(playerView(room).feedback, null)
    for (const key of [...PRIVATE_FIELDS, 'targetCountry', 'distanceKm']) {
      assert.ok(!Object.hasOwn(retry, key), key)
      assert.ok(!Object.hasOwn(playerView(room).question, key), key)
    }
    const result = submitAnswer(room, { pin: landNear(room.question) })
    assert.equal(result.points, 15)
    assert.equal(playerView(room).feedback.answer, room.question.country)
    assert.equal(playerView(room).score, 15)
    assert.ok(hostCommand(room, 'incorrect').ok)
    assert.equal(playerView(room).score, 0)
    assert.ok(hostCommand(room, 'correct').ok)
    assert.equal(playerView(room).score, 15)
  } finally {
    rooms.delete(room.code)
  }
})

test('déroulement progressif réel : états hôte/joueur synchronisés jusqu’au niveau 4 et au bilan', () => {
  const room = joinedRoom({ theme: 'nature', difficulty: 'mixte', count: 5 })
  try {
    assert.ok(startGame(room).ok)
    const levels = []
    for (let index = 1; index <= 5; index += 1) {
      const host = hostView(room)
      const player = playerView(room)
      assert.equal(player.progress.index, index)
      assert.equal(player.progress.total, 5)
      assert.equal(host.current.id, player.question.id)
      assert.equal(host.current.difficulty, player.question.difficulty)
      for (const key of PRIVATE_FIELDS) assert.ok(!Object.hasOwn(player.question, key), key)
      levels.push(player.question.difficulty)
      assert.ok(hostCommand(room, 'skip').ok)
      assert.ok(hostCommand(room, 'next').ok)
    }
    assert.deepEqual(levels, [1, 1, 2, 3, 4])
    assert.equal(playerView(room).status, 'finished')
    assert.equal(playerView(room).finished.total, 5)
    assert.ok(hostCommand(room, 'restart').ok)
    assert.equal(playerView(room).question.difficulty, 1)
    assert.equal(playerView(room).progress.index, 1)
  } finally {
    rooms.delete(room.code)
  }
})

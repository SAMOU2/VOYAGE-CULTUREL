import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { JsonStore, emptyUsers } from '../../backend/src/store.js'
import { SettingsStore, validateSettings } from '../../backend/src/settings.js'
import { DEFAULT_SETTINGS, nameKey } from '../../shared/game.js'
import type { Difficulty, UsersFile } from '../../shared/types.js'
import { fixture, temporary } from './helpers.js'

async function save(store: JsonStore, fullName: string, points = 10, level: Difficulty = 1) {
  let userId = '',
    attemptId = ''
  await store.transaction((data) => {
    const now = new Date().toISOString()
    let user = data.users.find((u) => u.nameKey === nameKey(fullName))
    if (!user) {
      user = { id: randomUUID(), fullName, nameKey: nameKey(fullName), createdAt: now }
      data.users.push(user)
    }
    userId = user.id
    attemptId = randomUUID()
    data.attempts.push({
      id: attemptId,
      userId,
      fullName: user.fullName,
      startedAt: now,
      finishedAt: now,
      status: 'stopped',
      score: points,
      correct: points ? 1 : 0,
      answered: 1,
      maxLevel: level,
      mode: 'world',
      questionsPerStage: 3,
      answers: [
        {
          id: randomUUID(),
          questionId: 'atlas-250-1',
          countryId: '250',
          difficulty: level,
          selectedCountryId: points ? '250' : '392',
          pin: points ? [2.35, 48.85] : [139.69, 35.68],
          outcome: points ? 'correct' : 'incorrect',
          points,
          hintsUsed: 0,
          tries: 1,
          answeredAt: now,
        },
      ],
    })
  })
  return { userId, attemptId }
}
test('création automatique du users.json v2 vide', async (t) => {
  const { store } = await fixture(t)
  assert.equal(store.count, 0)
  assert.deepEqual(store.leaderboard(), [])
  assert.deepEqual(JSON.parse(await readFile(store.file, 'utf8')), emptyUsers())
})
test('persistance, relecture et noms internationaux : toutes les tentatives sont conservées', async (t) => {
  const { store } = await fixture(t)
  const one = await save(store, 'أمين Benali', 25)
  await save(store, 'أمين Benali', 5)
  const loaded = await JsonStore.open(store.file)
  assert.equal(loaded.count, 1)
  assert.equal(loaded.attemptCount(one.userId), 2)
  assert.equal(loaded.leaderboard()[0].score, 25)
  assert.equal(loaded.leaderboard()[0].fullName, 'أمين Benali')
  assert.equal(loaded.history(one.userId).length, 2)
  assert.ok(!('answers' in loaded.history(one.userId)[0]))
})
test('écritures concurrentes sur le même nom : un profil, douze tentatives, une ligne', async (t) => {
  const { store } = await fixture(t)
  await Promise.all(Array.from({ length: 12 }, (_, i) => save(store, 'Lina Benali', i)))
  const data = JSON.parse(await readFile(store.file, 'utf8'))
  assert.equal(data.users.length, 1)
  assert.equal(data.attempts.length, 12)
  assert.equal(store.adminLeaderboard().length, 1)
  assert.equal(store.adminLeaderboard()[0].attempts, 12)
  assert.equal(store.leaderboard()[0].score, 11)
})
test('file atomique : 25 profils écrits simultanément, aucun perdu ni fichier temporaire', async (t) => {
  const { store, directory } = await fixture(t)
  await Promise.all(
    Array.from({ length: 25 }, (_, i) => save(store, `Joueur ${i} Démonstration`, i)),
  )
  assert.equal(store.count, 25)
  assert.equal(store.leaderboard().length, 20)
  assert.equal(store.adminLeaderboard().length, 25)
  assert.equal(store.leaderboard()[0].score, 24)
  assert.deepEqual(
    (await readdir(directory)).filter((n) => n.endsWith('.tmp')),
    [],
  )
  assert.deepEqual(
    Object.keys(store.leaderboard()[0]).sort(),
    ['rank', 'userId', 'fullName', 'score', 'correct', 'answered', 'level', 'completedAt'].sort(),
  )
})
test('égalité de score : bonnes réponses, puis niveau atteint et date départagent', async (t) => {
  const { store } = await fixture(t)
  await save(store, 'Joueur Facile', 20, 1)
  await save(store, 'Joueur Expert', 20, 4)
  await save(store, 'Joueur Second', 10, 2)
  assert.deepEqual(
    store.leaderboard().map((row) => row.fullName),
    ['Joueur Expert', 'Joueur Facile', 'Joueur Second'],
  )
})
test('les objets lus sont des clones : aucun contournement de la transaction', async (t) => {
  const { store } = await fixture(t),
    saved = await save(store, 'Lina Benali')
  const attempt = store.attempt(saved.attemptId)!
  attempt.score = 9999
  attempt.answers.splice(0)
  const user = store.findUser('Lina Benali')!
  user.fullName = 'Autre personne'
  assert.equal(store.attempt(saved.attemptId)!.score, 10)
  assert.equal(store.attempt(saved.attemptId)!.answers.length, 1)
  assert.equal(store.findUser('Lina Benali')!.fullName, 'Lina Benali')
})
test('JSON corrompu : arrêt explicite et octets originaux préservés', async (t) => {
  const file = join(await temporary(t), 'users.json')
  await writeFile(file, '{pas du json')
  await assert.rejects(JsonStore.open(file), /illisible/)
  assert.equal(await readFile(file, 'utf8'), '{pas du json')
})
test('schéma v2 invalide, références et scores incohérents : aucun écrasement silencieux', async (t) => {
  const { store } = await fixture(t)
  await save(store, 'Lina Benali')
  const valid = await readFile(store.file, 'utf8')
  for (const mutate of [
    (d: UsersFile) => {
      Object.assign(d, { version: 9 })
    },
    (d: UsersFile) => {
      d.attempts[0].userId = 'inconnu'
    },
    (d: UsersFile) => {
      d.attempts[0].score = 999
    },
    (d: UsersFile) => {
      d.users.push(d.users[0])
    },
  ]) {
    const value = JSON.parse(valid)
    mutate(value)
    const raw = JSON.stringify(value)
    await writeFile(store.file, raw)
    await assert.rejects(JsonStore.open(store.file), /incohérent/)
    assert.equal(await readFile(store.file, 'utf8'), raw)
  }
})
test('échec du rename atomique : mémoire intacte, temporaire nettoyé, réessai possible', async (t) => {
  const { store, directory } = await fixture(t)
  await rename(store.file, `${store.file}.backup`)
  await mkdir(store.file)
  await assert.rejects(save(store, 'Lina Benali'))
  assert.equal(store.count, 0)
  assert.deepEqual(
    (await readdir(directory)).filter((n) => n.endsWith('.tmp')),
    [],
  )
  await rm(store.file, { recursive: true })
  await rename(`${store.file}.backup`, store.file)
  await save(store, 'Lina Benali')
  assert.equal(store.count, 1)
})
test('transaction refusée : pas de commit mémoire ou disque, file toujours utilisable', async (t) => {
  const { store } = await fixture(t),
    before = await readFile(store.file, 'utf8')
  await assert.rejects(
    store.transaction((d) => {
      d.nextTurn = -1
    }),
    /incohérent/,
  )
  assert.equal(await readFile(store.file, 'utf8'), before)
  await save(store, 'Lina Benali')
  assert.equal(store.count, 1)
})
test('migration v1 non destructive : backup exact, profils regroupés et chaque score archivé', async (t) => {
  const directory = await temporary(t),
    file = join(directory, 'users.json'),
    date = '2026-11-04T10:00:00.000Z'
  const raw =
    JSON.stringify(
      {
        version: 1,
        users: [
          { id: 'u1', nickname: 'Lina Benali', createdAt: date },
          { id: 'u2', nickname: '  LINA  Benali ', createdAt: date },
        ],
        leaderboard: [
          {
            id: 's1',
            userId: 'u1',
            score: 20,
            correct: 2,
            answered: 3,
            completedAt: date,
            durationMs: 1000,
          },
          {
            id: 's2',
            userId: 'u2',
            score: 10,
            correct: 1,
            answered: 2,
            completedAt: date,
            durationMs: 900,
          },
        ],
      },
      null,
      2,
    ) + '\n'
  await writeFile(file, raw)
  const store = await JsonStore.open(file)
  assert.equal(store.count, 1)
  assert.equal(store.leaderboard().length, 1)
  assert.equal(store.leaderboard()[0].score, 20)
  assert.equal(store.adminLeaderboard()[0].attempts, 2)
  const migrated = JSON.parse(await readFile(file, 'utf8'))
  assert.equal(migrated.version, 2)
  assert.equal(migrated.attempts.length, 2)
  assert.ok(
    migrated.attempts.every(
      (a: { migrated: boolean; answers: unknown[] }) => a.migrated && a.answers.length === 0,
    ),
  )
  const backups = (await readdir(directory)).filter((n) => n.endsWith('.bak'))
  assert.equal(backups.length, 1)
  assert.equal(await readFile(join(directory, backups[0]), 'utf8'), raw)
  await JsonStore.open(file)
  assert.equal((await readdir(directory)).filter((n) => n.endsWith('.bak')).length, 1)
})
test('migration v1 invalide : ni backup trompeur ni réinitialisation', async (t) => {
  const directory = await temporary(t),
    file = join(directory, 'users.json'),
    raw = JSON.stringify({
      version: 1,
      users: [],
      leaderboard: [{ id: 's', userId: 'inconnu', score: 4, correct: 1, answered: 1 }],
    })
  await writeFile(file, raw)
  await assert.rejects(JsonStore.open(file), /incohérent/)
  assert.equal(await readFile(file, 'utf8'), raw)
  assert.deepEqual(await readdir(directory), ['users.json'])
})
test('réglages locaux distincts : copie défensive, persistance et bornes 2–10', async (t) => {
  const directory = await temporary(t),
    file = join(directory, 'settings.json'),
    store = await SettingsStore.open(file)
  assert.deepEqual(store.current, DEFAULT_SETTINGS)
  const clone = store.current
  clone.clubCountryIds.pop()
  assert.equal(store.current.clubCountryIds.length, 33)
  await store.save({ ...store.current, mode: 'world', questionsPerStage: 10, allowRetry: true })
  assert.equal((await SettingsStore.open(file)).current.questionsPerStage, 10)
  for (const q of [0, 1, 11, 2.5, NaN])
    assert.throws(
      () => validateSettings({ ...DEFAULT_SETTINGS, questionsPerStage: q }),
      /exactement 33/,
    )
})
test('échec d’écriture des réglages : ancienne configuration conservée', async (t) => {
  const directory = await temporary(t),
    file = join(directory, 'settings.json'),
    store = await SettingsStore.open(file),
    before = store.current
  await rename(file, `${file}.backup`)
  await mkdir(file)
  await assert.rejects(store.save({ ...before, mode: 'world' }))
  assert.deepEqual(store.current, before)
  assert.deepEqual(
    (await readdir(directory)).filter((n) => n.endsWith('.tmp')),
    [],
  )
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { JsonStore } from '../../backend/src/store.js'
import { fixture, participant, temporary } from './helpers.js'

test('création automatique du JSON users vide', async (t) => {
  const { store } = await fixture(t)
  assert.equal(store.count, 0)
  assert.deepEqual(store.leaderboard(), [])
  assert.deepEqual(JSON.parse(await readFile(store.file, 'utf8')), {
    version: 1,
    users: [],
    leaderboard: [],
  })
})
test('persistance puis relecture du score et du pseudo international', async (t) => {
  const { store } = await fixture(t)
  await store.save(participant(25, { nickname: 'أمين · Léa', correct: 2, answered: 3 }))
  const loaded = await JsonStore.open(store.file)
  assert.equal(loaded.count, 1)
  assert.equal(loaded.leaderboard()[0].score, 25)
  assert.equal(loaded.leaderboard()[0].nickname, 'أمين · Léa')
})
test('un passage vide n’encombre pas le classement', async (t) => {
  const { store } = await fixture(t)
  await store.save(participant(0, { correct: 0, answered: 0 }))
  assert.equal(store.count, 0)
})
test('sauvegardes concurrentes du même visiteur : un seul enregistrement', async (t) => {
  const { store } = await fixture(t),
    visitor = participant()
  await Promise.all(Array.from({ length: 12 }, () => store.save(visitor)))
  assert.equal(store.count, 1)
  const json = JSON.parse(await readFile(store.file, 'utf8'))
  assert.equal(json.users.length, 1)
  assert.equal(json.leaderboard.length, 1)
})
test('file atomique : aucun visiteur perdu lors de 25 écritures proches', async (t) => {
  const { store, directory } = await fixture(t)
  await Promise.all(
    Array.from({ length: 25 }, (_, i) => store.save(participant(i, { nickname: `Visiteur ${i}` }))),
  )
  const json = JSON.parse(await readFile(store.file, 'utf8'))
  assert.equal(json.users.length, 25)
  assert.equal(json.leaderboard.length, 25)
  assert.deepEqual(
    (await readdir(directory)).filter((name) => name.endsWith('.tmp')),
    [],
  )
  const publicRows = store.leaderboard()
  assert.equal(publicRows.length, 20)
  assert.equal(publicRows[0].score, 24)
  assert.deepEqual(
    Object.keys(publicRows[0]).sort(),
    ['rank', 'nickname', 'score', 'correct', 'answered', 'completedAt'].sort(),
  )
})
test('score puis bonnes réponses départagent le classement', async (t) => {
  const { store } = await fixture(t)
  await store.save(participant(10, { nickname: 'A', correct: 1, answered: 3 }))
  await store.save(participant(10, { nickname: 'B', correct: 2, answered: 3 }))
  await store.save(participant(5, { nickname: 'C' }))
  assert.deepEqual(
    store.leaderboard().map((row) => row.nickname),
    ['B', 'A', 'C'],
  )
})
test('JSON corrompu : arrêt explicite, le fichier n’est jamais écrasé', async (t) => {
  const directory = await temporary(t),
    file = join(directory, 'users.json')
  await writeFile(file, '{pas du json')
  await assert.rejects(JsonStore.open(file), /illisible/)
  assert.equal(await readFile(file, 'utf8'), '{pas du json')
})
test('schéma et référence userId invalides sont refusés', async (t) => {
  const directory = await temporary(t),
    file = join(directory, 'users.json')
  await writeFile(
    file,
    JSON.stringify({
      version: 1,
      users: [],
      leaderboard: [{ userId: 'inconnu', score: 4, correct: 1, answered: 1 }],
    }),
  )
  await assert.rejects(JsonStore.open(file), /incohérents/)
})
test('échec du remplacement atomique : mémoire inchangée, fichier temporaire nettoyé, réessai possible', async (t) => {
  const { store, directory } = await fixture(t),
    visitor = participant()
  await rename(store.file, `${store.file}.backup`)
  await mkdir(store.file)
  await assert.rejects(store.save(visitor))
  assert.equal(store.count, 0)
  assert.equal((await readdir(directory)).filter((name) => name.endsWith('.tmp')).length, 0)
  await rm(store.file, { recursive: true })
  await rename(`${store.file}.backup`, store.file)
  await store.save(visitor)
  assert.equal(store.count, 1)
})

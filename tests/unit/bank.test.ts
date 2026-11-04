import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  bank,
  catalog,
  countries,
  countryFeatures,
  countryIndex,
  questions,
} from '../../backend/src/data.js'
import { isCoordinates } from '../../shared/geometry.js'
import { landPin } from './helpers.js'

test('catalogue : 240 identifiants uniques, ISO ou régions Natural Earth stables', () => {
  assert.equal(countries.size, 240)
  assert.equal(countryFeatures.length, 240)
  assert.equal(new Set(countryFeatures.map((f) => f.id)).size, 240)
  for (const country of countries.values()) {
    assert.match(country.id, /^(\d{3}|ne-[a-z-]+)$/)
    assert.ok(country.name)
    assert.ok(isCoordinates(country.center))
  }
  assert.notEqual(countries.get('ne-kosovo')?.name, countries.get('ne-somaliland')?.name)
})
test('120 questions, 6 thèmes et 5 questions pour chacun des 4 niveaux', () => {
  assert.equal(questions.length, 120)
  assert.equal(bank.themes.length, 6)
  assert.equal(bank.difficulties.length, 4)
  for (const theme of bank.themes)
    for (const level of bank.difficulties) {
      assert.equal(
        questions.filter((q) => q.theme === theme.id && q.difficulty === level.value).length,
        5,
      )
    }
})
test('questions indexées par countryId, sans duplication des noms ou codes pays', () => {
  const ids = new Set<string>()
  for (const [id, group] of Object.entries(bank.byCountry))
    for (const q of group) {
      assert.equal(q.countryId, id)
      assert.ok(countries.has(id))
      assert.ok(!ids.has(q.id))
      ids.add(q.id)
      assert.deepEqual(
        Object.keys(q).sort(),
        [
          'id',
          'countryId',
          'theme',
          'difficulty',
          'question',
          'hints',
          'explanation',
          'location',
          'source',
        ].sort(),
      )
      assert.equal(q.hints.length, 2)
      assert.ok(q.hints.every((hint) => typeof hint === 'string' && hint.length > 5))
      // Un lieu précis (récif, côte…) peut être en mer sur la carte simplifiée : on choisit son pays.
      assert.ok(isCoordinates(q.location))
    }
})
test('liens sources HTTPS et points de chaque niveau présents ; pas de vérification éditoriale réseau implicite', () => {
  assert.deepEqual(
    bank.difficulties.map((d) => d.points),
    [10, 20, 30, 40],
  )
  for (const q of questions) {
    assert.equal(new URL(q.source.url).protocol, 'https:')
    assert.ok(q.source.label)
  }
})
test('tous les pays des questions sont cliquables dans la géométrie 50m du serveur', () => {
  for (const id of Object.keys(bank.byCountry)) assert.ok(isCoordinates(landPin(id)))
  assert.equal(countryIndex.length, countries.size)
})
test('le catalogue public ne contient que thèmes/niveaux et totaux, jamais de corrigé', () => {
  assert.deepEqual(Object.keys(catalog).sort(), [
    'countries',
    'difficulties',
    'questions',
    'themes',
  ])
})
test('le fichier exemple users est vide et sans participants personnels', async () => {
  const seed = JSON.parse(
    await readFile(new URL('../../data/users.example.json', import.meta.url), 'utf8'),
  )
  assert.deepEqual(seed, { version: 1, users: [], leaderboard: [] })
})

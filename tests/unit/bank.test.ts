import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  bank,
  catalog,
  countries,
  countryFeatures,
  countryAt,
  countryIndex,
  facts,
  questions,
} from '../../backend/src/data.js'
import { isCoordinates } from '../../shared/geometry.js'
import { DEFAULT_SETTINGS } from '../../shared/game.js'
import { emptyUsers } from '../../backend/src/store.js'
import { chooseQuestion, sample } from '../../backend/src/random.js'
import { landPin } from './helpers.js'

test('240 pays et territoires : identifiants distincts, noms FR et géométrie 50m', () => {
  assert.equal(countries.size, 240)
  assert.equal(countryFeatures.length, 240)
  assert.equal(countryIndex.length, 240)
  assert.equal(new Set(countryFeatures.map((f) => f.id)).size, 240)
  for (const c of countries.values()) {
    assert.match(c.id, /^(\d{3}|ne-[a-z-]+)$/)
    assert.ok(c.name)
    assert.ok(isCoordinates(c.center))
    assert.equal(countryAt(...landPin(c.id))?.id, c.id)
  }
  assert.notEqual(countries.get('ne-kosovo')?.name, countries.get('ne-somaliland')?.name)
})
test('1080 questions : 120 éditoriales préservées et quatre repères pour chaque pays', () => {
  assert.equal(questions.length, 1080)
  assert.equal(bank.themes.length, 7)
  assert.equal(bank.difficulties.length, 4)
  const editorial = questions.filter((q) => !q.id.startsWith('atlas-'))
  assert.equal(editorial.length, 120)
  for (const theme of bank.themes.filter((t) => t.id !== 'reperes'))
    for (const level of bank.difficulties)
      assert.equal(
        editorial.filter((q) => q.theme === theme.id && q.difficulty === level.value).length,
        5,
      )
  for (const id of countries.keys())
    for (const level of [1, 2, 3, 4])
      assert.ok(bank.byCountry[id].some((q) => q.difficulty === level))
})
test('banque regroupée par countryId, IDs uniques, deux indices et sources HTTPS', () => {
  assert.equal(new Set(questions.map((q) => q.id)).size, questions.length)
  assert.deepEqual(
    bank.difficulties.map((d) => d.points),
    [10, 20, 30, 40],
  )
  for (const [id, group] of Object.entries(bank.byCountry))
    for (const q of group) {
      assert.equal(q.countryId, id)
      assert.ok(countries.has(id))
      assert.equal(q.hints.length, 2)
      assert.ok(q.hints.every((h) => typeof h === 'string' && h.length > 5))
      assert.ok(isCoordinates(q.location))
      assert.equal(new URL(q.source.url).protocol, 'https:')
      assert.ok(q.source.label)
      if (q.id.startsWith('atlas-')) assert.equal(countryAt(...q.location)?.id, id)
    }
})
test('942 faits de veille sourcés, un repère valide pour chacun des 240 pays', () => {
  assert.equal(facts.countries.length, 240)
  assert.equal(
    facts.countries.reduce((s, c) => s + c.facts.length, 0),
    942,
  )
  assert.match(facts.attribution, /ODbL 1.0/)
  assert.match(facts.license.url, /odbl/)
  assert.match(bank.license.url, /odbl/)
  for (const c of facts.countries) {
    assert.ok(c.region && !c.region.includes('Région du monde'))
    assert.equal(countryAt(...c.pin)?.id, c.countryId)
    assert.ok(c.facts.length)
    for (const f of c.facts) {
      assert.ok(f.id && f.title && f.text)
      assert.equal(new URL(f.source.url).protocol, 'https:')
    }
  }
})
test('33 pays par défaut : tous distincts et couverts aux quatre niveaux', () => {
  const ids = DEFAULT_SETTINGS.clubCountryIds
  assert.equal(ids.length, 33)
  assert.equal(new Set(ids).size, 33)
  for (const id of ids)
    for (const level of [1, 2, 3, 4])
      assert.ok(bank.byCountry[id].some((q) => q.difficulty === level))
})
test('catalogue public : pas de banque de questions, de corrigé ou de coordonnées de la question', () => {
  assert.deepEqual(Object.keys(catalog).sort(), [
    'countries',
    'difficulties',
    'questions',
    'themes',
  ])
  assert.equal(catalog.countries.length, 240)
  for (const country of catalog.countries)
    assert.deepEqual(Object.keys(country).sort(), ['id', 'name', 'region'])
})
test('exemple users v2 vide : aucun nom réel ni faux classement versionné', async () => {
  const seed = JSON.parse(
    await readFile(new URL('../../data/users.example.json', import.meta.url), 'utf8'),
  )
  assert.deepEqual(seed, emptyUsers())
})
test('tirage du pays puis de sa question, non pondéré par le nombre de fiches', () => {
  const q = questions[0],
    pool = [
      { ...q, id: 'a1', countryId: 'A', difficulty: 1 as const },
      { ...q, id: 'a2', countryId: 'A', difficulty: 1 as const },
      { ...q, id: 'b1', countryId: 'B', difficulty: 1 as const },
    ]
  let calls = 0
  const selected = chooseQuestion(pool, new Set(['A', 'B']), 1, new Set(), () => {
    calls++
    return 0.6
  })
  assert.equal(selected.countryId, 'B')
  assert.equal(calls, 2)
  assert.equal(chooseQuestion(pool, new Set(['A']), 1, new Set(['a1']), () => 0).id, 'a2')
  assert.equal(
    chooseQuestion(pool, new Set(['A']), 1, new Set(['a1', 'a2']), () => 0, 'a1').id,
    'a2',
  )
  assert.throws(() => chooseQuestion(pool, new Set(['C']), 1, new Set(), () => 0), /Aucune autre/)
})
test('échantillonnage défensif aux bornes et liste vide refusée', () => {
  assert.equal(
    sample(['a', 'b'], () => 1),
    'b',
  )
  assert.equal(
    sample(['a', 'b'], () => -1),
    'a',
  )
  assert.equal(
    sample(['a', 'b'], () => NaN),
    'a',
  )
  assert.throws(() => sample([], () => 0), /liste vide/)
})

import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { geoContains, geoDistance, geoNaturalEarth1, geoOrthographic } from 'd3-geo'
import { feature } from 'topojson-client'
import { buildCountryIndex, findCountryAt, invertMapPoint } from '../src/lib/map-geometry.mjs'
import { countryAt } from '../server/geo.mjs'
import { createRoom, evaluatePin, joinPlayer, playerView, rooms, submitAnswer } from '../server/rooms.mjs'

const topology = JSON.parse(fs.readFileSync(new URL('../public/geo/countries-50m.json', import.meta.url), 'utf8'))
const countries = feature(topology, topology.objects.countries).features
const index = buildCountryIndex(countries)

for (const [place, lon, lat, id] of [
  ['Paris', 2.35, 48.85, '250'],
  ['Alger', 3.06, 36.75, '012'],
  ['Tokyo', 139.69, 35.69, '392'],
  ['Washington', -77.04, 38.91, '840'],
  ['Alaska', -149.9, 61.21, '840'],
  ['Moscou', 37.61, 55.75, '643'],
  ['Wellington', 174.78, -41.29, '554'],
  ['Fidji', 177.98, -17.8, '242'],
  ['Kiribati', -157.4, 1.9, '296'],
  ['Singapour', 103.82, 1.35, '702'],
  ['Malte', 14.43, 35.88, '470'],
]) {
  test(`pays réel détecté : ${place}`, () => {
    assert.equal(findCountryAt(index, lon, lat)?.id, id)
    assert.equal(countryAt(lon, lat)?.id, id, 'même détection côté serveur')
  })
}

test('index des pays identique au test géométrique brut sur 512 points du monde', () => {
  let seed = 42
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32)
  for (let i = 0; i < 512; i += 1) {
    const point = [random() * 360 - 180, random() * 170 - 85]
    const expected = countries.find((c) => geoContains(c, point))
    assert.equal(findCountryAt(index, ...point)?.id, expected ? String(expected.id) : undefined, String(point))
  }
})

test('océan et coordonnées non valides ne désignent aucun pays', () => {
  for (const point of [[0, 0], [181, 48], [0, 91], [NaN, 48], [Infinity, 48], ['2', 48]]) {
    assert.equal(countryAt(...point), null)
  }
})

for (const [mode, projection, outside] of [
  ['globe', geoOrthographic().translate([450, 450]).scale(440).rotate([-20, -12]), [[0, 0], [900, 900], [450, -10]]],
  ['carte', geoNaturalEarth1().fitSize([1200, 640], { type: 'Sphere' }), [[0, 0], [1200, 640], [-100, 320]]],
]) {
  test(`${mode} : un pixel dans la carte retrouve le bon lieu`, () => {
    const coords = [2.35, 48.85]
    const picked = invertMapPoint(projection, projection(coords))
    assert.ok(picked)
    assert.ok(geoDistance(coords, picked) < 1e-8)
  })
  test(`${mode} : les clics hors de la Terre sont ignorés`, () => {
    for (const pixel of outside) assert.equal(invertMapPoint(projection, pixel), null, String(pixel))
  })
}

const question = {
  id: 'test-france', theme: 'capitales', difficulty: 2, question: 'Où se trouve Paris ?',
  answer: 'Paris', accepted: ['Paris'], explanation: 'Explication privée', country: 'France',
  isoN: '250', coords: [2.35, 48.85], hints: [], hintLevel: 0, attempts: 0, status: 'open',
}
function game(allowRetry = true) {
  const room = createRoom({ allowRetry })
  joinPlayer(room, 'Test', 'test-socket')
  room.status = 'playing'
  room.question = { ...question }
  return room
}

test('barème : lieu exact, bon pays, frontière voisine, mauvais pays', () => {
  const room = game()
  assert.equal(evaluatePin(room, question, [2.35, 48.85]).points, 20)
  assert.equal(evaluatePin(room, question, [1.444, 43.604]).precision, 'country')
  assert.equal(evaluatePin(room, question, [1.444, 43.604]).points, 12)
  const border = { ...question, coords: [7.75, 48.58] }
  assert.equal(evaluatePin(room, border, [7.85, 47.99]).precision, 'near')
  assert.equal(evaluatePin(room, border, [7.85, 47.99]).points, 8)
  assert.equal(evaluatePin(room, question, [3.06, 36.75]).points, 0)
  assert.equal(evaluatePin(room, { ...question, coords: [-1.62, 48.65] }, [-1.62, 48.90]).precision, 'miss')
  rooms.delete(room.code)
})

test('soumission : les clics invalides/en pleine mer ne consomment pas de tentative', () => {
  const room = game()
  for (const pin of [null, [2, 48, 0], ['2', 48], [null, 48], [362.35, 48.85], [2, 91], [0, 0]]) {
    assert.ok(submitAnswer(room, { pin }).error)
    assert.equal(room.question.status, 'open')
    assert.equal(room.question.attempts, 0)
    assert.equal(room.player.pin, null)
  }
  rooms.delete(room.code)
})

test('seconde chance : aucun corrigé dans l’état joueur NI dans l’accusé de réception', () => {
  const room = game()
  const ack = submitAnswer(room, { pin: [3.06, 36.75] })
  assert.deepEqual(ack, { ok: true, retry: true, outcome: 'incorrect', precision: 'miss' })
  assert.equal(room.question.status, 'open')
  const state = playerView(room)
  assert.equal(state.feedback, null)
  for (const key of ['answer', 'accepted', 'explanation', 'isoN', 'coords', 'country', 'targetCountry']) {
    assert.ok(!Object.hasOwn(state.question, key), key)
    assert.ok(!Object.hasOwn(ack, key), key)
  }
  const second = submitAnswer(room, { pin: [2.35, 48.85] })
  assert.equal(second.precision, 'exact')
  assert.equal(second.points, 10)
  assert.equal(playerView(room).feedback.answer, 'Paris')
  assert.ok(submitAnswer(room, { pin: [2.35, 48.85] }).error, 'pas de double score après résolution')
  rooms.delete(room.code)
})

test('sans seconde chance, un mauvais pays résout directement la question', () => {
  const room = game(false)
  const ack = submitAnswer(room, { pin: [3.06, 36.75] })
  assert.equal(ack.outcome, 'incorrect')
  assert.equal(room.question.status, 'feedback')
  assert.equal(playerView(room).feedback.answer, 'Paris')
  rooms.delete(room.code)
})

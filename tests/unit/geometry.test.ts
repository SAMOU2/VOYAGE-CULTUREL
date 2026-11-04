import test from 'node:test'
import assert from 'node:assert/strict'
import { countryAt } from '../../backend/src/data.js'
import { isCoordinates, sphereCoordinates, spherePoint } from '../../shared/geometry.js'
import type { Coordinates } from '../../shared/types.js'

const locations: [string, Coordinates, string][] = [
  ['Paris', [2.3522, 48.8566], '250'],
  ['Alger', [3.0588, 36.7538], '012'],
  ['New York', [-73.95, 40.78], '840'],
  ['Tokyo', [139.6917, 35.6895], '392'],
  ['Singapour', [103.85, 1.29], '702'],
  ['Moscou', [37.617, 55.755], '643'],
  ['Russie orientale', [179, 65], '643'],
  ['Fidji', [178.4, -18], '242'],
  ['Fidji au-delà de l’antiméridien', [-179.99, -16.5], '242'],
  ['Wellington', [174.78, -41.3], '554'],
  ['Praia', [-23.51, 14.92], '132'],
]
for (const [name, pin, id] of locations)
  test(`picking géographique : ${name}`, () => {
    assert.equal(countryAt(...pin)?.id, id)
  })
test('océan et coordonnées invalides ne sélectionnent aucun pays', () => {
  assert.equal(countryAt(-30, 0), null)
  assert.equal(countryAt(0, 0), null)
  assert.equal(countryAt(NaN, 4), null)
  assert.equal(countryAt(181, 5), null)
  assert.equal(countryAt(12, -91), null)
})
test('validation stricte des coordonnées, sans coercition ni tableau excédentaire', () => {
  for (const value of [
    null,
    {},
    [],
    [1],
    [1, 2, 3],
    ['1', 2],
    [NaN, 2],
    [Infinity, 0],
    [0, 91],
    [-181, 0],
  ])
    assert.equal(isCoordinates(value), false)
  assert.ok(isCoordinates([0, 0]))
  assert.ok(isCoordinates([-180, 90]))
})
test('raycast 3D et texture : conversion lon/lat ↔ sphère dans les deux hémisphères', () => {
  const pins: Coordinates[] = [
    [0, 0],
    [90, 30],
    [-90, -30],
    [179.99, 65],
    [-179.99, -45],
    [12, 89.9],
  ]
  for (const pin of pins) {
    const point = spherePoint(pin, 2.5),
      back = sphereCoordinates(point)
    assert.ok(Math.abs(back[0] - pin[0]) < 1e-8)
    assert.ok(Math.abs(back[1] - pin[1]) < 1e-8)
    assert.ok(Math.abs(Math.hypot(...point) - 2.5) < 1e-8)
  }
  assert.deepEqual(spherePoint([0, 0]), [1, 0, -0])
})

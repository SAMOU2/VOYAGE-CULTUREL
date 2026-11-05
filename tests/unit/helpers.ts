import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { TestContext } from 'node:test'
import { countryAt, facts } from '../../backend/src/data.js'
import { Stand } from '../../backend/src/stand.js'
import { JsonStore } from '../../backend/src/store.js'
import { SettingsStore } from '../../backend/src/settings.js'
import type { Coordinates, GameSettings } from '../../shared/types.js'

export async function temporary(t: TestContext): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'algomania-test-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  return directory
}
export async function fixture(
  t: TestContext,
  settings: Partial<GameSettings> = {},
  random: () => number = () => 0,
) {
  const directory = await temporary(t),
    store = await JsonStore.open(join(directory, 'users.json')),
    configuration = await SettingsStore.open(join(directory, 'settings.json'))
  await configuration.save({ ...configuration.current, ...settings })
  const stand = new Stand(store, configuration, random)
  return { stand, store, configuration, directory }
}
export function landPin(id: string): Coordinates {
  const country = facts.countries.find((c) => c.countryId === id)
  if (!country || countryAt(...country.pin)?.id !== id)
    throw new Error(`Point intérieur invalide : ${id}`)
  return [...country.pin]
}
export function wrongPin(id: string): Coordinates {
  return landPin(id === '250' ? '392' : '250')
}
export function turnOf(stand: Stand) {
  const state = stand.playerState()
  if (!state.game || !state.question) throw new Error('Aucune partie active')
  return { attemptId: state.game.id, turn: state.question.turn }
}
export async function solve(stand: Stand, correct = true) {
  const answer = stand.presenterState().answer!
  return stand.submit({
    ...turnOf(stand),
    pin: correct ? landPin(answer.country.id) : wrongPin(answer.country.id),
  })
}

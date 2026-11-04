import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { TestContext } from 'node:test'
import { countries, countryAt, countryIndex } from '../../backend/src/data.js'
import { Stand } from '../../backend/src/stand.js'
import { JsonStore } from '../../backend/src/store.js'
import type { Coordinates, Participant } from '../../shared/types.js'

export async function temporary(t: TestContext): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'voyage-stand-test-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  return dir
}
export async function fixture(t: TestContext) {
  const directory = await temporary(t)
  const store = await JsonStore.open(join(directory, 'users.json'))
  const stand = new Stand(store, () => 0)
  return { stand, store, directory }
}
export function participant(score = 10, extra: Partial<Participant> = {}): Participant {
  return {
    id: crypto.randomUUID(),
    nickname: 'Visiteur test',
    startedAt: '2026-11-04T10:00:00.000Z',
    score,
    correct: 1,
    answered: 1,
    ...extra,
  }
}
const pins = new Map<string, Coordinates>()
export function landPin(id: string): Coordinates {
  const cached = pins.get(id)
  if (cached) return cached
  const center = countries.get(id)!.center
  if (countryAt(...center)?.id === id) {
    pins.set(id, center)
    return center
  }
  const bounds = countryIndex.find((country) => country.id === id)!.bounds
  const [[x0, y0], [x1, y1]] = bounds
  const width = x1 >= x0 ? x1 - x0 : x1 + 360 - x0
  for (let a = 1; a < 50; a++)
    for (let b = 1; b < 50; b++) {
      const pin: Coordinates = [
        ((x0 + (width * a) / 50 + 540) % 360) - 180,
        y0 + ((y1 - y0) * b) / 50,
      ]
      if (countryAt(...pin)?.id === id) {
        pins.set(id, pin)
        return pin
      }
    }
  throw new Error(`Aucun point intérieur trouvé pour ${id}`)
}
export function wrongPin(id: string): Coordinates {
  return id === '250' ? [139.6917, 35.6895] : [2.3522, 48.8566]
}

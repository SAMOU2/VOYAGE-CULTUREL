import type { Difficulty, GameSettings } from './types.js'

export const NAME_MAX_LENGTH = 64
export const IDLE_DELAY_MS = 10_000
export const STAGE_COUNT = 4
export const CURRENT_QUESTION_KEY = 'current-question'
export const STAGE_LABELS = ['Facile', 'Moyen', 'Difficile', 'Expert'] as const
export const DEFAULT_SETTINGS: GameSettings = {
  mode: 'club33',
  // Sélection équilibrée proposée, modifiable depuis le pupitre (exactement 33).
  clubCountryIds: [
    '012',
    '504',
    '788',
    '818',
    '686',
    '566',
    '404',
    '231',
    '710',
    '250',
    '724',
    '380',
    '276',
    '826',
    '300',
    '620',
    '756',
    '792',
    '392',
    '156',
    '356',
    '410',
    '360',
    '682',
    '586',
    '840',
    '124',
    '484',
    '076',
    '604',
    '032',
    '036',
    '554',
  ],
  questionsPerStage: 3,
  allowRetry: false,
}
export const normalizeName = (value: string): string =>
  value
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b\u202a-\u202e\u2066-\u2069]/g, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
export const nameKey = (name: string): string =>
  normalizeName(name).normalize('NFKC').toLocaleLowerCase('fr')
export const isValidName = (name: string): boolean =>
  [...name].length >= 2 && [...name].length <= NAME_MAX_LENGTH && /\p{L}/u.test(name)
export const levelFor = (answered: number, perStage: number): Difficulty =>
  Math.min(STAGE_COUNT, 1 + Math.floor(answered / perStage)) as Difficulty
export const modeLabel = (mode: GameSettings['mode']): string =>
  mode === 'club33' ? 'Sélection · 33 pays' : 'Monde entier'

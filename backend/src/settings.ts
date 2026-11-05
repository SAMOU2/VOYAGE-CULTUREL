import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { DEFAULT_SETTINGS } from '../../shared/game.js'
import type { GameSettings } from '../../shared/types.js'
import { countries } from './data.js'
import { atomicJson } from './persistence.js'

export function validateSettings(value: unknown): GameSettings {
  if (!value || typeof value !== 'object') throw new Error('Réglages invalides.')
  const s = value as Partial<GameSettings>
  if (
    !['club33', 'world'].includes(s.mode ?? '') ||
    typeof s.allowRetry !== 'boolean' ||
    !Number.isInteger(s.questionsPerStage) ||
    (s.questionsPerStage ?? 0) < 2 ||
    (s.questionsPerStage ?? 0) > 10 ||
    !Array.isArray(s.clubCountryIds) ||
    s.clubCountryIds.length !== 33 ||
    new Set(s.clubCountryIds).size !== 33 ||
    s.clubCountryIds.some((id) => typeof id !== 'string' || !countries.has(id))
  )
    throw new Error('Choisissez exactement 33 pays distincts et 2 à 10 questions par niveau.')
  return {
    mode: s.mode!,
    clubCountryIds: [...s.clubCountryIds],
    questionsPerStage: s.questionsPerStage!,
    allowRetry: s.allowRetry,
  }
}
export class SettingsStore {
  private constructor(
    readonly file: string,
    private value: GameSettings,
  ) {}
  static async open(file: string): Promise<SettingsStore> {
    let saved: { version: number; settings: unknown }
    try {
      saved = JSON.parse(await readFile(file, 'utf8')) as typeof saved
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        throw new Error(`Réglages JSON illisibles : ${file}`, { cause: error })
      saved = { version: 1, settings: structuredClone(DEFAULT_SETTINGS) }
      await mkdir(dirname(file), { recursive: true })
      await writeFile(file, JSON.stringify(saved, null, 2) + '\n', { flag: 'wx' })
    }
    if (saved.version !== 1) throw new Error('Version des réglages non reconnue.')
    return new SettingsStore(file, validateSettings(saved.settings))
  }
  get current(): GameSettings {
    return structuredClone(this.value)
  }
  async save(value: unknown): Promise<void> {
    const next = validateSettings(value)
    await atomicJson(this.file, { version: 1, settings: next })
    this.value = next
  }
}

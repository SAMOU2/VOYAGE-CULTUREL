import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

function rootDirectory(): string {
  if (process.env.PROJECT_ROOT) return resolve(process.env.PROJECT_ROOT)
  let candidate = dirname(fileURLToPath(import.meta.url))
  while (!existsSync(join(candidate, 'data', 'questions.json'))) {
    const parent = dirname(candidate)
    if (parent === candidate)
      throw new Error('Dossier data du stand introuvable. Définissez PROJECT_ROOT.')
    candidate = parent
  }
  return candidate
}
export const ROOT = rootDirectory()
export const DATA = join(ROOT, 'data')
export const GEO = join(ROOT, 'frontend', 'public', 'geo')

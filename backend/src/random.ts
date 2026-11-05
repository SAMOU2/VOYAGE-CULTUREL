import type { Difficulty, Question } from '../../shared/types.js'

export function sample<T>(items: readonly T[], random: () => number): T {
  if (!items.length) throw new Error('Tirage dans une liste vide')
  const value = random()
  const index = Math.max(
    0,
    Math.min(items.length - 1, Math.floor((Number.isFinite(value) ? value : 0) * items.length)),
  )
  return items[index]
}
/** D'abord un pays équiprobable, puis une de ses questions : les gros groupes ne sont pas favorisés. */
export function chooseQuestion(
  questions: Question[],
  countryIds: ReadonlySet<string>,
  difficulty: Difficulty,
  used: ReadonlySet<string>,
  random: () => number,
  excludedId?: string,
): Question {
  const pool = questions.filter(
    (q) => countryIds.has(q.countryId) && q.difficulty === difficulty && q.id !== excludedId,
  )
  let remaining = pool.filter((q) => !used.has(q.id))
  if (!remaining.length) remaining = pool
  if (!remaining.length) throw new Error('Aucune autre question disponible pour cette sélection.')
  const country = sample([...new Set(remaining.map((q) => q.countryId))], random)
  return sample(
    remaining.filter((q) => q.countryId === country),
    random,
  )
}

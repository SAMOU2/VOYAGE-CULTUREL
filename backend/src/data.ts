import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { feature } from 'topojson-client'
import { DATA, GEO } from './paths.js'
import { buildCountryIndex, findCountryAt } from '../../shared/geometry.js'
import type {
  Catalog,
  CountriesFile,
  Country,
  CountryFeature,
  CountryTopology,
  Difficulty,
  FactsFile,
  Question,
  QuestionBankFile,
} from '../../shared/types.js'

const countryFile: CountriesFile = JSON.parse(readFileSync(join(DATA, 'countries.json'), 'utf8'))
export const countries = new Map<string, Country>(
  countryFile.countries.map((country) => [country.id, country]),
)
export const bank: QuestionBankFile = JSON.parse(readFileSync(join(DATA, 'questions.json'), 'utf8'))
export const facts: FactsFile = JSON.parse(readFileSync(join(DATA, 'facts.json'), 'utf8'))
export const questions: Question[] = Object.entries(bank.byCountry).flatMap(
  ([countryId, group]) => {
    if (!countries.has(countryId)) throw new Error(`Pays inconnu dans la banque : ${countryId}`)
    return group.map((question) => {
      if (question.countryId !== countryId) throw new Error(`Lien pays incohérent : ${question.id}`)
      return question
    })
  },
)
export const questionById = new Map(questions.map((q) => [q.id, q]))
if (questionById.size !== questions.length || !questions.length)
  throw new Error('Banque vide ou identifiants dupliqués')
for (const q of questions) {
  if (
    ![1, 2, 3, 4].includes(q.difficulty) ||
    !bank.themes.some((t) => t.id === q.theme) ||
    !q.question ||
    q.hints.length !== 2 ||
    !q.explanation ||
    !q.source.url.startsWith('https://')
  )
    throw new Error(`Fiche invalide : ${q.id}`)
}
for (const id of countries.keys())
  for (const difficulty of [1, 2, 3, 4]) {
    if (!bank.byCountry[id]?.some((q) => q.difficulty === difficulty))
      throw new Error(`Le pays ${id} n'a pas de question au niveau ${difficulty}`)
  }
const topology: CountryTopology = JSON.parse(readFileSync(join(GEO, 'countries-50m.json'), 'utf8'))
export const countryFeatures = feature(topology, topology.objects.countries)
  .features as CountryFeature[]
export const countryIndex = buildCountryIndex(countryFeatures)
export function countryAt(lon: number, lat: number): Country | null {
  const found = findCountryAt(countryIndex, lon, lat)
  return found ? (countries.get(found.id) ?? null) : null
}
export const pointsFor = (difficulty: Difficulty): number =>
  bank.difficulties.find((d) => d.value === difficulty)?.points ?? 10
export const catalog: Catalog = {
  themes: bank.themes,
  difficulties: bank.difficulties,
  questions: questions.length,
  countries: countryFile.countries
    .map((c) => ({
      id: c.id,
      name: c.name,
      region: facts.countries.find((f) => f.countryId === c.id)?.region ?? '',
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr')),
}

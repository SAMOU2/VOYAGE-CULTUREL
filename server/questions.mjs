import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(here, '..', 'data', 'questions.json')

const raw = JSON.parse(fs.readFileSync(file, 'utf8'))

/** @typedef {{id:string,theme:string,difficulty:1|2|3|4,question:string,answer:string,accepted:string[],hints:string[],explanation:string,country:string,countryCode:string,isoN:string,coords:[number,number],source:{label:string,url:string}}} Question */

export const THEMES = raw.themes
export const DIFFICULTIES = raw.difficulties
export const CHECKED_AT = raw.checkedAt

/** @type {Question[]} */
export const QUESTIONS = raw.questions.map((q) => ({
  ...q,
  accepted: [...new Set([q.answer, ...q.accepted])],
}))

if (QUESTIONS.length === 0) {
  throw new Error('Banque de questions vide : data/questions.json')
}

/** Points attribués à une bonne réponse, selon la difficulté. */
export const POINTS_BY_DIFFICULTY = Object.fromEntries(DIFFICULTIES.map((d) => [d.value, d.points]))

/** Paliers de niveau (score cumulé). */
export const LEVEL_THRESHOLDS = [0, 40, 100, 170, 260, 360]

export function normalize(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, ' ')
    .replace(/^(le|la|les|un|une|l|the|el|il|lo)\s+/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Vérifie une saisie libre contre la réponse et ses variantes (indicatif, pour le présentateur). */
export function checkAnswer(question, text) {
  const given = normalize(text)
  if (!given) return false
  return question.accepted.some((variant) => {
    const v = normalize(variant)
    return v.length > 0 && (v === given || v.includes(given) || given.includes(v))
  })
}

export function levelFor(score) {
  let level = 1
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i += 1) {
    if (score >= LEVEL_THRESHOLDS[i]) level = i + 1
  }
  return level
}

export function levelProgress(score) {
  const level = levelFor(score)
  const current = LEVEL_THRESHOLDS[level - 1] ?? 0
  const next = LEVEL_THRESHOLDS[level] ?? null
  const ratio = next === null ? 1 : Math.max(0, Math.min(1, (score - current) / (next - current)))
  return { level, current, next, ratio }
}

/** Distance en km entre deux points [lon, lat]. */
export function distanceKm(a, b) {
  if (!a || !b) return null
  const R = 6371
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(b[1] - a[1])
  const dLon = toRad(b[0] - a[0])
  const la1 = toRad(a[1])
  const la2 = toRad(b[1])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2
  return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(h))))
}

/**
 * Construit la file de questions d'une partie.
 * @param {{theme:string, difficulty:string|number, count:number}} config
 */
export function buildQueue(config) {
  const difficultyFilter =
    config.difficulty === 'mixte' || config.difficulty == null || config.difficulty === ''
      ? null
      : Number(config.difficulty)

  const pool = QUESTIONS.filter((q) => {
    const themeOk = !config.theme || config.theme === 'tous' || q.theme === config.theme
    const diffOk = difficultyFilter === null || q.difficulty === difficultyFilter
    return themeOk && diffOk
  })
  // Aucun repli vers un autre thème ou niveau si les critères ne donnent rien.
  if (pool.length === 0) return []

  const count = Math.max(1, Math.min(Math.floor(Number(config.count) || 8), pool.length))
  if (difficultyFilter !== null)
    return shuffle(pool)
      .slice(0, count)
      .map((q) => q.id)

  const levels = [...new Set(pool.map((q) => q.difficulty))].sort((a, b) => a - b)
  const groups = levels.map((level) => shuffle(pool.filter((q) => q.difficulty === level)))
  const quotas = groups.map(() => 0)

  if (count < groups.length) {
    // Une manche très courte parcourt des paliers espacés, du facile à l'expert.
    for (let i = 0; i < count; i += 1) {
      const index = count === 1 ? 0 : Math.round((i * (groups.length - 1)) / (count - 1))
      quotas[index] = 1
    }
  } else {
    // Répartir AVANT de trier : trier toute la banque puis la tronquer ne
    // sélectionnait que des questions faciles. Respecter aussi les stocks.
    let remaining = count
    while (remaining > 0) {
      for (let i = 0; i < groups.length && remaining > 0; i += 1) {
        if (quotas[i] < groups[i].length) {
          quotas[i] += 1
          remaining -= 1
        }
      }
    }
  }

  return groups.flatMap((group, i) => group.slice(0, quotas[i]).map((q) => q.id))
}

export function shuffle(list) {
  const arr = [...list]
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export function getQuestion(id) {
  return QUESTIONS.find((q) => q.id === id) || null
}

export function themeLabel(id) {
  return THEMES.find((t) => t.id === id)?.label ?? 'Tous les thèmes'
}

export function difficultyLabel(value) {
  return DIFFICULTIES.find((d) => d.value === Number(value))?.label ?? 'Mixte'
}

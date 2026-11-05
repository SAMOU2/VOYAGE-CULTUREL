import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type {
  AdminLeaderboardEntry,
  AttemptRecord,
  AttemptSummary,
  LeaderboardEntry,
  StoredSession,
  UserRecord,
  UsersFile,
} from '../../shared/types.js'
import { nameKey, normalizeName } from '../../shared/game.js'
import { atomicJson } from './persistence.js'

export const emptyUsers = (): UsersFile => ({
  version: 2,
  nextTurn: 0,
  users: [],
  attempts: [],
  session: null,
})
const integer = (n: unknown): n is number => Number.isSafeInteger(n) && Number(n) >= 0
const date = (s: unknown): s is string => typeof s === 'string' && Number.isFinite(Date.parse(s))
function invalid(): never {
  throw new Error('Schéma users.json incohérent ; le fichier est conservé, jamais écrasé.')
}
function validate(value: unknown): asserts value is UsersFile {
  if (!value || typeof value !== 'object') invalid()
  const data = value as UsersFile
  if (
    data.version !== 2 ||
    !integer(data.nextTurn) ||
    !Array.isArray(data.users) ||
    !Array.isArray(data.attempts) ||
    data.session === undefined
  )
    invalid()
  const users = new Set<string>(),
    names = new Set<string>(),
    attempts = new Set<string>(),
    answers = new Set<string>()
  for (const user of data.users) {
    if (
      !user ||
      typeof user.id !== 'string' ||
      !user.id ||
      users.has(user.id) ||
      typeof user.fullName !== 'string' ||
      !user.fullName ||
      [...user.fullName].length > 64 ||
      user.nameKey !== nameKey(user.fullName) ||
      names.has(user.nameKey) ||
      !date(user.createdAt)
    )
      invalid()
    users.add(user.id)
    names.add(user.nameKey)
  }
  for (const attempt of data.attempts) {
    if (
      !attempt ||
      !attempt.id ||
      attempts.has(attempt.id) ||
      !users.has(attempt.userId) ||
      typeof attempt.fullName !== 'string' ||
      !date(attempt.startedAt) ||
      !['playing', 'completed', 'stopped', 'interrupted'].includes(attempt.status) ||
      (attempt.status === 'playing' ? attempt.finishedAt !== null : !date(attempt.finishedAt)) ||
      !integer(attempt.score) ||
      !integer(attempt.answered) ||
      !integer(attempt.correct) ||
      attempt.correct > attempt.answered ||
      ![1, 2, 3, 4].includes(attempt.maxLevel) ||
      !['club33', 'world'].includes(attempt.mode) ||
      !Number.isInteger(attempt.questionsPerStage) ||
      attempt.questionsPerStage < 2 ||
      attempt.questionsPerStage > 10 ||
      !Array.isArray(attempt.answers)
    )
      invalid()
    attempts.add(attempt.id)
    for (const answer of attempt.answers) {
      if (
        !answer ||
        !answer.id ||
        answers.has(answer.id) ||
        !answer.questionId ||
        !answer.countryId ||
        ![1, 2, 3, 4].includes(answer.difficulty) ||
        !['correct', 'incorrect'].includes(answer.outcome) ||
        !integer(answer.points) ||
        !integer(answer.hintsUsed) ||
        answer.hintsUsed > 2 ||
        ![1, 2].includes(answer.tries) ||
        !date(answer.answeredAt) ||
        (answer.pin !== null &&
          (!Array.isArray(answer.pin) ||
            answer.pin.length !== 2 ||
            !answer.pin.every(Number.isFinite))) ||
        (answer.outcome === 'incorrect' && answer.points !== 0)
      )
        invalid()
      answers.add(answer.id)
    }
    if (
      !attempt.migrated &&
      (attempt.answered !== attempt.answers.length ||
        attempt.score !== attempt.answers.reduce((s, a) => s + a.points, 0) ||
        attempt.correct !== attempt.answers.filter((a) => a.outcome === 'correct').length)
    )
      invalid()
  }
  const playing = data.attempts.filter((a) => a.status === 'playing')
  if (playing.length > 1) invalid()
  if (data.session !== null) {
    const s = data.session
    if (
      !s ||
      typeof s !== 'object' ||
      !attempts.has(s.attemptId) ||
      !s.questionId ||
      !s.questionToken ||
      !integer(s.turn) ||
      s.turn > data.nextTurn ||
      !integer(s.hintsRevealed) ||
      s.hintsRevealed > 2 ||
      ![0, 1].includes(s.tries) ||
      !Array.isArray(s.usedQuestionIds) ||
      s.usedQuestionIds.some((id) => typeof id !== 'string') ||
      !s.settings ||
      !['club33', 'world'].includes(s.settings.mode) ||
      !Array.isArray(s.settings.clubCountryIds) ||
      s.settings.clubCountryIds.length !== 33 ||
      new Set(s.settings.clubCountryIds).size !== 33 ||
      !Number.isInteger(s.settings.questionsPerStage) ||
      s.settings.questionsPerStage < 2 ||
      s.settings.questionsPerStage > 10 ||
      typeof s.settings.allowRetry !== 'boolean'
    )
      invalid()
    if (
      s.feedback &&
      (!['correct', 'incorrect'].includes(s.feedback.outcome) ||
        !integer(s.feedback.points) ||
        !s.feedback.country?.id ||
        !s.feedback.explanation ||
        !s.feedback.source?.url ||
        !Array.isArray(s.feedback.location))
    )
      invalid()
  }
  if (playing.length && data.session?.attemptId !== playing[0].id) invalid()
}

/** Migration explicite du format précédent, sans effacer les anciens scores. */
function migrate(value: unknown): UsersFile {
  const old = value as {
    version?: unknown
    users?: { id: string; nickname: string; createdAt: string }[]
    leaderboard?: {
      id: string
      userId: string
      score: number
      correct: number
      answered: number
      completedAt: string
      durationMs: number
    }[]
  }
  if (!old || old.version !== 1 || !Array.isArray(old.users) || !Array.isArray(old.leaderboard))
    invalid()
  const next = emptyUsers(),
    aliases = new Map<string, string>(),
    originals = new Map<string, (typeof old.users)[number]>()
  for (const user of old.users) {
    if (!user || !user.id || typeof user.nickname !== 'string' || originals.has(user.id)) invalid()
    originals.set(user.id, user)
    const fullName = normalizeName(user.nickname) || `Visiteur archivé ${user.id.slice(0, 8)}`
    const key = nameKey(fullName)
    let profile = next.users.find((u) => u.nameKey === key)
    if (!profile) {
      profile = {
        id: user.id,
        fullName,
        nameKey: key,
        createdAt: date(user.createdAt) ? user.createdAt : new Date().toISOString(),
      }
      next.users.push(profile)
    }
    aliases.set(user.id, profile.id)
  }
  const ids = new Set<string>()
  for (const score of old.leaderboard) {
    const userId = aliases.get(score.userId)
    if (
      !userId ||
      !score.id ||
      ids.has(score.id) ||
      !integer(score.score) ||
      !integer(score.answered) ||
      !integer(score.correct) ||
      score.correct > score.answered ||
      !date(score.completedAt)
    )
      invalid()
    ids.add(score.id)
    const original = originals.get(score.userId)!
    next.attempts.push({
      id: score.id,
      userId,
      fullName:
        normalizeName(original.nickname) || next.users.find((u) => u.id === userId)!.fullName,
      startedAt: date(original.createdAt) ? original.createdAt : score.completedAt,
      finishedAt: score.completedAt,
      status: 'completed',
      score: score.score,
      correct: score.correct,
      answered: score.answered,
      maxLevel: Math.min(
        4,
        1 + Math.floor(Math.max(0, score.answered - 1) / 2),
      ) as AttemptRecord['maxLevel'],
      mode: 'world',
      questionsPerStage: 2,
      answers: [],
      migrated: true,
    })
  }
  validate(next)
  return next
}
const compare = (a: AttemptRecord, b: AttemptRecord): number =>
  b.score - a.score ||
  b.correct - a.correct ||
  b.maxLevel - a.maxLevel ||
  (a.finishedAt ?? a.startedAt).localeCompare(b.finishedAt ?? b.startedAt) ||
  a.id.localeCompare(b.id)

export class JsonStore {
  private queue: Promise<void> = Promise.resolve()
  private constructor(
    readonly file: string,
    private data: UsersFile,
  ) {}
  static async open(file: string): Promise<JsonStore> {
    let raw: string
    try {
      raw = await readFile(file, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        throw new Error(`JSON participants illisible : ${file}`, { cause: error })
      const initial = emptyUsers()
      await mkdir(dirname(file), { recursive: true })
      await writeFile(file, JSON.stringify(initial, null, 2) + '\n', { flag: 'wx' })
      return new JsonStore(file, initial)
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch (error) {
      throw new Error(`JSON participants illisible : ${file}`, { cause: error })
    }
    if (parsed && typeof parsed === 'object' && 'version' in parsed && parsed.version === 1) {
      const migrated = migrate(parsed)
      // Sauvegarde privée, également ignorée par Git, avant tout remplacement du v1.
      await writeFile(`${file}.v1.${Date.now()}.bak`, raw, { flag: 'wx' })
      await atomicJson(file, migrated)
      return new JsonStore(file, migrated)
    }
    validate(parsed)
    return new JsonStore(file, parsed)
  }
  get count(): number {
    return this.data.users.length
  }
  get session(): StoredSession | null {
    return structuredClone(this.data.session)
  }
  attempt(id: string): AttemptRecord | null {
    return structuredClone(this.data.attempts.find((a) => a.id === id) ?? null)
  }
  findUser(fullName: string): UserRecord | null {
    return structuredClone(this.data.users.find((u) => u.nameKey === nameKey(fullName)) ?? null)
  }
  attemptCount(userId: string): number {
    return this.data.attempts.filter((a) => a.userId === userId).length
  }
  bestScore(userId: string): number {
    return Math.max(
      0,
      ...this.data.attempts
        .filter((a) => a.userId === userId && a.status !== 'playing')
        .map((a) => a.score),
    )
  }
  history(userId: string): AttemptSummary[] {
    return this.data.attempts
      .filter((a) => a.userId === userId)
      .slice()
      .reverse()
      .slice(0, 50)
      .map(({ answers: _answers, ...summary }) => structuredClone(summary))
  }
  adminLeaderboard(): AdminLeaderboardEntry[] {
    const best = new Map<string, AttemptRecord>()
    for (const attempt of this.data.attempts) {
      if (!attempt.answered || attempt.status === 'playing') continue
      const previous = best.get(attempt.userId)
      if (!previous || compare(attempt, previous) < 0) best.set(attempt.userId, attempt)
    }
    return [...best.values()]
      .sort(compare)
      .slice(0, 100)
      .map((attempt, i) => ({
        rank: i + 1,
        userId: attempt.userId,
        fullName: this.data.users.find((u) => u.id === attempt.userId)!.fullName,
        score: attempt.score,
        correct: attempt.correct,
        answered: attempt.answered,
        level: attempt.maxLevel,
        completedAt: attempt.finishedAt!,
        attempts: this.attemptCount(attempt.userId),
        bestAttemptId: attempt.id,
      }))
  }
  leaderboard(): LeaderboardEntry[] {
    return this.adminLeaderboard()
      .slice(0, 20)
      .map(({ attempts: _attempts, bestAttemptId: _id, ...entry }) => entry)
  }
  /** Une file pour toutes les écritures ; mutation d'un clone, puis commit disque et mémoire. */
  async transaction(work: (draft: UsersFile) => void): Promise<void> {
    const task = this.queue.then(async () => {
      const next = structuredClone(this.data)
      work(next)
      validate(next)
      await atomicJson(this.file, next)
      this.data = next
    })
    this.queue = task.catch(() => undefined)
    return task
  }
}

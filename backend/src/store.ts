import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { LeaderboardEntry, Participant, UsersFile } from '../../shared/types.js'

export class JsonStore {
  private queue: Promise<void> = Promise.resolve()
  private constructor(
    readonly file: string,
    private data: UsersFile,
  ) {}

  static async open(file: string): Promise<JsonStore> {
    let data: UsersFile
    try {
      data = JSON.parse(await readFile(file, 'utf8')) as UsersFile
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        throw new Error(`JSON participants illisible : ${file}`, { cause: error })
      data = { version: 1, users: [], leaderboard: [] }
      await mkdir(dirname(file), { recursive: true })
      await writeFile(file, JSON.stringify(data, null, 2) + '\n', { flag: 'wx' })
    }
    if (data.version !== 1 || !Array.isArray(data.users) || !Array.isArray(data.leaderboard))
      throw new Error('Schéma users.json invalide')
    const ids = new Set(data.users.map((user) => user.id))
    if (
      ids.size !== data.users.length ||
      data.users.some((user) => !user.id || typeof user.nickname !== 'string') ||
      data.leaderboard.some(
        (row) =>
          !ids.has(row.userId) ||
          !Number.isInteger(row.score) ||
          row.score < 0 ||
          !Number.isInteger(row.answered) ||
          !Number.isInteger(row.correct) ||
          row.correct < 0 ||
          row.correct > row.answered,
      )
    ) {
      throw new Error(
        'Participants ou classement incohérents ; le fichier est conservé, jamais écrasé',
      )
    }
    return new JsonStore(file, data)
  }

  get count(): number {
    return this.data.users.length
  }

  leaderboard(): LeaderboardEntry[] {
    const users = new Map(this.data.users.map((user) => [user.id, user.nickname]))
    return [...this.data.leaderboard]
      .sort(
        (a, b) =>
          b.score - a.score || b.correct - a.correct || a.completedAt.localeCompare(b.completedAt),
      )
      .slice(0, 20)
      .map((row, index) => ({
        rank: index + 1,
        nickname: users.get(row.userId) ?? 'Visiteur',
        score: row.score,
        correct: row.correct,
        answered: row.answered,
        completedAt: row.completedAt,
      }))
  }

  /** Une seule file d'écriture et remplacement atomique : pas de perte lors de deux sauvegardes proches. */
  async save(participant: Participant): Promise<void> {
    const snapshot = { ...participant }
    const task = this.queue.then(async () => {
      if (!snapshot.answered || this.data.leaderboard.some((row) => row.userId === snapshot.id))
        return
      const next = structuredClone(this.data)
      const now = new Date().toISOString()
      next.users.push({
        id: snapshot.id,
        nickname: snapshot.nickname,
        createdAt: snapshot.startedAt,
      })
      next.leaderboard.push({
        id: randomUUID(),
        userId: snapshot.id,
        score: snapshot.score,
        correct: snapshot.correct,
        answered: snapshot.answered,
        completedAt: now,
        durationMs: Math.max(0, Date.now() - Date.parse(snapshot.startedAt)),
      })
      const temporary = `${this.file}.${randomUUID()}.tmp`
      try {
        await writeFile(temporary, JSON.stringify(next, null, 2) + '\n')
        await rename(temporary, this.file)
        this.data = next
      } catch (error) {
        await unlink(temporary).catch(() => undefined)
        throw error
      }
    })
    this.queue = task.catch(() => undefined)
    return task
  }
}

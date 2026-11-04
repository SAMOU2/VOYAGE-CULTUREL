import { randomUUID } from 'node:crypto'
import { bank, catalog, countries, countryAt, pointsFor, questions } from './data.js'
import { isCoordinates } from '../../shared/geometry.js'
import type {
  Country,
  Feedback,
  Participant,
  PlayerState,
  PresenterState,
  Question,
  Result,
  StandSettings,
} from '../../shared/types.js'
import { JsonStore } from './store.js'

const ok = (): Result => ({ ok: true })
const fail = (error: string): Result => ({ ok: false, error })
const nickname = (value: string, fallback: string): string =>
  [
    ...value
      .normalize('NFC')
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .trim(),
  ]
    .slice(0, 24)
    .join('') || fallback

/** Un seul stand permanent, sans salle, code, file de parties ou limite de questions. */
export class Stand {
  settings: StandSettings = { theme: 'tous', difficulty: 'progressive', allowRetry: true }
  participant: Participant
  private sequence: number
  private current!: Question
  private turn = 0
  private hints = 0
  private attempts = 0
  private feedback: Feedback | null = null
  private used = new Set<string>()
  private pending: Promise<void> = Promise.resolve()

  constructor(
    readonly store: JsonStore,
    private random: () => number = Math.random,
  ) {
    this.sequence = store.count
    this.participant = this.createParticipant()
    this.openQuestion()
  }

  private createParticipant(value = ''): Participant {
    const fallback = `Visiteur ${++this.sequence}`
    return {
      id: randomUUID(),
      nickname: nickname(value, fallback),
      startedAt: new Date().toISOString(),
      score: 0,
      correct: 0,
      answered: 0,
    }
  }

  private openQuestion(): void {
    const difficulty =
      this.settings.difficulty === 'progressive'
        ? Math.min(4, 1 + Math.floor(this.participant.answered / 2))
        : this.settings.difficulty
    const pool = questions.filter(
      (q) =>
        (this.settings.theme === 'tous' || q.theme === this.settings.theme) &&
        q.difficulty === difficulty,
    )
    let remaining = pool.filter((q) => !this.used.has(q.id))
    if (!remaining.length) {
      for (const q of pool) this.used.delete(q.id)
      remaining = pool
    }
    if (!remaining.length) throw new Error('Aucune question pour ces critères')
    this.current =
      remaining[Math.min(remaining.length - 1, Math.floor(this.random() * remaining.length))]
    this.used.add(this.current.id)
    this.turn += 1
    this.hints = 0
    this.attempts = 0
    this.feedback = null
  }

  private points(): number {
    const remaining = pointsFor(this.current.difficulty) - this.hints * 5
    return Math.max(5, this.attempts ? Math.round(remaining / 2) : remaining)
  }

  private resolve(outcome: Feedback['outcome'], clickedCountry: Country | null = null): void {
    const points = outcome === 'correct' ? this.points() : 0
    this.participant.answered += 1
    this.participant.score += points
    if (outcome === 'correct') this.participant.correct += 1
    this.feedback = {
      outcome,
      points,
      country: countries.get(this.current.countryId)!,
      explanation: this.current.explanation,
      source: this.current.source,
      location: this.current.location,
      clickedCountry,
    }
  }

  private enqueue(work: () => Result | Promise<Result>): Promise<Result> {
    const task = this.pending.then(work).catch((error: unknown): Result => {
      console.error('[stand]', error)
      return fail('Enregistrement impossible. Le score est conservé ; réessayez.')
    })
    this.pending = task.then(() => undefined)
    return task
  }

  submit(payload: unknown): Promise<Result> {
    return this.enqueue(() => {
      if (!payload || typeof payload !== 'object') return fail('Sélectionnez un pays sur le globe.')
      const { pin, turn } = payload as { pin?: unknown; turn?: unknown }
      if (turn !== this.turn) return fail('La question a changé. Choisissez à nouveau un pays.')
      if (this.feedback) return fail('Cette question est déjà résolue.')
      if (!isCoordinates(pin)) return fail('Sélectionnez un pays sur le globe.')
      const clicked = countryAt(...pin)
      if (!clicked) return fail('Cliquez sur une terre, pas dans l’océan.')
      if (clicked.id === this.current.countryId) this.resolve('correct', clicked)
      else if (this.settings.allowRetry && !this.attempts) {
        this.attempts = 1
        return { ok: true, retry: true } // Ni cible, ni distance, ni corrigé dans cet accusé.
      } else this.resolve('incorrect', clicked)
      return ok()
    })
  }

  command(payload: unknown): Promise<Result> {
    return this.enqueue(async () => {
      if (!payload || typeof payload !== 'object') return fail('Commande invalide.')
      const command = payload as Record<string, unknown>
      switch (command.type) {
        case 'hint':
          if (this.feedback || this.hints >= this.current.hints.length)
            return fail('Aucun indice supplémentaire.')
          this.hints += 1
          return ok()
        case 'next':
          if (!this.feedback) return fail('Validez ou passez d’abord cette question.')
          this.openQuestion()
          return ok()
        case 'skip':
          if (this.feedback) return fail('Cette question est déjà résolue.')
          this.resolve('skipped')
          return ok()
        case 'correct':
        case 'incorrect': {
          if (!this.feedback) return fail('Le joueur doit d’abord valider son choix.')
          const correct = command.type === 'correct'
          if (this.feedback.outcome === (correct ? 'correct' : 'incorrect')) return ok()
          const wasCorrect = this.feedback.outcome === 'correct'
          this.participant.score -= this.feedback.points
          this.participant.correct += Number(correct) - Number(wasCorrect)
          this.feedback = {
            ...this.feedback,
            outcome: correct ? 'correct' : 'incorrect',
            points: correct ? this.points() : 0,
          }
          this.participant.score += this.feedback.points
          return ok()
        }
        case 'rename':
          if (typeof command.nickname !== 'string') return fail('Pseudo invalide.')
          this.participant.nickname = nickname(command.nickname, `Visiteur ${this.sequence}`)
          return ok()
        case 'new-participant':
          if (command.nickname !== undefined && typeof command.nickname !== 'string')
            return fail('Pseudo invalide.')
          await this.store.save(this.participant)
          this.participant = this.createParticipant(command.nickname as string | undefined)
          this.used.clear()
          this.openQuestion()
          return ok()
        case 'settings': {
          const setting = command.settings as Partial<StandSettings> | null
          if (
            !setting ||
            (setting.theme !== 'tous' && !bank.themes.some((t) => t.id === setting.theme)) ||
            !['progressive', 1, 2, 3, 4].includes(setting.difficulty ?? '') ||
            typeof setting.allowRetry !== 'boolean'
          ) {
            return fail('Réglages invalides.')
          }
          const changed =
            setting.theme !== this.settings.theme || setting.difficulty !== this.settings.difficulty
          this.settings = {
            theme: setting.theme!,
            difficulty: setting.difficulty!,
            allowRetry: setting.allowRetry,
          }
          if (changed && !this.feedback) this.openQuestion()
          return ok()
        }
        default:
          return fail('Commande inconnue.')
      }
    })
  }

  playerState(): PlayerState {
    const { nickname, score, correct, answered } = this.participant
    const difficulty = bank.difficulties.find((d) => d.value === this.current.difficulty)!
    return {
      role: 'player',
      phase: this.feedback ? 'feedback' : 'question',
      participant: { nickname, score, correct, answered },
      question: {
        id: this.current.id,
        turn: this.turn,
        prompt: this.current.question,
        themeLabel: bank.themes.find((t) => t.id === this.current.theme)!.label,
        difficulty: this.current.difficulty,
        difficultyLabel: difficulty.label,
        points: this.points(),
        hints: this.current.hints.slice(0, this.hints),
        attempts: this.attempts,
      },
      feedback: this.feedback ? structuredClone(this.feedback) : null,
      leaderboard: this.store.leaderboard(),
    }
  }

  presenterState(): PresenterState {
    return {
      ...this.playerState(),
      role: 'presenter',
      answer: {
        country: countries.get(this.current.countryId)!,
        explanation: this.current.explanation,
        source: this.current.source,
        location: this.current.location,
      },
      settings: { ...this.settings },
      catalog,
    }
  }
}

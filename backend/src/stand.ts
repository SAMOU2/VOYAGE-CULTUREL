import { randomUUID } from 'node:crypto'
import { bank, catalog, countries, countryAt, pointsFor, questionById, questions } from './data.js'
import { chooseQuestion } from './random.js'
import { JsonStore } from './store.js'
import { SettingsStore, validateSettings } from './settings.js'
import { isCoordinates } from '../../shared/geometry.js'
import { isValidName, levelFor, nameKey, normalizeName, STAGE_COUNT } from '../../shared/game.js'
import type {
  AttemptRecord,
  Country,
  Feedback,
  GameSettings,
  PlayerState,
  PresenterState,
  Question,
  Result,
  StoredSession,
  UsersFile,
} from '../../shared/types.js'

class RuleError extends Error {}
const fail = (message: string): never => {
  throw new RuleError(message)
}
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Demande invalide.')
  return value as Record<string, unknown>
}

/** Un stand, une tentative active. Toute mutation est sérialisée et persistée avant diffusion. */
export class Stand {
  private pending: Promise<void> = Promise.resolve()
  private revision = Date.now()
  constructor(
    readonly store: JsonStore,
    readonly configuration: SettingsStore,
    private random: () => number = Math.random,
  ) {
    const session = store.session
    if (session) {
      validateSettings(session.settings)
      const question = questionById.get(session.questionId)
      if (!question || (session.feedback && session.feedback.country.id !== question.countryId))
        throw new Error(
          'La session sauvegardée ne correspond pas à la banque. Conservez users.json avant de la réparer.',
        )
    }
  }
  get settings(): GameSettings {
    return this.configuration.current
  }
  private enqueue(work: () => Result | Promise<Result>): Promise<Result> {
    const task = this.pending
      .then(work)
      .then((result) => {
        if (result.ok && !result.returning) this.revision = Math.max(Date.now(), this.revision + 1)
        return result
      })
      .catch((error: unknown): Result => {
        if (error instanceof RuleError) return { ok: false, error: error.message }
        console.error('[stand]', error)
        return {
          ok: false,
          error: 'Enregistrement impossible. Les données précédentes sont conservées ; réessayez.',
        }
      })
    this.pending = task.then(() => undefined)
    return task
  }
  async flush(): Promise<void> {
    await this.pending
  }
  private attempt(data: UsersFile): AttemptRecord {
    const attempt = data.attempts.find((a) => a.id === data.session?.attemptId)
    if (!attempt || !data.session) return fail('Aucune partie en cours.')
    return attempt
  }
  private guard(
    data: UsersFile,
    payload: Record<string, unknown>,
    playing = true,
  ): { session: StoredSession; attempt: AttemptRecord; question: Question } {
    const attempt = this.attempt(data),
      session = data.session!
    if (payload.attemptId !== attempt.id || payload.turn !== session.turn)
      fail('La question ou le joueur a changé. Actualisez votre choix.')
    if (playing && attempt.status !== 'playing') fail('Cette tentative est terminée.')
    return { session, attempt, question: questionById.get(session.questionId)! }
  }
  private openQuestion(
    data: UsersFile,
    attempt: AttemptRecord,
    settings: GameSettings,
    previous: StoredSession | null,
    excludedId?: string,
  ): void {
    const difficulty = levelFor(attempt.answered, settings.questionsPerStage)
    const ids = new Set(settings.mode === 'club33' ? settings.clubCountryIds : countries.keys())
    const used = new Set(previous?.usedQuestionIds ?? [])
    const question = chooseQuestion(questions, ids, difficulty, used, this.random, excludedId)
    used.add(question.id)
    attempt.maxLevel = Math.max(attempt.maxLevel, difficulty) as AttemptRecord['maxLevel']
    data.nextTurn += 1
    data.session = {
      attemptId: attempt.id,
      questionId: question.id,
      questionToken: randomUUID(),
      turn: data.nextTurn,
      hintsRevealed: 0,
      tries: 0,
      feedback: null,
      usedQuestionIds: [...used],
      settings: structuredClone(settings),
    }
  }
  private points(question: Question, session: StoredSession): number {
    const base = Math.max(5, pointsFor(question.difficulty) - session.hintsRevealed * 5)
    return session.tries ? Math.max(5, Math.round(base / 2)) : base
  }
  private resolve(
    attempt: AttemptRecord,
    session: StoredSession,
    question: Question,
    clicked: Country,
    pin: [number, number],
  ): void {
    const correct = clicked.id === question.countryId
    const points = correct ? this.points(question, session) : 0
    const outcome = correct ? 'correct' : 'incorrect'
    attempt.answers.push({
      id: randomUUID(),
      questionId: question.id,
      countryId: question.countryId,
      difficulty: question.difficulty,
      selectedCountryId: clicked.id,
      pin: [...pin],
      outcome,
      points,
      hintsUsed: session.hintsRevealed,
      tries: session.tries + 1,
      answeredAt: new Date().toISOString(),
    })
    attempt.answered += 1
    attempt.score += points
    attempt.correct += Number(correct)
    session.feedback = {
      outcome,
      points,
      country: countries.get(question.countryId)!,
      explanation: question.explanation,
      source: question.source,
      location: question.location,
      clickedCountry: { id: clicked.id, name: clicked.name },
    }
    if (attempt.answered >= session.settings.questionsPerStage * STAGE_COUNT) {
      attempt.status = 'completed'
      attempt.finishedAt = new Date().toISOString()
    }
  }
  begin(payload: unknown): Promise<Result> {
    return this.enqueue(async () => {
      const request = object(payload)
      if (
        typeof request.fullName !== 'string' ||
        (request.confirmExisting !== undefined && typeof request.confirmExisting !== 'boolean')
      )
        fail('Saisissez votre nom et prénom dans le même champ.')
      const fullName = normalizeName(request.fullName as string)
      if (!isValidName(fullName))
        fail('Saisissez un nom de 2 à 64 caractères contenant au moins une lettre.')
      const current = this.store.session
      if (current && this.store.attempt(current.attemptId)?.status === 'playing')
        fail('Une partie est déjà en cours sur cet écran.')
      const existing = this.store.findUser(fullName)
      if (existing && !request.confirmExisting)
        return {
          ok: true,
          returning: {
            fullName: existing.fullName,
            attempts: this.store.attemptCount(existing.id),
            bestScore: this.store.bestScore(existing.id),
          },
        }
      const settings = this.settings
      await this.store.transaction((data) => {
        const now = new Date().toISOString(),
          key = nameKey(fullName)
        let user = data.users.find((u) => u.nameKey === key)
        if (!user) {
          user = { id: randomUUID(), fullName, nameKey: key, createdAt: now }
          data.users.push(user)
        }
        const attempt: AttemptRecord = {
          id: randomUUID(),
          userId: user.id,
          fullName: user.fullName,
          startedAt: now,
          finishedAt: null,
          status: 'playing',
          score: 0,
          correct: 0,
          answered: 0,
          maxLevel: 1,
          mode: settings.mode,
          questionsPerStage: settings.questionsPerStage,
          answers: [],
        }
        data.attempts.push(attempt)
        this.openQuestion(data, attempt, settings, null)
      })
      return { ok: true }
    })
  }
  submit(payload: unknown): Promise<Result> {
    return this.enqueue(async () => {
      const request = object(payload)
      let retry = false
      await this.store.transaction((data) => {
        const { session, attempt, question } = this.guard(data, request)
        if (session.feedback) fail('Cette question est déjà résolue.')
        if (!isCoordinates(request.pin)) fail('Sélectionnez un pays sur le globe.')
        const pin = request.pin as [number, number]
        const clicked = countryAt(...pin)
        if (!clicked) return fail('Sélectionnez une terre, pas l’océan.')
        if (
          session.settings.mode === 'club33' &&
          !session.settings.clubCountryIds.includes(clicked.id)
        )
          fail('Ce pays ne fait pas partie de la sélection des 33 pays.')
        if (
          clicked.id !== question.countryId &&
          session.settings.allowRetry &&
          session.tries === 0
        ) {
          session.tries = 1
          retry = true
        } else this.resolve(attempt, session, question, clicked, pin)
      })
      return retry ? { ok: true, retry: true } : { ok: true }
    })
  }
  next(payload: unknown): Promise<Result> {
    return this.enqueue(async () => {
      const request = object(payload)
      await this.store.transaction((data) => {
        const { session, attempt } = this.guard(data, request)
        if (!session.feedback) fail('Validez d’abord votre réponse.')
        this.openQuestion(data, attempt, session.settings, session)
      })
      return { ok: true }
    })
  }
  leave(payload: unknown): Promise<Result> {
    return this.enqueue(async () => {
      const request = object(payload)
      await this.store.transaction((data) => {
        const attempt = this.attempt(data)
        if (request.attemptId !== attempt.id) fail('Le joueur a changé.')
        if (attempt.status === 'playing') fail('La partie est encore en cours.')
        data.session = null
      })
      return { ok: true }
    })
  }
  command(payload: unknown): Promise<Result> {
    return this.enqueue(async () => {
      const command = object(payload)
      if (command.type === 'settings') {
        let settings: GameSettings
        try {
          settings = validateSettings(command.settings)
        } catch (error) {
          return fail((error as Error).message)
        }
        await this.configuration.save(settings)
        return { ok: true }
      }
      await this.store.transaction((data) => {
        if (command.type === 'reset') {
          if (data.session) {
            const attempt = this.attempt(data)
            if (attempt.status === 'playing') {
              attempt.status = 'stopped'
              attempt.finishedAt = new Date().toISOString()
            }
          }
          data.session = null
          return
        }
        if (command.type === 'end-game') {
          const attempt = this.attempt(data)
          if (attempt.id !== command.attemptId) fail('Le joueur a changé.')
          if (attempt.status === 'playing') {
            attempt.status = 'stopped'
            attempt.finishedAt = new Date().toISOString()
          }
          return
        }
        const { session, attempt, question } = this.guard(data, command, false)
        switch (command.type) {
          case 'hint':
            if (attempt.status !== 'playing' || session.feedback || session.hintsRevealed >= 2)
              fail('Aucun indice supplémentaire disponible.')
            session.hintsRevealed += 1
            break
          case 'next':
            if (attempt.status !== 'playing' || !session.feedback)
              fail('Validez d’abord la question, ou terminez la partie.')
            this.openQuestion(data, attempt, session.settings, session)
            break
          case 'replace-question':
            if (attempt.status !== 'playing' || session.feedback)
              fail('Seule une question non résolue peut être remplacée.')
            this.openQuestion(data, attempt, session.settings, session, question.id)
            break
          case 'correct':
          case 'incorrect': {
            const record = attempt.answers.at(-1)
            if (!session.feedback || !record || record.questionId !== question.id)
              fail('Le joueur doit d’abord valider sa réponse.')
            const correct = command.type === 'correct',
              points = correct ? this.points(question, session) : 0
            attempt.score += points - record!.points
            attempt.correct += Number(correct) - Number(record!.outcome === 'correct')
            record!.outcome = correct ? 'correct' : 'incorrect'
            record!.points = points
            session.feedback = { ...session.feedback!, outcome: record!.outcome, points }
            break
          }
          default:
            fail('Commande inconnue.')
        }
      })
      return { ok: true }
    })
  }
  playerState(): PlayerState {
    const session = this.store.session,
      attempt = session ? this.store.attempt(session.attemptId) : null
    const question = session ? questionById.get(session.questionId)! : null
    return {
      role: 'player',
      revision: this.revision,
      phase:
        !session || !attempt
          ? 'idle'
          : attempt.status !== 'playing'
            ? 'finished'
            : session.feedback
              ? 'feedback'
              : 'question',
      game:
        session && attempt && question
          ? {
              id: attempt.id,
              fullName: attempt.fullName,
              score: attempt.score,
              correct: attempt.correct,
              answered: attempt.answered,
              stage: question.difficulty,
              stageAnswered: Math.max(
                0,
                Math.min(
                  session.settings.questionsPerStage,
                  attempt.answered - (question.difficulty - 1) * session.settings.questionsPerStage,
                ),
              ),
              stages: 4,
              questionsPerStage: session.settings.questionsPerStage,
              totalQuestions: session.settings.questionsPerStage * 4,
              mode: attempt.mode,
              scopeCountryIds:
                attempt.mode === 'club33' ? [...session.settings.clubCountryIds] : null,
              allowRetry: session.settings.allowRetry,
              status: attempt.status,
            }
          : null,
      question:
        session && question
          ? {
              id: session.questionToken,
              turn: session.turn,
              prompt: question.question,
              themeLabel: bank.themes.find((t) => t.id === question.theme)!.label,
              difficulty: question.difficulty,
              difficultyLabel: bank.difficulties.find((d) => d.value === question.difficulty)!
                .label,
              points: this.points(question, session),
              hints: question.hints.slice(0, session.hintsRevealed),
              attempts: session.tries,
            }
          : null,
      feedback: session?.feedback ? structuredClone(session.feedback) : null,
      leaderboard: this.store.leaderboard(),
    }
  }
  presenterState(): PresenterState {
    const session = this.store.session,
      question = session ? questionById.get(session.questionId) : null
    return {
      ...this.playerState(),
      role: 'presenter',
      answer: question
        ? {
            country: countries.get(question.countryId)!,
            explanation: question.explanation,
            source: question.source,
            location: question.location,
            hints: question.hints,
          }
        : null,
      settings: this.settings,
      adminLeaderboard: this.store.adminLeaderboard(),
    }
  }
  get catalog() {
    return catalog
  }
}

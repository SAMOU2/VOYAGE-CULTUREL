import type { Feature, Geometry } from 'geojson'
import type { GeometryCollection, Topology } from 'topojson-specification'

export type Coordinates = [number, number]
export type Difficulty = 1 | 2 | 3 | 4
export type GameMode = 'club33' | 'world'
export type Role = 'player' | 'presenter'
export interface Country {
  id: string
  name: string
  iso2: string | null
  center: Coordinates
}
export type CountryFeature = Feature<Geometry, { name: string; nameEn?: string; isoN?: string }>
export type CountryTopology = Topology<{
  countries: GeometryCollection<{ name: string; nameEn?: string; isoN?: string }>
}>
export interface CountriesFile {
  version: number
  attribution: string
  countries: Country[]
}
export interface Source {
  label: string
  url: string
}
export interface Question {
  id: string
  countryId: string
  theme: string
  difficulty: Difficulty
  question: string
  hints: [string, string]
  explanation: string
  location: Coordinates
  source: Source
}
export interface Theme {
  id: string
  label: string
  emoji: string
  color: string
}
export interface DifficultyInfo {
  id: string
  value: Difficulty
  label: string
  points: number
}
export interface QuestionBankFile {
  attribution: string
  license: Source
  version: string
  checkedAt: string
  themes: Theme[]
  difficulties: DifficultyInfo[]
  byCountry: Record<string, Question[]>
}
export interface CountryFact {
  id: string
  countryId: string
  countryName: string
  region: string
  pin: Coordinates
  facts: { id: string; title: string; text: string; source: Source }[]
}
export interface FactsFile {
  version: 1
  attribution: string
  license: Source
  countries: CountryFact[]
}
export interface GameSettings {
  mode: GameMode
  clubCountryIds: string[]
  questionsPerStage: number
  allowRetry: boolean
}
export interface Catalog {
  themes: Theme[]
  difficulties: DifficultyInfo[]
  questions: number
  countries: { id: string; name: string; region: string }[]
}
export interface UserRecord {
  id: string
  fullName: string
  nameKey: string
  createdAt: string
}
export type AttemptStatus = 'playing' | 'completed' | 'stopped' | 'interrupted'
export interface AnswerRecord {
  id: string
  questionId: string
  countryId: string
  difficulty: Difficulty
  selectedCountryId: string | null
  pin: Coordinates | null
  outcome: 'correct' | 'incorrect'
  points: number
  hintsUsed: number
  tries: number
  answeredAt: string
}
export interface AttemptRecord {
  id: string
  userId: string
  fullName: string
  startedAt: string
  finishedAt: string | null
  status: AttemptStatus
  score: number
  correct: number
  answered: number
  maxLevel: Difficulty
  mode: GameMode
  questionsPerStage: number
  answers: AnswerRecord[]
  migrated?: boolean
}
export interface Feedback {
  outcome: 'correct' | 'incorrect'
  points: number
  country: Country
  explanation: string
  source: Source
  location: Coordinates
  clickedCountry: Pick<Country, 'id' | 'name'> | null
}
/** Seulement dans users.json côté serveur : jamais envoyé tel quel au joueur. */
export interface StoredSession {
  attemptId: string
  questionId: string
  questionToken: string
  turn: number
  hintsRevealed: number
  tries: number
  feedback: Feedback | null
  usedQuestionIds: string[]
  settings: GameSettings
}
export interface UsersFile {
  version: 2
  nextTurn: number
  users: UserRecord[]
  attempts: AttemptRecord[]
  session: StoredSession | null
}
export interface LeaderboardEntry {
  rank: number
  userId: string
  fullName: string
  score: number
  correct: number
  answered: number
  level: Difficulty
  completedAt: string
}
export interface AdminLeaderboardEntry extends LeaderboardEntry {
  attempts: number
  bestAttemptId: string
}
export type AttemptSummary = Omit<AttemptRecord, 'answers'>
export interface PublicQuestion {
  /** Identifiant opaque, distinct de l'ID interne de la banque. */
  id: string
  turn: number
  prompt: string
  themeLabel: string
  difficulty: Difficulty
  difficultyLabel: string
  points: number
  hints: string[]
  attempts: number
}
export interface PublicGame {
  id: string
  fullName: string
  score: number
  correct: number
  answered: number
  stage: Difficulty
  stageAnswered: number
  stages: 4
  questionsPerStage: number
  totalQuestions: number
  mode: GameMode
  scopeCountryIds: string[] | null
  allowRetry: boolean
  status: AttemptStatus
}
export interface PlayerState {
  role: 'player'
  revision: number
  phase: 'idle' | 'question' | 'feedback' | 'finished'
  game: PublicGame | null
  question: PublicQuestion | null
  feedback: Feedback | null
  leaderboard: LeaderboardEntry[]
}
export interface PresenterState extends Omit<PlayerState, 'role'> {
  role: 'presenter'
  answer: {
    country: Country
    explanation: string
    source: Source
    location: Coordinates
    hints: [string, string]
  } | null
  settings: GameSettings
  adminLeaderboard: AdminLeaderboardEntry[]
}
export type StandState = PlayerState | PresenterState
export interface TurnPayload {
  attemptId: string
  turn: number
}
export interface BeginPayload {
  fullName: string
  confirmExisting?: boolean
}
export type Command =
  | {
      type: 'hint' | 'next' | 'replace-question' | 'correct' | 'incorrect'
      attemptId: string
      turn: number
    }
  | { type: 'end-game'; attemptId: string }
  | { type: 'reset' }
  | { type: 'settings'; settings: GameSettings }
export interface ReturningPlayer {
  fullName: string
  attempts: number
  bestScore: number
}
export interface ActionData {
  retry?: boolean
  returning?: ReturningPlayer
}
export type Failure = { ok: false; error: string }
export type Result<T extends object = ActionData> = ({ ok: true } & T) | Failure
export type Ack<T extends object = ActionData> = (result: Result<T>) => void
export interface ClientEvents {
  'stand:watch': (payload: Record<string, never>, ack: Ack) => void
  'stand:current-question': (
    payload: Record<string, never>,
    ack: Ack<{ state: StandState }>,
  ) => void
  'presenter:claim': (payload: { token?: string }, ack: Ack<{ token: string }>) => void
  'presenter:command': (payload: Command, ack: Ack) => void
  'presenter:history': (
    payload: { userId: string },
    ack: Ack<{ attempts: AttemptSummary[] }>,
  ) => void
  'player:begin': (payload: BeginPayload, ack: Ack) => void
  'player:submit': (payload: TurnPayload & { pin: Coordinates }, ack: Ack) => void
  'player:next': (payload: TurnPayload, ack: Ack) => void
  'player:leave': (payload: { attemptId: string }, ack: Ack) => void
}
export interface ServerEvents {
  'stand:state': (state: StandState) => void
  'presenter:replaced': () => void
}
export interface SocketData {
  role?: Role
}

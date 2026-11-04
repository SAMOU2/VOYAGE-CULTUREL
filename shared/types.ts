import type { Feature, Geometry } from 'geojson'
import type { GeometryCollection, Topology } from 'topojson-specification'

export type Coordinates = [number, number]
export type Difficulty = 1 | 2 | 3 | 4
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
  version: string
  checkedAt: string
  themes: Theme[]
  difficulties: DifficultyInfo[]
  byCountry: Record<string, Question[]>
}
export interface StandSettings {
  theme: string
  difficulty: Difficulty | 'progressive'
  allowRetry: boolean
}
export interface Catalog {
  themes: Theme[]
  difficulties: DifficultyInfo[]
  questions: number
  countries: number
}
export interface Participant {
  id: string
  nickname: string
  startedAt: string
  score: number
  correct: number
  answered: number
}
export interface UserRecord {
  id: string
  nickname: string
  createdAt: string
}
export interface ScoreRecord {
  id: string
  userId: string
  score: number
  correct: number
  answered: number
  completedAt: string
  durationMs: number
}
export interface UsersFile {
  version: 1
  users: UserRecord[]
  leaderboard: ScoreRecord[]
}
export interface LeaderboardEntry {
  rank: number
  nickname: string
  score: number
  correct: number
  answered: number
  completedAt: string
}
export interface PublicQuestion {
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
export interface Feedback {
  outcome: 'correct' | 'incorrect' | 'skipped'
  points: number
  country: Country
  explanation: string
  source: Source
  location: Coordinates
  clickedCountry: Pick<Country, 'id' | 'name'> | null
}
export interface PlayerState {
  role: 'player'
  phase: 'question' | 'feedback'
  participant: Pick<Participant, 'nickname' | 'score' | 'correct' | 'answered'>
  question: PublicQuestion
  feedback: Feedback | null
  leaderboard: LeaderboardEntry[]
}
export interface PresenterState extends Omit<PlayerState, 'role'> {
  role: 'presenter'
  answer: { country: Country; explanation: string; source: Source; location: Coordinates }
  settings: StandSettings
  catalog: Catalog
}
export type StandState = PlayerState | PresenterState
export type Command =
  | { type: 'hint' | 'next' | 'skip' | 'correct' | 'incorrect' }
  | { type: 'new-participant'; nickname?: string }
  | { type: 'rename'; nickname: string }
  | { type: 'settings'; settings: StandSettings }
export type Result = { ok: true; retry?: boolean; token?: string } | { ok: false; error: string }
export type Ack = (result: Result) => void
export interface ClientEvents {
  'stand:watch': (payload: Record<string, never>, ack: Ack) => void
  'presenter:claim': (payload: { token?: string }, ack: Ack) => void
  'presenter:command': (payload: Command, ack: Ack) => void
  'player:submit': (payload: { turn: number; pin: Coordinates }, ack: Ack) => void
}
export interface ServerEvents {
  'stand:state': (state: StandState) => void
  'presenter:replaced': () => void
}
export interface SocketData {
  role?: 'player' | 'presenter'
}

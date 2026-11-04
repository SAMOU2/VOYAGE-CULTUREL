export type RoomStatus = 'lobby' | 'playing' | 'finished'
export type QuestionStatus = 'open' | 'answered' | 'feedback'
export type Outcome = 'correct' | 'incorrect' | 'skipped' | 'ended'

export interface Hints {
  hintLevel: number
  hints: string[]
  hintsRemaining: number
}

export interface PlayerQuestion {
  id: string
  theme: string
  themeLabel: string
  difficulty: number
  question: string
  hints: string[]
  hintLevel: number
  hintsRemaining: number
  attempts: number
  allowRetry: boolean
  status: QuestionStatus
  answered: boolean
}

export type Precision = 'exact' | 'country' | 'near' | 'miss' | 'skip' | 'refus' | 'manual' | 'force' | 'annule'

export interface PlayerFeedback {
  outcome: Outcome
  points: number
  precision: Precision
  clickedCountry: { id: string; name: string } | null
  automatic: boolean
  question: string
  answer: string
  explanation: string
  country: string
  countryCode: string
  isoN: string
  coords: [number, number]
  source: { label: string; url: string }
  playerPin: [number, number] | null
  playerText: string
  submittedAnswer: boolean
}

export interface PlayerState {
  role: 'player'
  roomCode: string
  roomName: string
  status: RoomStatus
  pseudo: string | null
  score: number
  level: number
  levelProgress: { level: number; current: number; next: number | null; ratio: number }
  correct: number
  total: number
  progress: { index: number; total: number }
  question: PlayerQuestion | null
  feedback: PlayerFeedback | null
  found: string[]
  finished: null | {
    score: number
    correct: number
    total: number
    badge: { id: string; label: string; emoji: string; min: number }
    found: string[]
    durationMs: number
  }
}

export interface HostCurrent {
  id: string
  theme: string
  themeLabel: string
  difficulty: number
  question: string
  answer: string
  accepted: string[]
  hints: string[]
  hintLevel: number
  explanation: string
  country: string
  countryCode: string
  isoN: string
  coords: [number, number]
  source: { label: string; url: string }
  status: QuestionStatus
  attempts: number
  resolved: {
    outcome: Outcome
    points: number
    precision: Precision
    clickedCountry: { id: string; name: string } | null
    automatic?: boolean
  } | null
  distanceKm: number | null
  nearTarget: boolean | null
  autoMatch: boolean | null
}

export interface HostState {
  role: 'host'
  roomCode: string
  roomName: string
  status: RoomStatus
  config: {
    theme: string
    difficulty: number | 'mixte'
    count: number
    allowRetry: boolean
    themeLabel: string
    difficultyLabel: string
  }
  player: null | {
    pseudo: string
    connected: boolean
    score: number
    level: number
    correct: number
    found: string[]
    hasAnswered: boolean
    pin: [number, number] | null
    clickedCountry: { id: string; name: string } | null
  }
  progress: { index: number; total: number }
  current: HostCurrent | null
  history: Array<{
    questionId: string
    outcome: Outcome
    points: number
    precision: Precision
    clickedCountry: { id: string; name: string } | null
    pin: [number, number] | null
    hintsUsed: number
    distanceKm: number | null
    at: number
  }>
  badge: { id: string; label: string; emoji: string; min: number }
  startedAt: number | null
  finishedAt: number | null
  bankSize: number
}

export type AnyState = PlayerState | HostState

/** Liste publique de parties : aucune question, identité de joueur ou donnée privée. */
export interface AvailableRoom {
  id: string
  name: string
  themeLabel: string
  difficultyLabel: string
  count: number
}

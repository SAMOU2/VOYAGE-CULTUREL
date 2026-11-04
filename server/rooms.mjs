import crypto from 'node:crypto'
import {
  POINTS_BY_DIFFICULTY,
  QUESTIONS,
  buildQueue,
  checkAnswer,
  difficultyLabel,
  distanceKm,
  getQuestion,
  levelProgress,
  themeLabel,
} from './questions.mjs'

/** @type {Map<string, any>} */
export const rooms = new Map()

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const MAX_ROOMS = 500
const ROOM_TTL_MS = 6 * 60 * 60 * 1000
const HINT_PENALTY = 5
const MIN_POINTS = 5

export const BADGES = [
  { min: 220, id: 'legende', label: 'Explorateur légendaire', emoji: '🌍' },
  { min: 140, id: 'grand', label: 'Grand voyageur', emoji: '🧭' },
  { min: 80, id: 'globe', label: 'Globe-trotteur', emoji: '✈️' },
  { min: 0, id: 'apprenti', label: 'Apprenti explorateur', emoji: '🎒' },
]

export function badgeFor(score) {
  return BADGES.find((b) => score >= b.min) ?? BADGES[BADGES.length - 1]
}

export function randomCode() {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    let code = ''
    for (let i = 0; i < 5; i += 1) {
      code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]
    }
    if (!rooms.has(code)) return code
  }
  return crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 6)
}

export function normalizeDifficulty(value) {
  if (value === 'mixte' || value == null || value === '') return 'mixte'
  const n = Number(value)
  return n === 1 || n === 2 || n === 3 ? n : 'mixte'
}

export function createRoom(config = {}) {
  cleanup()

  const room = {
    code: randomCode(),
    hostToken: crypto.randomBytes(18).toString('hex'),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    status: 'lobby', // lobby | playing | finished
    config: {
      theme: typeof config.theme === 'string' && config.theme ? config.theme : 'tous',
      difficulty: normalizeDifficulty(config.difficulty),
      count: Math.max(3, Math.min(Number(config.count) || 8, 15)),
      allowRetry: config.allowRetry !== false,
    },
    hostSocketId: null,
    player: null,
    queue: [],
    index: 0,
    question: null,
    history: [],
    startedAt: null,
    finishedAt: null,
    log: [],
  }

  rooms.set(room.code, room)
  trimRooms()
  return room
}

function trimRooms() {
  if (rooms.size <= MAX_ROOMS) return
  const oldest = [...rooms.values()].sort((a, b) => a.updatedAt - b.updatedAt)
  for (const room of oldest.slice(0, rooms.size - MAX_ROOMS)) rooms.delete(room.code)
}

export function cleanup(now = Date.now()) {
  for (const [code, room] of rooms) {
    const idle = now - room.updatedAt
    const limit = room.player?.connected || room.hostSocketId ? ROOM_TTL_MS : 30 * 60 * 1000
    if (idle > limit) rooms.delete(code)
  }
}

export function getRoom(code) {
  return rooms.get(String(code || '').toUpperCase().trim()) ?? null
}

export function touch(room) {
  room.updatedAt = Date.now()
}

export function joinPlayer(room, pseudo, socketId) {
  const name = String(pseudo || '').trim().slice(0, 18) || 'Joueur'
  const existing = room.player

  // Une seule place par salle : on refuse un second joueur tant que le siège est occupé.
  if (existing && existing.connected) {
    return { error: 'Cette salle a déjà un joueur. Demandez un nouveau code au présentateur.' }
  }

  if (existing) {
    // Reprise du siège laissé libre (déconnexion ou départ).
    existing.pseudo = name
    existing.socketId = socketId
    existing.connected = true
    existing.text = ''
    existing.pin = null
    if (room.status !== 'playing') {
      existing.score = 0
      existing.correct = 0
      existing.found = []
    }
    touch(room)
    return { playerId: existing.id }
  }

  room.player = {
    id: crypto.randomBytes(8).toString('hex'),
    pseudo: name,
    socketId,
    connected: true,
    joinedAt: Date.now(),
    score: 0,
    correct: 0,
    found: [],
    text: '',
    pin: null,
    hintsUsed: 0,
    attempts: 0,
  }
  room.status = 'lobby'
  touch(room)
  return { playerId: room.player.id }
}

export function startGame(room) {
  if (!room.player) return { error: 'Aucun joueur connecté.' }
  if (!room.player.connected) return { error: 'Le joueur est déconnecté.' }

  room.queue = buildQueue(room.config)
  room.index = 0
  room.history = []
  room.status = 'playing'
  room.startedAt = Date.now()
  room.finishedAt = null
  room.player.score = 0
  room.player.correct = 0
  room.player.found = []
  room.player.hintsUsed = 0
  room.player.attempts = 0
  room.player.text = ''
  room.player.pin = null
  openQuestion(room)
  touch(room)
  return { ok: true }
}

function openQuestion(room) {
  const id = room.queue[room.index]
  const data = getQuestion(id)
  // On copie la fiche de la question (jamais mutée dans la banque) et on y ajoute l'état de la manche.
  room.question = data
    ? { ...data, hintLevel: 0, status: 'open', attempts: 0, resolved: null }
    : null
  if (room.player) {
    room.player.text = ''
    room.player.pin = null
    room.player.attempts = 0
    room.player.hintsUsed = 0
  }
}

export function submitAnswer(room, payload = {}) {
  if (room.status !== 'playing' || !room.question) return { error: 'Aucune question en cours.' }
  if (room.question.status === 'feedback') return { error: 'Question déjà résolue.' }

  const player = room.player
  if (!player) return { error: 'Aucun joueur.' }

  const text = String(payload.text || '').slice(0, 140)
  const pin =
    Array.isArray(payload.pin) && payload.pin.length === 2
      ? [Number(payload.pin[0]), Number(payload.pin[1])]
      : null
  const validPin =
    pin && Number.isFinite(pin[0]) && Number.isFinite(pin[1]) && Math.abs(pin[1]) <= 90 ? pin : null

  player.text = text
  player.pin = validPin
  player.answeredAt = Date.now()
  room.question.status = 'answered'
  touch(room)
  return { ok: true }
}

function basePoints(question) {
  return POINTS_BY_DIFFICULTY[question.difficulty] ?? 10
}

function computePoints(room, question) {
  let points = basePoints(question) - HINT_PENALTY * (room.question?.hintLevel ?? 0)
  // Seconde chance : la réponse ne vaut plus que la moitié des points restants.
  if ((room.question?.attempts ?? 0) > 0) points = Math.round(points / 2)
  return Math.max(MIN_POINTS, points)
}

function resolve(room, outcome, points) {
  const question = room.question
  const player = room.player
  question.status = 'feedback'
  question.resolved = { outcome, points: Math.max(0, points) }
  if (outcome === 'correct') {
    player.score += Math.max(0, points)
    player.correct += 1
    if (!player.found.includes(resolveCountry(question))) player.found.push(resolveCountry(question))
  }
  room.history.push({
    questionId: question.id,
    outcome,
    points: Math.max(0, points),
    text: player.text,
    pin: player.pin,
    hintsUsed: question.hintLevel,
    distanceKm: distanceKm(player.pin, question.coords),
    at: Date.now(),
  })
  touch(room)
}

function resolveCountry(question) {
  return question.country
}

export function hostCommand(room, type, payload = {}) {
  if (!room) return { error: 'Salle introuvable.' }
  const question = room.question

  switch (type) {
    case 'start': {
      if (room.status === 'playing') return { error: 'La partie est déjà en cours.' }
      return startGame(room)
    }
    case 'hint': {
      if (room.status !== 'playing' || !question) return { error: 'Aucune question en cours.' }
      if (question.status === 'feedback') return { error: 'Question déjà résolue.' }
      if (question.hintLevel >= question.hints.length) return { error: 'Tous les indices sont déjà donnés.' }
      question.hintLevel += 1
      room.player.hintsUsed = question.hintLevel
      touch(room)
      return { ok: true }
    }
    case 'correct': {
      if (room.status !== 'playing' || !question || question.status === 'feedback')
        return { error: 'Aucune réponse à valider.' }
      resolve(room, 'correct', computePoints(room, question))
      return { ok: true }
    }
    case 'incorrect': {
      if (room.status !== 'playing' || !question || question.status === 'feedback')
        return { error: 'Aucune réponse à refuser.' }
      if (room.config.allowRetry && question.attempts < 1) {
        question.attempts += 1
        room.player.attempts = question.attempts
        question.status = 'open'
        room.player.text = ''
        room.player.pin = null
        touch(room)
        return { ok: true, retry: true }
      }
      resolve(room, 'incorrect', 0)
      return { ok: true }
    }
    case 'skip': {
      if (room.status !== 'playing' || !question) return { error: 'Aucune question en cours.' }
      if (question.status === 'feedback') return { error: 'Question déjà résolue.' }
      resolve(room, 'skipped', 0)
      return { ok: true }
    }
    case 'next': {
      if (room.status !== 'playing') return { error: 'La partie n\'est pas en cours.' }
      if (question && question.status !== 'feedback') return { error: 'Résolvez d\'abord la question.' }
      if (room.index >= room.queue.length - 1) {
        finishGame(room)
        return { ok: true, finished: true }
      }
      room.index += 1
      openQuestion(room)
      touch(room)
      return { ok: true }
    }
    case 'end': {
      if (room.status === 'lobby') return { error: 'La partie n\'a pas commencé.' }
      finishGame(room)
      return { ok: true }
    }
    case 'restart': {
      if (!room.player) return { error: 'Aucun joueur dans la salle.' }
      return startGame(room)
    }
    case 'config': {
      if (room.status !== 'lobby') return { error: 'La partie a déjà commencé.' }
      if (payload.theme) room.config.theme = String(payload.theme)
      if (payload.difficulty !== undefined) room.config.difficulty = normalizeDifficulty(payload.difficulty)
      if (payload.count) room.config.count = Math.max(3, Math.min(Number(payload.count) || 8, 15))
      if (payload.allowRetry !== undefined) room.config.allowRetry = Boolean(payload.allowRetry)
      touch(room)
      return { ok: true }
    }
    default:
      return { error: 'Commande inconnue.' }
  }
}

export function finishGame(room) {
  room.status = 'finished'
  room.finishedAt = Date.now()
  if (room.question && room.question.status !== 'feedback') {
    room.question.status = 'feedback'
    room.question.resolved = { outcome: 'ended', points: 0 }
  }
  touch(room)
}

/* ------------------------------- Vues ---------------------------------- */

export function hostView(room) {
  const q = room.question
  const player = room.player
  const totalQuestions = room.queue.length || room.config.count
  const distance = q && player?.pin ? distanceKm(player.pin, q.coords) : null

  return {
    role: 'host',
    roomCode: room.code,
    status: room.status,
    config: { ...room.config, themeLabel: themeLabel(room.config.theme), difficultyLabel: difficultyLabel(room.config.difficulty) },
    player: player
      ? {
          pseudo: player.pseudo,
          connected: player.connected,
          score: player.score,
          level: levelProgress(player.score).level,
          correct: player.correct,
          found: player.found,
          hasAnswered: Boolean(player.text || player.pin),
          text: player.text,
          pin: player.pin,
        }
      : null,
    progress: { index: room.index + 1, total: totalQuestions },
    current: q
      ? {
          id: q.id,
          theme: q.theme,
          themeLabel: themeLabel(q.theme),
          difficulty: q.difficulty,
          question: q.question,
          answer: q.answer,
          accepted: q.accepted,
          hints: q.hints,
          hintLevel: q.hintLevel,
          explanation: q.explanation,
          country: q.country,
          countryCode: q.countryCode,
          isoN: q.isoN,
          coords: q.coords,
          source: q.source,
          status: q.status,
          attempts: q.attempts,
          resolved: q.resolved,
          distanceKm: distance,
          nearTarget: distance != null ? distance < 750 : null,
          autoMatch: player?.text ? checkAnswer(q, player.text) : null,
        }
      : null,
    history: room.history,
    badge: badgeFor(player?.score ?? 0),
    startedAt: room.startedAt,
    finishedAt: room.finishedAt,
    bankSize: QUESTIONS.length,
  }
}

export function playerView(room) {
  const q = room.question
  const player = room.player
  const totalQuestions = room.queue.length || room.config.count
  const progress = levelProgress(player?.score ?? 0)

  const revealed = q && q.status === 'feedback'
  const hints = q ? q.hints.slice(0, q.hintLevel) : []

  return {
    role: 'player',
    roomCode: room.code,
    status: room.status,
    pseudo: player?.pseudo ?? null,
    score: player?.score ?? 0,
    level: progress.level,
    levelProgress: progress,
    correct: player?.correct ?? 0,
    total: totalQuestions,
    progress: { index: room.index + 1, total: totalQuestions },
    question:
      q && room.status === 'playing'
        ? {
            id: q.id,
            theme: q.theme,
            themeLabel: themeLabel(q.theme),
            difficulty: q.difficulty,
            question: q.question,
            hints,
            hintLevel: q.hintLevel,
            hintsRemaining: q.hints.length - q.hintLevel,
            attempts: q.attempts,
            allowRetry: room.config.allowRetry,
            status: q.status,
            answered: Boolean(player?.text || player?.pin),
          }
        : null,
    // La réponse attendue n'atteint le navigateur du joueur qu'après résolution.
    feedback: revealed
      ? {
          outcome: q.resolved?.outcome ?? 'skipped',
          points: q.resolved?.points ?? 0,
          question: q.question,
          answer: q.answer,
          explanation: q.explanation,
          country: q.country,
          countryCode: q.countryCode,
          isoN: q.isoN,
          coords: q.coords,
          source: q.source,
          playerPin: player?.pin ?? null,
          playerText: player?.text ?? '',
          submittedAnswer: checkAnswer(q, player?.text ?? ''),
        }
      : null,
    found: player?.found ?? [],
    finished:
      room.status === 'finished'
        ? {
            score: player?.score ?? 0,
            correct: player?.correct ?? 0,
            total: totalQuestions,
            badge: badgeFor(player?.score ?? 0),
            found: player?.found ?? [],
            durationMs: (room.finishedAt ?? Date.now()) - (room.startedAt ?? Date.now()),
          }
        : null,
  }
}

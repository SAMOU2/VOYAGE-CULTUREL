'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import SiteHeader from '@/components/SiteHeader'
import WorldMap, { type LonLat, type PickedCountry } from '@/components/WorldMap'
import QuestionDetails from '@/components/QuestionDetails'
import { emitAck, getSocket, playerSession } from '@/lib/socket'
import type { PlayerState } from '@/lib/types'

const PRECISION_TEXT: Record<string, string> = {
  exact: 'Emplacement exact',
  country: 'Bon pays',
  near: 'Tout près',
  miss: 'Ce n’est pas le bon pays',
  skip: 'Question passée',
  refus: 'Réponse refusée',
  manual: 'Réponse validée',
  force: 'Points accordés',
  annule: 'Points retirés',
}

function speak(text: string, onEnd: () => void) {
  if (!('speechSynthesis' in window)) return false
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'fr-FR'
  utterance.rate = 0.98
  const voice = window.speechSynthesis.getVoices().find((item) => item.lang.toLowerCase().startsWith('fr'))
  if (voice) utterance.voice = voice
  utterance.onend = onEnd
  utterance.onerror = onEnd
  window.speechSynthesis.speak(utterance)
  return true
}

export default function PlayerPage() {
  const [state, setState] = useState<PlayerState | null>(null)
  const [connected, setConnected] = useState(false)
  const [code, setCode] = useState('')
  const [pseudo, setPseudo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [joined, setJoined] = useState(false)
  const [pin, setPin] = useState<LonLat | null>(null)
  const [selected, setSelected] = useState<PickedCountry | null>(null)
  const [mapMode, setMapMode] = useState<'globe' | 'flat'>('globe')
  const [speaking, setSpeaking] = useState(false)
  const [canSpeak, setCanSpeak] = useState(false)
  const attemptRef = useRef<{ id?: string; attempts?: number }>({})

  const rejoin = useCallback(async () => {
    const session = playerSession.read()
    const urlCode = new URLSearchParams(window.location.search).get('code')?.toUpperCase() ?? ''
    const target = urlCode || session?.code
    if (!target) return
    setCode((value) => value || target)
    if (!session || session.code !== target) return
    const response: any = await emitAck('player:rejoin', { code: target, playerId: session.playerId })
    if (response?.ok) {
      setJoined(true)
      setPseudo(session.pseudo)
    } else {
      playerSession.clear()
      setJoined(false)
      setState(null)
    }
  }, [])

  useEffect(() => {
    const urlCode = new URLSearchParams(window.location.search).get('code')
    if (urlCode) setCode(urlCode.toUpperCase())
    const saved = playerSession.read()
    if (saved?.pseudo) setPseudo((value) => value || saved.pseudo)
    setCanSpeak('speechSynthesis' in window)

    const socket = getSocket()
    const onConnect = () => {
      setConnected(true)
      void rejoin()
    }
    const onDisconnect = () => setConnected(false)
    const onState = (next: PlayerState) => {
      if (next.role !== 'player') return
      setState(next)
      setJoined(true)
    }
    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('state', onState)
    if (socket.connected) onConnect()
    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('state', onState)
      window.speechSynthesis?.cancel()
    }
  }, [rejoin])

  useEffect(() => {
    const question = state?.question
    const previous = attemptRef.current
    if (previous.id !== question?.id || previous.attempts !== question?.attempts) {
      setPin(null)
      setSelected(null)
      setError(null)
      if (previous.id !== question?.id) {
        window.speechSynthesis?.cancel()
        setSpeaking(false)
      }
      attemptRef.current = { id: question?.id, attempts: question?.attempts }
    }
  }, [state?.question?.id, state?.question?.attempts])

  const join = async (event: React.FormEvent) => {
    event.preventDefault()
    if (busy) return
    setError(null)
    const clean = code.trim().toUpperCase()
    if (clean.length !== 5) return setError('Le code doit contenir 5 caractères.')
    if (!pseudo.trim()) return setError('Indiquez votre pseudo.')
    setBusy(true)
    const response: any = await emitAck('player:join', { code: clean, pseudo: pseudo.trim() })
    setBusy(false)
    if (!response?.ok) return setError(response?.error ?? 'Connexion impossible.')
    playerSession.save({ code: clean, playerId: response.playerId, pseudo: response.pseudo ?? pseudo.trim() })
    setJoined(true)
  }

  const pick = (coords: LonLat, country: PickedCountry | null) => {
    setPin(coords)
    setSelected(country)
    setError(country ? null : 'Cliquez sur un pays, pas en pleine mer.')
  }

  const submit = async () => {
    if (busy || !connected || !selected || !pin || state?.question?.status !== 'open') return
    setError(null)
    setBusy(true)
    const response: any = await emitAck('player:submit', { code: state.roomCode, pin })
    setBusy(false)
    if (!response?.ok) setError(response?.error ?? 'Envoi impossible.')
  }

  const leave = () => {
    getSocket().emit('player:leave')
    playerSession.clear()
    window.speechSynthesis?.cancel()
    setSpeaking(false)
    setState(null)
    setJoined(false)
    setPin(null)
    setSelected(null)
    setError(null)
  }

  const toggleListen = () => {
    if (speaking) {
      window.speechSynthesis?.cancel()
      setSpeaking(false)
    } else if (state?.question?.question) {
      setSpeaking(speak(state.question.question, () => setSpeaking(false)))
    }
  }

  if (!joined || !state) {
    return (
      <div className="app">
        <SiteHeader />
        <main id="main-content" className="main page-width">
          <section className="form-page">
            <h1>Rejoindre une partie</h1>
            <p className="page-intro">Entrez le code donné par le présentateur.</p>
            <form className="panel form-fields" onSubmit={join}>
              <div className="field">
                <label htmlFor="room-code">Code de la salle</label>
                <input
                  id="room-code"
                  className="code-input"
                  value={code}
                  onChange={(event) =>
                    setCode(
                      event.target.value
                        .toUpperCase()
                        .replace(/[^A-Z0-9]/g, '')
                        .slice(0, 5)
                    )
                  }
                  placeholder="ABCDE"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  minLength={5}
                  maxLength={5}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="pseudo">Pseudo</label>
                <input
                  id="pseudo"
                  value={pseudo}
                  onChange={(event) => setPseudo(event.target.value.slice(0, 18))}
                  placeholder="Votre prénom ou pseudo"
                  autoComplete="nickname"
                  maxLength={18}
                  required
                />
              </div>
              {error && (
                <p className="error-message" role="alert">
                  {error}
                </p>
              )}
              <button className="btn btn-primary btn-block" type="submit" disabled={busy || !connected}>
                {busy ? 'Connexion…' : 'Rejoindre'}
              </button>
              {!connected && (
                <p className="connection-message" role="status">
                  Connexion au serveur…
                </p>
              )}
            </form>
          </section>
        </main>
      </div>
    )
  }

  const question = state.question
  const feedback = state.feedback

  return (
    <div className="app">
      <SiteHeader>
        <span className="session-room">
          Salle <strong>{state.roomCode}</strong>
        </span>
        <button className="btn btn-ghost btn-sm" type="button" onClick={leave}>
          Quitter
        </button>
      </SiteHeader>
      <main id="main-content" className="main page-width">
        {!connected && (
          <p className="connection-message" role="status">
            Connexion interrompue. Reconnexion en cours…
          </p>
        )}

        {state.status === 'lobby' && (
          <section className="waiting-state">
            <span className="waiting-dot" aria-hidden="true" />
            <h1>En attente du présentateur</h1>
            <p className="muted">La partie commencera automatiquement ici.</p>
          </section>
        )}

        {state.status === 'playing' && question && (
          <section className="player-game" aria-label="Partie en cours">
            <div className="round-meta">
              <p className="round-counter">
                Question {state.progress.index} / {state.progress.total}
              </p>
              <p className="score" aria-label={`Score : ${state.score} points`}>
                <strong>{state.score}</strong> pts
              </p>
            </div>
            <div className="question-heading">
              <h1 className="question-text">{question.question}</h1>
              {canSpeak && (
                <button
                  className="icon-button"
                  type="button"
                  onClick={toggleListen}
                  aria-label={speaking ? 'Arrêter la lecture' : 'Écouter la question'}
                  title={speaking ? 'Arrêter la lecture' : 'Écouter la question'}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    aria-hidden="true"
                  >
                    {speaking ? (
                      <rect x="6" y="6" width="12" height="12" rx="2" />
                    ) : (
                      <>
                        <path d="m11 5-6 4H2v6h3l6 4V5Z" strokeLinejoin="round" />
                        <path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" strokeLinecap="round" />
                      </>
                    )}
                  </svg>
                </button>
              )}
            </div>
            {question.attempts > 0 && question.status === 'open' && !feedback && (
              <p className="notice" role="status">
                Essayez un autre pays. Cette seconde chance vaut la moitié des points.
              </p>
            )}
            {question.hints.length > 0 && (
              <ul className="hint-list" aria-label="Indices reçus">
                {question.hints.map((hint, index) => (
                  <li key={index}>
                    <strong>Indice {index + 1}</strong> {hint}
                  </li>
                ))}
              </ul>
            )}
            <div className="game-map">
              <div className="map-options map-toggle" role="group" aria-label="Type de carte">
                <button type="button" aria-pressed={mapMode === 'globe'} onClick={() => setMapMode('globe')}>
                  Globe
                </button>
                <button type="button" aria-pressed={mapMode === 'flat'} onClick={() => setMapMode('flat')}>
                  Carte
                </button>
              </div>
              <WorldMap
                mode={mapMode}
                className="play-map"
                pin={pin ?? feedback?.playerPin ?? null}
                selectedIso={!feedback ? (selected?.id ?? null) : null}
                target={feedback?.coords ?? null}
                targetIso={feedback?.isoN ?? null}
                onPick={!busy && connected && question.status === 'open' && !feedback ? pick : undefined}
                labels
              />
            </div>
            {!feedback && (
              <div className="selection-row">
                <p className={selected ? 'selected-country' : 'selection-placeholder'} aria-live="polite">
                  {selected?.name ?? 'Choisissez un pays sur la carte'}
                </p>
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={() => void submit()}
                  disabled={busy || !connected || !selected || question.status !== 'open'}
                >
                  {busy || question.status === 'answered' ? 'Vérification…' : 'Valider'}
                </button>
              </div>
            )}
            {error && !feedback && (
              <p className="error-message" role="alert">
                {error}
              </p>
            )}
            {feedback && (
              <section
                className={`feedback ${feedback.outcome === 'correct' ? 'ok' : feedback.outcome === 'skipped' ? 'mid' : 'ko'}`}
                aria-label="Résultat"
                aria-live="polite"
              >
                <div className="feedback-heading">
                  <h2>{PRECISION_TEXT[feedback.precision] ?? 'Réponse vérifiée'}</h2>
                  <strong>
                    {feedback.points > 0 ? '+' : ''}
                    {feedback.points} pts
                  </strong>
                </div>
                <p className="feedback-answer">
                  Réponse : <strong>{feedback.answer}</strong>
                  {feedback.answer !== feedback.country && ` — ${feedback.country}`}
                </p>
                <QuestionDetails explanation={feedback.explanation} source={feedback.source} />
              </section>
            )}
          </section>
        )}

        {state.status === 'playing' && !question && (
          <p className="waiting-state" role="status">
            Préparation de la question…
          </p>
        )}

        {state.status === 'finished' && state.finished && (
          <section className="panel result-card">
            <p className="overline">Partie terminée</p>
            <h1>{state.finished.badge.label}</h1>
            <p className="result-score">
              {state.finished.score}
              <span>points</span>
            </p>
            <p className="muted">
              {state.finished.correct} / {state.finished.total} bonnes réponses
            </p>
            <details className="disclosure result-details">
              <summary>Votre parcours</summary>
              <div className="disclosure-content">
                <p>
                  Niveau {state.level} · {state.finished.found.length} pays trouvés
                </p>
                {state.finished.found.length > 0 && (
                  <p className="muted">{state.finished.found.join(', ')}</p>
                )}
              </div>
            </details>
            <button className="btn btn-primary btn-block" type="button" onClick={leave}>
              Rejoindre une autre partie
            </button>
          </section>
        )}
      </main>
    </div>
  )
}

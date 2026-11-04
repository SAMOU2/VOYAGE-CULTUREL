'use client'

import { useEffect, useRef, useState } from 'react'
import SiteHeader from '@/components/SiteHeader'
import WorldMap, { type LonLat, type PickedCountry } from '@/components/WorldMap'
import QuestionDetails from '@/components/QuestionDetails'
import RoundProgress from '@/components/RoundProgress'
import { emitAck } from '@/lib/socket'
import { usePlayerConnection } from '@/lib/usePlayerConnection'

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

function Nickname({
  pseudo,
  onChange,
  onSubmit,
  disabled,
}: {
  pseudo: string
  onChange: (value: string) => void
  onSubmit: (event: React.FormEvent) => void
  disabled: boolean
}) {
  return (
    <details className="disclosure nickname-options">
      <summary>Pseudo (facultatif)</summary>
      <form className="disclosure-content nickname-form" onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="pseudo">Pseudo</label>
          <input
            id="pseudo"
            value={pseudo}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Joueur"
            autoComplete="nickname"
            maxLength={18}
          />
        </div>
        <button className="btn btn-sm" type="submit" disabled={disabled}>
          Enregistrer
        </button>
      </form>
    </details>
  )
}

export default function PlayerPage() {
  const {
    state,
    connected,
    available,
    joining,
    renaming,
    pseudo,
    error,
    setError,
    updatePseudo,
    savePseudo,
    joinRoom,
    retry,
    leave,
  } = usePlayerConnection()
  const [busy, setBusy] = useState(false)
  const [pin, setPin] = useState<LonLat | null>(null)
  const [selected, setSelected] = useState<PickedCountry | null>(null)
  const [mapMode, setMapMode] = useState<'globe' | 'flat'>('globe')
  const [speaking, setSpeaking] = useState(false)
  const [canSpeak, setCanSpeak] = useState(false)
  const attemptRef = useRef<{ id?: string; attempts?: number }>({})

  useEffect(() => {
    setCanSpeak('speechSynthesis' in window)
    return () => window.speechSynthesis?.cancel()
  }, [])

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

  const toggleListen = () => {
    if (speaking) {
      window.speechSynthesis?.cancel()
      setSpeaking(false)
    } else if (state?.question?.question) {
      setSpeaking(speak(state.question.question, () => setSpeaking(false)))
    }
  }

  if (!state) {
    return (
      <div className="app">
        <SiteHeader />
        <main id="main-content" className="main page-width">
          <section className="form-page">
            <h1>Rejoindre une partie</h1>
            <p className="page-intro">Connexion automatique, sans compte ni code.</p>
            <div className="panel discovery-panel" aria-busy={joining}>
              <p className="discovery-status" role="status">
                <span className="waiting-dot" aria-hidden="true" />
                {!connected
                  ? 'Connexion au serveur…'
                  : joining
                    ? 'Connexion à la partie…'
                    : available.length > 1
                      ? 'Choisissez une partie'
                      : 'En attente d’une partie…'}
              </p>
              {available.length > 1 ? (
                <ul className="available-rooms" aria-label="Parties disponibles">
                  {available.map((room) => (
                    <li className="available-room" key={room.id}>
                      <div>
                        <h2>{room.name}</h2>
                        <p>
                          {room.themeLabel} · {room.difficultyLabel} · {room.count} questions max.
                        </p>
                      </div>
                      <button
                        className="btn btn-sm"
                        type="button"
                        disabled={joining || !connected}
                        aria-label={`Rejoindre ${room.name}`}
                        onClick={() => void joinRoom(room.id)}
                      >
                        Rejoindre
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">
                  Ouvrez ce site sur le même Wi-Fi que le présentateur. La partie sera détectée et rejointe
                  automatiquement dès qu’une place sera disponible.
                </p>
              )}
              {error && (
                <p className="error-message" role="alert">
                  {error}
                </p>
              )}
              <button className="text-link" type="button" onClick={retry} disabled={!connected || joining}>
                Actualiser la recherche
              </button>
              <Nickname
                pseudo={pseudo}
                onChange={updatePseudo}
                onSubmit={savePseudo}
                disabled={!connected || renaming}
              />
            </div>
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
        <span className="session-room">{state.roomName}</span>
        <button
          className="btn btn-ghost btn-sm"
          type="button"
          onClick={() => {
            window.speechSynthesis?.cancel()
            leave()
          }}
        >
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
            <p className="muted">Vous êtes connecté à {state.roomName}. La partie commencera ici.</p>
            <Nickname
              pseudo={pseudo}
              onChange={updatePseudo}
              onSubmit={savePseudo}
              disabled={!connected || renaming}
            />
            {error && (
              <p className="error-message" role="alert">
                {error}
              </p>
            )}
          </section>
        )}

        {state.status === 'playing' && question && (
          <section className="player-game" aria-label="Partie en cours">
            <div className="round-meta">
              <RoundProgress
                index={state.progress.index}
                total={state.progress.total}
                difficulty={question.difficulty}
              />
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
            <button
              className="btn btn-primary btn-block"
              type="button"
              onClick={() => {
                window.speechSynthesis?.cancel()
                leave()
              }}
            >
              Rejoindre une autre partie
            </button>
          </section>
        )}
      </main>
    </div>
  )
}

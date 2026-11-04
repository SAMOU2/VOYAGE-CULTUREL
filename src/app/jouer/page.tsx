'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import SiteHeader from '@/components/SiteHeader'
import WorldMap, { type LonLat, type PickedCountry } from '@/components/WorldMap'
import { emitAck, getSocket, playerSession } from '@/lib/socket'
import type { PlayerState } from '@/lib/types'

const DIFFICULTY_LABEL: Record<number, string> = { 1: 'Facile', 2: 'Moyen', 3: 'Expert' }
const DIFFICULTY_CLASS: Record<number, string> = { 1: 'pill-green', 2: 'pill-gold', 3: 'pill-rose' }

const PRECISION_TEXT: Record<string, string> = {
  exact: '🎯 Emplacement exact',
  country: '✅ Bon pays',
  near: '🟡 Tout près',
  miss: '❌ Raté',
  skip: '⏭️ Question passée',
  refus: '❌ Refusée par le présentateur',
  manual: '✅ Validée par le présentateur',
  force: '✅ Accordée par le présentateur',
  annule: '❌ Annulée par le présentateur',
}

function speak(text: string, onEnd?: () => void) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false
  window.speechSynthesis.cancel()
  const utter = new SpeechSynthesisUtterance(text)
  utter.lang = 'fr-FR'
  utter.rate = 0.98
  const voices = window.speechSynthesis.getVoices()
  const french = voices.find((v) => v.lang?.toLowerCase().startsWith('fr'))
  if (french) utter.voice = french
  if (onEnd) {
    utter.onend = onEnd
    utter.onerror = onEnd
  }
  window.speechSynthesis.speak(utter)
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

  const autoRejoinedRef = useRef(false)
  const attemptRef = useRef<{ id?: string; attempts?: number }>({})

  /* ------------------------------ connexion ------------------------------ */

  const rejoin = useCallback(async () => {
    const session = playerSession.read()
    const urlCode = new URLSearchParams(window.location.search).get('code')?.toUpperCase() ?? ''
    const target = urlCode || session?.code
    if (!target) return
    setCode((c) => c || target)

    if (session && session.code === target) {
      const res: any = await emitAck('player:rejoin', { code: target, playerId: session.playerId })
      if (res?.ok) {
        setJoined(true)
        setPseudo(session.pseudo)
      } else if (!urlCode) {
        playerSession.clear()
      }
    }
  }, [])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlCode = new URLSearchParams(window.location.search).get('code')
      if (urlCode) setCode(urlCode.toUpperCase())
      const saved = playerSession.read()
      if (saved?.pseudo) setPseudo((p) => p || saved.pseudo)
    }

    const socket = getSocket()
    const onConnect = () => {
      setConnected(true)
      if (!autoRejoinedRef.current) {
        autoRejoinedRef.current = true
        void rejoin()
      }
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
    }
  }, [rejoin])

  // Nouvelle question (ou seconde chance) : on efface le choix précédent.
  useEffect(() => {
    const q = state?.question
    const key = { id: q?.id, attempts: q?.attempts }
    const prev = attemptRef.current
    if (prev.id !== key.id || prev.attempts !== key.attempts) {
      setPin(null)
      setSelected(null)
      attemptRef.current = key
    }
  }, [state?.question?.id, state?.question?.attempts])

  const join = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const clean = code.trim().toUpperCase()
    if (clean.length < 4) {
      setError('Le code de salle comporte 5 caractères.')
      return
    }
    if (!pseudo.trim()) {
      setError('Choisissez un pseudo pour que le présentateur vous reconnaisse.')
      return
    }
    setBusy(true)
    const res: any = await emitAck('player:join', { code: clean, pseudo: pseudo.trim() })
    setBusy(false)
    if (!res?.ok) {
      setError(res?.error ?? 'Connexion impossible.')
      return
    }
    playerSession.save({ code: clean, playerId: res.playerId, pseudo: res.pseudo ?? pseudo.trim() })
    setJoined(true)
    setError(null)
  }

  const pick = (coords: LonLat, country: PickedCountry | null) => {
    setPin(coords)
    setSelected(country)
    setError(country ? null : 'Cet endroit est en pleine mer : cliquez sur un pays.')
  }

  const submit = async () => {
    if (busy || !state?.question || state.question.status !== 'open') return
    if (!pin) {
      setError('Cliquez d’abord sur le pays qui répond à la question.')
      return
    }
    setError(null)
    setBusy(true)
    const res: any = await emitAck('player:submit', { code: state.roomCode, pin })
    setBusy(false)
    if (!res?.ok) setError(res?.error ?? 'Envoi impossible.')
  }

  const leave = () => {
    getSocket().emit('player:leave')
    playerSession.clear()
    setState(null)
    setJoined(false)
    setPin(null)
    setSelected(null)
  }

  const toggleListen = () => {
    const content = state?.question?.question ?? state?.feedback?.question
    if (!content) return
    if (speaking) {
      window.speechSynthesis?.cancel()
      setSpeaking(false)
      return
    }
    setSpeaking(speak(content, () => setSpeaking(false)))
  }

  /* -------------------------------- rendu -------------------------------- */

  const question = state?.question ?? null
  const feedback = state?.feedback ?? null
  const inGame = joined && state && (state.status === 'playing' || state.status === 'finished')

  if (!joined || !state) {
    return (
      <div className="app">
        <SiteHeader />
        <main className="main">
          <div className="container" style={{ maxWidth: 560 }}>
            <span className="eyebrow">Écran du joueur</span>
            <h1 className="display-sm" style={{ marginTop: 12 }}>
              Rejoindre une partie
            </h1>
            <p className="muted small">
              Le présentateur affiche un code à 5 caractères (ou un QR code). Entrez-le ci-dessous — les deux appareils
              doivent être sur le même Wi-Fi.
            </p>

            <form className="card stack" onSubmit={join} style={{ marginTop: 18 }}>
              <div className="field">
                <label className="label" htmlFor="room-code">
                  Code de la salle
                </label>
                <input
                  id="room-code"
                  className="input code-input"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5))}
                  placeholder="ABCDE"
                  autoComplete="off"
                  autoCapitalize="characters"
                  inputMode="text"
                  maxLength={5}
                  required
                />
              </div>

              <div className="field">
                <label className="label" htmlFor="pseudo">
                  Votre pseudo
                </label>
                <input
                  id="pseudo"
                  className="input"
                  value={pseudo}
                  onChange={(e) => setPseudo(e.target.value.slice(0, 18))}
                  placeholder="Ex. Amina"
                  maxLength={18}
                  required
                />
              </div>

              {error && (
                <p className="small rose" style={{ margin: 0 }}>
                  {error}
                </p>
              )}

              <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={busy}>
                {busy ? 'Connexion…' : 'Entrer dans la salle'}
              </button>

              <p className="tiny muted" style={{ margin: 0 }}>
                {connected ? (
                  <span className="teal">● Serveur joignable</span>
                ) : (
                  <span className="rose">● Connexion au serveur en cours…</span>
                )}{' '}
                — l&apos;adresse du serveur est celle de l&apos;ordinateur du présentateur, jamais « localhost » depuis
                un téléphone.
              </p>
            </form>

            <p className="small muted" style={{ marginTop: 18 }}>
              Vous êtes présentateur ?{' '}
              <Link href="/presentateur" className="teal">
                Ouvrez une salle
              </Link>
              .
            </p>
          </div>
        </main>
      </div>
    )
  }

  const levelProgress = state.levelProgress

  return (
    <div className="app">
      <SiteHeader />
      <main className="main">
        <div className="container-wide">
          <div className="spread" style={{ marginBottom: 16 }}>
            <div className="row">
              <span className="pill pill-teal">
                <span className="dot" /> Salle {state.roomCode}
              </span>
              <span className="pill">{state.pseudo ?? 'Joueur'}</span>
              {!connected && <span className="pill pill-rose">Reconnexion…</span>}
            </div>
            <button className="btn btn-sm btn-ghost" onClick={leave} type="button">
              Quitter
            </button>
          </div>

          {state.status === 'lobby' && (
            <div className="card" style={{ textAlign: 'center', padding: 42 }}>
              <div style={{ fontSize: 40 }} aria-hidden>
                🛰️
              </div>
              <h2 className="display-sm" style={{ marginTop: 8 }}>
                Vous êtes dans la salle {state.roomCode}
              </h2>
              <p className="muted">
                Le présentateur va lancer la partie. Gardez cet écran ouvert — la première question arrive
                automatiquement.
              </p>
              <div className="row" style={{ justifyContent: 'center' }}>
                <span className="pill pill-teal">
                  <span className="dot" /> Connecté en tant que {state.pseudo}
                </span>
                <span className="pill">{state.total} questions prévues</span>
              </div>
            </div>
          )}

          {inGame && state.status !== 'finished' && (
            <div className="game-shell">
              <div className="stack">
                <div className="question-card">
                  <div className="question-meta">
                    {question && (
                      <>
                        <span className="pill">{question.themeLabel}</span>
                        <span className={`pill ${DIFFICULTY_CLASS[question.difficulty]}`}>
                          {DIFFICULTY_LABEL[question.difficulty]}
                        </span>
                        <span className="pill">
                          Question {state.progress.index}/{state.progress.total}
                        </span>
                        {question.attempts > 0 && <span className="pill pill-gold">Seconde chance</span>}
                      </>
                    )}
                  </div>

                  <p className="question-text" style={{ margin: 0 }}>
                    {question?.question ?? 'Préparation de la question…'}
                  </p>

                  {question && question.attempts > 0 && question.status === 'open' && !feedback && (
                    <p className="small" style={{ margin: '14px 0 0', color: '#ffe0a5' }}>
                      Ce n&apos;est pas le bon pays. Cliquez ailleurs : les points de cette question sont réduits.
                    </p>
                  )}

                  <div className="row" style={{ marginTop: 16 }}>
                    <button className="btn btn-sm" type="button" onClick={toggleListen}>
                      {speaking ? '⏹ Arrêter la lecture' : '🔊 Écouter la question'}
                    </button>
                    {question && (
                      <span className="pill">
                        Cliquez sur le pays où se trouve la réponse
                      </span>
                    )}
                  </div>

                  {question && question.hints.length > 0 && (
                    <ul className="hint-list">
                      {question.hints.map((hint, index) => (
                        <li className="hint-item" key={index}>
                          <span aria-hidden>💡</span>
                          <span>{hint}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <div className="spread" style={{ marginBottom: 8 }}>
                    <span className="label">Choisissez sur la carte</span>
                    <div className="map-toggle" role="group" aria-label="Type de carte">
                      <button type="button" data-active={mapMode === 'globe'} onClick={() => setMapMode('globe')}>
                        Globe
                      </button>
                      <button type="button" data-active={mapMode === 'flat'} onClick={() => setMapMode('flat')}>
                        Carte
                      </button>
                    </div>
                  </div>
                  <WorldMap
                    mode={mapMode}
                    className="full"
                    pin={pin ?? feedback?.playerPin ?? null}
                    selectedIso={!feedback ? selected?.id ?? null : null}
                    target={feedback?.coords ?? null}
                    targetIso={feedback?.isoN ?? null}
                    onPick={!busy && question?.status === 'open' && !feedback ? pick : undefined}
                    labels
                  />
                  <div className="row small muted" style={{ marginTop: 8, justifyContent: 'space-between' }}>
                    <span>
                      {selected
                        ? `Votre choix : ${selected.name}`
                        : pin
                        ? 'Pleine mer — cliquez sur un pays.'
                        : 'Faites glisser pour tourner, molette pour zoomer, puis cliquez sur un pays.'}
                    </span>
                    {pin && !feedback && question?.status === 'open' && (
                      <button
                        className="btn btn-sm btn-ghost"
                        type="button"
                        onClick={() => {
                          setPin(null)
                          setSelected(null)
                        }}
                      >
                        Effacer
                      </button>
                    )}
                  </div>
                </div>

                {!feedback && question?.status !== 'answered' && (
                  <div className="card card-tight">
                    <div className="spread" style={{ gap: 14 }}>
                      <div>
                        <div className="stat-label">Votre réponse</div>
                        <div style={{ fontSize: 20, fontWeight: 600, marginTop: 2 }}>
                          {selected ? selected.name : <span className="muted">Aucun pays sélectionné</span>}
                        </div>
                        <p className="tiny muted" style={{ margin: '4px 0 0' }}>
                          Emplacement exact : tous les points · bon pays : 60 % · à quelques kilomètres : 40 %.
                        </p>
                      </div>
                      <button
                        type="button"
                        className="btn btn-primary btn-lg"
                        onClick={() => void submit()}
                        disabled={busy || !selected || question?.status !== 'open'}
                      >
                        {busy ? 'Vérification…' : 'Valider ma réponse'}
                      </button>
                    </div>
                    {error && (
                      <p className="small rose" style={{ margin: '10px 0 0' }}>
                        {error}
                      </p>
                    )}
                  </div>
                )}

                {!feedback && question?.status === 'answered' && (
                  <div className="card card-tight" style={{ textAlign: 'center' }}>
                    <span className="pill pill-gold">
                      <span className="dot" /> Réponse envoyée
                    </span>
                    <p className="muted small" style={{ margin: '10px 0 0' }}>
                      Vérification en cours…
                    </p>
                  </div>
                )}

                {feedback && (
                  <div
                    className={`feedback ${
                      feedback.outcome === 'correct' ? 'ok' : feedback.outcome === 'skipped' ? 'mid' : 'ko'
                    }`}
                  >
                    <div className="spread">
                      <h3 style={{ margin: 0, fontSize: 20 }}>
                        {PRECISION_TEXT[feedback.precision] ?? (feedback.outcome === 'correct' ? '✅ Correct' : '❌ Raté')}
                      </h3>
                      <span className={`pill ${feedback.outcome === 'correct' ? 'pill-green' : 'pill-gold'}`}>
                        {feedback.points > 0 ? `+${feedback.points} points` : '0 point'}
                      </span>
                    </div>

                    <p style={{ margin: '12px 0 6px' }}>
                      Réponse attendue : <strong className="gold">{feedback.answer}</strong> — {feedback.country}
                    </p>
                    {feedback.clickedCountry && (
                      <p className="small muted" style={{ margin: '0 0 6px' }}>
                        Vous avez cliqué : {feedback.clickedCountry.name}
                      </p>
                    )}
                    <p className="small" style={{ marginTop: 10, color: 'var(--ink-soft)' }}>
                      {feedback.explanation}
                    </p>

                    <div className="row" style={{ marginTop: 10 }}>
                      <span className="pill">{feedback.country}</span>
                      {feedback.source?.url ? (
                        <a
                          className="pill"
                          href={feedback.source.url}
                          target="_blank"
                          rel="noreferrer"
                          style={{ textDecoration: 'underline' }}
                        >
                          Source : {feedback.source.label}
                        </a>
                      ) : (
                        <span className="pill">{feedback.source?.label}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <aside className="side stack">
                <div className="card card-tight">
                  <div className="card-head">Votre progression</div>
                  <div className="spread" style={{ marginBottom: 10 }}>
                    <div>
                      <div className="stat-label">Score</div>
                      <div className="stat-value teal">{state.score}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="stat-label">Niveau</div>
                      <div className="stat-value gold">{state.level}</div>
                    </div>
                  </div>
                  <div className="progress">
                    <span style={{ width: `${Math.round(levelProgress.ratio * 100)}%` }} />
                  </div>
                  <p className="tiny muted" style={{ margin: '8px 0 0' }}>
                    {levelProgress.next
                      ? `${levelProgress.next - state.score} points avant le niveau ${levelProgress.level + 1}`
                      : 'Niveau maximum atteint'}
                  </p>

                  <hr className="divider" />
                  <div className="stat-grid">
                    <div className="stat">
                      <div className="stat-label">Bonnes réponses</div>
                      <div className="stat-value">{state.correct}</div>
                    </div>
                    <div className="stat">
                      <div className="stat-label">Questions</div>
                      <div className="stat-value">
                        {state.progress.index}
                        <span className="muted" style={{ fontSize: 14 }}>
                          /{state.progress.total}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="card card-tight">
                  <div className="card-head">Pays trouvés</div>
                  {state.found.length === 0 ? (
                    <p className="small muted" style={{ margin: 0 }}>
                      Vos bonnes réponses s&apos;ajouteront ici, comme les escales d&apos;un carnet de voyage.
                    </p>
                  ) : (
                    <div className="country-list">
                      {state.found.map((country) => (
                        <span className="pill pill-teal" key={country}>
                          {country}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="card card-tight">
                  <div className="card-head">Comment répondre</div>
                  <ul className="small muted" style={{ margin: 0, paddingLeft: 16, lineHeight: 1.8 }}>
                    <li>Cliquez sur le pays (ou la région) qui répond à la question.</li>
                    <li>Emplacement exact : tous les points ; bon pays : 60 % ; à côté : 40 %.</li>
                    <li>Un indice coûte 5 points, et le présentateur voit tout.</li>
                  </ul>
                </div>
              </aside>
            </div>
          )}

          {state.status === 'finished' && state.finished && (
            <div className="stack">
              <div className="card" style={{ textAlign: 'center', padding: 40 }}>
                <div style={{ fontSize: 52 }} aria-hidden>
                  {state.finished.badge.emoji}
                </div>
                <span className="eyebrow" style={{ justifyContent: 'center' }}>
                  Voyage terminé
                </span>
                <h2 className="display-sm" style={{ marginTop: 10 }}>
                  {state.finished.badge.label}
                </h2>
                <p className="muted">
                  {state.finished.correct} bonne{state.finished.correct > 1 ? 's' : ''} réponse
                  {state.finished.correct > 1 ? 's' : ''} sur {state.finished.total} — {state.finished.score} points.
                </p>

                <div className="recap" style={{ marginTop: 18, textAlign: 'left' }}>
                  <div className="stat">
                    <div className="stat-label">Score final</div>
                    <div className="stat-value teal">{state.finished.score}</div>
                  </div>
                  <div className="stat">
                    <div className="stat-label">Niveau atteint</div>
                    <div className="stat-value gold">{state.level}</div>
                  </div>
                  <div className="stat">
                    <div className="stat-label">Pays visités</div>
                    <div className="stat-value">{state.finished.found.length}</div>
                  </div>
                </div>

                <div className="country-list" style={{ justifyContent: 'center', marginTop: 18 }}>
                  {state.finished.found.map((country) => (
                    <span className="pill pill-teal" key={country}>
                      {country}
                    </span>
                  ))}
                </div>

                <div className="row" style={{ justifyContent: 'center', marginTop: 24 }}>
                  <button className="btn btn-primary" type="button" onClick={leave}>
                    Rejoindre une autre salle
                  </button>
                  <Link className="btn" href="/">
                    Retour à l&apos;accueil
                  </Link>
                </div>
              </div>
            </div>
          )}

          {state.status === 'playing' && !question && !feedback && (
            <div className="card" style={{ textAlign: 'center', padding: 40 }}>
              <p className="muted">Question en préparation…</p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

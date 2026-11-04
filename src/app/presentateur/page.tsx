'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import SiteHeader from '@/components/SiteHeader'
import WorldMap from '@/components/WorldMap'
import RoomSettings, { type RoomConfig } from '@/components/RoomSettings'
import QuestionDetails from '@/components/QuestionDetails'
import RoundProgress from '@/components/RoundProgress'
import { emitAck, getSocket, hostSession } from '@/lib/socket'
import type { HostState } from '@/lib/types'

const PRECISION_LABEL: Record<string, string> = {
  exact: 'Emplacement exact',
  country: 'Bon pays',
  near: 'Tout près',
  miss: 'Mauvais pays',
  skip: 'Question passée',
  refus: 'Réponse refusée',
  manual: 'Réponse validée',
  force: 'Points accordés',
  annule: 'Points retirés',
}

function History({ history }: { history: HostState['history'] }) {
  if (!history.length) return null
  return (
    <details className="disclosure history-details">
      <summary>
        Historique des réponses <span className="muted">{history.length}</span>
      </summary>
      <ol className="history-list disclosure-content">
        {history.map((entry, index) => (
          <li key={`${entry.questionId}-${index}`}>
            <span>
              <span className="muted">{index + 1}.</span> {entry.clickedCountry?.name ?? 'Aucun pays'}
            </span>
            <span className="history-outcome" data-outcome={entry.outcome}>
              {entry.outcome === 'correct'
                ? 'Réussie'
                : entry.outcome === 'skipped'
                  ? 'Passée'
                  : 'Incorrecte'}
            </span>
            <strong>
              {entry.points > 0 ? '+' : ''}
              {entry.points} pts
            </strong>
          </li>
        ))}
      </ol>
    </details>
  )
}

export default function HostPage() {
  const [state, setState] = useState<HostState | null>(null)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [config, setConfig] = useState<RoomConfig>({
    theme: 'tous',
    difficulty: 'mixte',
    count: 8,
    allowRetry: true,
  })

  const resume = useCallback(async () => {
    const session = hostSession.read()
    if (!session) return
    const response: any = await emitAck('host:rejoin', { code: session.code, token: session.hostToken })
    if (!response?.ok) {
      hostSession.clear()
      setState(null)
    }
  }, [])

  useEffect(() => {
    const socket = getSocket()
    const onConnect = () => {
      setConnected(true)
      void resume()
    }
    const onDisconnect = () => setConnected(false)
    const onState = (next: HostState) => {
      if (next.role !== 'host') return
      setState(next)
      setConfig({
        theme: next.config.theme,
        difficulty: String(next.config.difficulty),
        count: next.config.count,
        allowRetry: next.config.allowRetry,
      })
    }
    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    const onClosed = (payload: { roomId: string }) => {
      if (hostSession.read()?.code !== payload.roomId) return
      hostSession.clear()
      setState(null)
      setError(null)
    }
    socket.on('room:closed', onClosed)
    socket.on('state', onState)
    if (socket.connected) onConnect()
    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('state', onState)
      socket.off('room:closed', onClosed)
    }
  }, [resume])

  const createRoom = async (event: React.FormEvent) => {
    event.preventDefault()
    if (busy || !connected) return
    setBusy(true)
    setError(null)
    const response: any = await emitAck('host:create', {
      ...config,
      difficulty: config.difficulty === 'mixte' ? 'mixte' : Number(config.difficulty),
    })
    setBusy(false)
    if (!response?.ok) return setError(response?.error ?? 'Création impossible.')
    hostSession.save({ code: response.code, hostToken: response.hostToken })
  }

  const command = async (type: string, payload: Record<string, unknown> = {}) => {
    if (!state || busy || !connected) return
    setBusy(true)
    const response: any = await emitAck('host:command', { code: state.roomCode, type, payload })
    setBusy(false)
    setError(response?.ok ? null : (response?.error ?? 'Commande refusée.'))
  }

  const updateConfig = (patch: Partial<RoomConfig>) => {
    const next = { ...config, ...patch }
    setConfig(next)
    void command('config', {
      ...next,
      difficulty: next.difficulty === 'mixte' ? 'mixte' : Number(next.difficulty),
    })
  }

  const resetRoom = async () => {
    if (busy || !connected) return
    setBusy(true)
    const response = await emitAck('host:close', {})
    setBusy(false)
    if (!response?.ok) return setError(response?.error ?? 'Fermeture impossible.')
    hostSession.clear()
    setState(null)
    setError(null)
  }

  if (!state) {
    return (
      <div className="app">
        <SiteHeader />
        <main id="main-content" className="main page-width">
          <section className="form-page">
            <h1>Créer une salle</h1>
            <p className="page-intro">Choisissez les réglages de la partie.</p>
            <form className="panel form-fields" onSubmit={createRoom}>
              <RoomSettings
                config={config}
                onChange={(patch) => setConfig({ ...config, ...patch })}
                disabled={busy}
              />
              {error && (
                <p className="error-message" role="alert">
                  {error}
                </p>
              )}
              <button className="btn btn-primary btn-block" type="submit" disabled={busy || !connected}>
                {busy ? 'Création…' : 'Créer la salle'}
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

  const player = state.player
  const current = state.current
  const resolved = current?.resolved ?? null
  const disabled = busy || !connected

  return (
    <div className="app">
      <SiteHeader>
        <span className="session-room">{state.roomName}</span>
        {state.status === 'lobby' && (
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            disabled={disabled}
            onClick={() => void resetRoom()}
          >
            Fermer
          </button>
        )}
      </SiteHeader>
      <main id="main-content" className="main page-width">
        {!connected && (
          <p className="connection-message" role="status">
            Connexion interrompue. Reconnexion en cours…
          </p>
        )}
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}

        {state.status === 'lobby' && (
          <section className="lobby-page">
            <div className="panel invite-card">
              <h1>Salle prête</h1>
              <p className="page-intro">
                Le joueur ouvre ce site et choisit « Joueur ». Il sera connecté automatiquement, sans compte
                ni code.
              </p>
              <Link className="text-link open-player" href="/jouer" target="_blank" rel="noreferrer">
                Ouvrir le joueur
              </Link>
              <p className="network-note">
                Les deux appareils doivent ouvrir le même serveur sur le même Wi-Fi.
              </p>
              <div className="lobby-start">
                <p className="player-status" role="status">
                  <span className={`status-dot ${player?.connected ? 'online' : ''}`} aria-hidden="true" />
                  {player
                    ? `${player.pseudo} ${player.connected ? 'est connecté' : 'est déconnecté'}`
                    : 'En attente d’un joueur'}
                </p>
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={disabled || !player?.connected}
                  onClick={() => void command('start')}
                >
                  Démarrer
                </button>
              </div>
            </div>
            <details className="disclosure lobby-settings">
              <summary>Modifier les réglages</summary>
              <div className="disclosure-content">
                <RoomSettings config={config} onChange={updateConfig} disabled={disabled} />
              </div>
            </details>
          </section>
        )}

        {state.status === 'playing' && current && (
          <section className="host-game" aria-label="Pilotage de la partie">
            <div className="round-meta">
              <RoundProgress
                index={state.progress.index}
                total={state.progress.total}
                difficulty={current.difficulty}
              />
              <p className="score">
                <span className="player-name">{player?.pseudo ?? 'Joueur'}</span>{' '}
                <strong>{player?.score ?? 0}</strong> pts
              </p>
            </div>
            {player && !player.connected && (
              <p className="notice" role="status">
                Le joueur est déconnecté.
              </p>
            )}
            <div className="host-layout">
              <div className="panel host-question">
                <h1 className="question-text">{current.question}</h1>
                {current.attempts > 0 && current.status === 'open' && (
                  <p className="notice">Seconde chance en cours.</p>
                )}
                {current.hintLevel > 0 && (
                  <ul className="hint-list" aria-label="Indices donnés">
                    {current.hints.slice(0, current.hintLevel).map((hint, index) => (
                      <li key={index}>
                        <strong>Indice {index + 1}</strong> {hint}
                      </li>
                    ))}
                  </ul>
                )}
                <section className="submission" aria-label="Réponse du joueur">
                  <p className="field-label">Choix du joueur</p>
                  <p className={player?.clickedCountry ? 'submitted-country' : 'muted'}>
                    {player?.clickedCountry?.name ?? 'En attente de sa réponse…'}
                  </p>
                  {resolved && (
                    <p className="verdict" data-outcome={resolved.outcome} role="status">
                      {PRECISION_LABEL[resolved.precision] ?? 'Réponse vérifiée'} ·{' '}
                      {resolved.points > 0 ? '+' : ''}
                      {resolved.points} pts
                    </p>
                  )}
                  {current.distanceKm != null && (
                    <p className="distance">
                      À {current.distanceKm.toLocaleString('fr-FR')} km du lieu attendu
                    </p>
                  )}
                </section>
                <div className="command-bar">
                  {current.status === 'feedback' ? (
                    <button
                      className="btn btn-primary"
                      type="button"
                      disabled={disabled}
                      onClick={() => void command('next')}
                    >
                      {state.progress.index >= state.progress.total ? 'Voir le bilan' : 'Question suivante'}
                    </button>
                  ) : (
                    <>
                      <button
                        className="btn"
                        type="button"
                        disabled={disabled || current.hintLevel >= current.hints.length}
                        onClick={() => void command('hint')}
                      >
                        Donner un indice
                      </button>
                      <button
                        className="btn"
                        type="button"
                        disabled={disabled}
                        onClick={() => void command('skip')}
                      >
                        Passer
                      </button>
                    </>
                  )}
                </div>
                <details className="disclosure more-actions" key={current.id}>
                  <summary>Autres actions</summary>
                  <div className="disclosure-content secondary-actions">
                    {(resolved || player?.hasAnswered) && (
                      <button
                        className="btn btn-sm"
                        type="button"
                        disabled={disabled}
                        onClick={() =>
                          void command(resolved?.outcome === 'correct' ? 'incorrect' : 'correct')
                        }
                      >
                        {resolved?.outcome === 'correct' ? 'Retirer les points' : 'Accorder les points'}
                      </button>
                    )}
                    <button
                      className="btn btn-danger btn-sm"
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        if (window.confirm('Terminer la partie maintenant ?')) void command('end')
                      }}
                    >
                      Terminer la partie
                    </button>
                  </div>
                </details>
              </div>
              <aside className="panel private-answer" aria-label="Réponse privée du présentateur">
                <p className="private-label">Réponse · présentateur uniquement</p>
                <h2>{current.answer}</h2>
                {current.answer !== current.country && <p className="answer-country">{current.country}</p>}
                <WorldMap
                  mode="flat"
                  className="host-map"
                  pin={player?.pin ?? null}
                  selectedIso={player?.clickedCountry?.id ?? null}
                  target={current.coords}
                  targetIso={current.isoN}
                  labels
                  compact
                />
                <p className="map-legend">Or : réponse · Rose : choix du joueur</p>
                <QuestionDetails explanation={current.explanation} source={current.source} />
              </aside>
            </div>
            <History history={state.history} />
          </section>
        )}

        {state.status === 'finished' && (
          <section className="result-page">
            <div className="panel result-card">
              <p className="overline">Partie terminée</p>
              <h1>{state.badge.label}</h1>
              <p className="result-score">
                {player?.score ?? 0}
                <span>points</span>
              </p>
              <p className="muted">
                {player?.pseudo ?? 'Le joueur'} · {player?.correct ?? 0} / {state.history.length} bonnes
                réponses
              </p>
              <div className="result-actions">
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={disabled}
                  onClick={() => void command('restart')}
                >
                  Rejouer
                </button>
                <button className="btn" type="button" disabled={disabled} onClick={() => void resetRoom()}>
                  Nouvelle salle
                </button>
              </div>
            </div>
            <History history={state.history} />
          </section>
        )}
      </main>
    </div>
  )
}

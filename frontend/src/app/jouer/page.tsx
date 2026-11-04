'use client'

import dynamic from 'next/dynamic'
import { useEffect, useMemo, useState } from 'react'
import { useStand } from '@/lib/useStand'
import SiteHeader from '@/components/SiteHeader'
import { Icon } from '@/components/Icon'
import { QuestionCard } from '@/components/QuestionCard'
import { Leaderboard } from '@/components/Leaderboard'
import type { Selection } from '@/components/Globe'

const Globe = dynamic(() => import('@/components/Globe'), {
  ssr: false,
  loading: () => <div className="globe-stage globe-loading">Préparation du globe…</div>,
})

export default function PlayerPage() {
  const stand = useStand('player'),
    state = stand.state
  const [selection, setSelection] = useState<Selection | null>(null)
  const [mapMessage, setMapMessage] = useState('')
  useEffect(() => {
    setSelection(null)
    setMapMessage('')
  }, [state?.question.turn])
  const feedback = state?.feedback
  const target = useMemo(
    () => (feedback ? { countryId: feedback.country.id, pin: feedback.location } : null),
    [feedback],
  )
  return (
    <div className="app-shell player-shell">
      <SiteHeader role="player" connected={stand.connected} />
      <main className="player-layout">
        <section className="globe-panel" aria-label="Explorer la Terre">
          <div className="explore-heading">
            <p className="eyebrow">
              <span />
              LE MONDE EST VOTRE TERRAIN DE JEU
            </p>
            <h2>
              Un monde.
              <br />
              <span>Mille cultures.</span>
            </h2>
            <p>Faites tourner la Terre. Laissez parler votre curiosité.</p>
          </div>
          <Globe
            selection={selection}
            target={target}
            disabled={!stand.connected || stand.pending || state?.phase !== 'question'}
            onSelect={(value) => {
              setSelection(value)
              setMapMessage('')
              stand.setError('')
            }}
            onOcean={() => setMapMessage('Un peu plus près des terres… Choisissez un pays.')}
          />
          <div className="explore-footer">
            <span>
              <Icon name="globe" width="16" height="16" />
              Pays & cultures à explorer
            </span>
            <span>Pas de frontières à la curiosité.</span>
          </div>
        </section>
        <aside className="player-sidebar">
          {state ? (
            <QuestionCard state={state}>
              {state.phase === 'question' ? (
                <div className="answer-actions">
                  <div className={`selection-summary ${selection ? 'has-selection' : ''}`}>
                    <span className="selection-icon">
                      <Icon name="pin" />
                    </span>
                    <span>
                      <small>VOTRE DESTINATION</small>
                      <strong>
                        {selection?.country.name ?? 'Choisissez un pays sur le globe'}
                      </strong>
                    </span>
                    {selection && (
                      <button
                        className="icon-button"
                        aria-label="Effacer la sélection"
                        onClick={() => setSelection(null)}
                      >
                        <Icon name="close" width="16" height="16" />
                      </button>
                    )}
                  </div>
                  {(stand.error || stand.notice || mapMessage) && (
                    <p className={`action-message ${stand.error ? 'is-error' : ''}`} role="status">
                      {stand.error || stand.notice || mapMessage}
                    </p>
                  )}
                  <button
                    className="button button-primary validate-button"
                    disabled={!selection || !stand.connected || stand.pending}
                    onClick={() => {
                      if (selection) void stand.submit(state.question.turn, selection.pin)
                    }}
                  >
                    {stand.pending ? 'Validation…' : 'Valider mon choix'}
                    <Icon name="arrow" />
                  </button>
                  <small className="no-pressure">
                    {state.question.attempts
                      ? 'Seconde chance · points divisés par deux'
                      : 'Sélectionnez sur la Terre, puis validez.'}
                  </small>
                </div>
              ) : (
                <div className="waiting-next">
                  <Icon name="clock" width="17" height="17" />
                  L’animateur prépare la prochaine question.
                </div>
              )}
            </QuestionCard>
          ) : (
            <section className="panel connection-panel">
              <span className="loading-orbit" />
              <h1>Bienvenue au stand !</h1>
              <p>{stand.error || 'Connexion à votre voyage culturel…'}</p>
              <button className="button button-quiet" onClick={stand.reconnect}>
                Réessayer la connexion
              </button>
            </section>
          )}
          {state && <Leaderboard entries={state.leaderboard} compact />}
        </aside>
      </main>
      {!stand.connected && state && (
        <div className="offline-banner" role="alert">
          Connexion interrompue · reconnexion automatique. Votre score reste sur le stand.
        </div>
      )}
      <footer className="page-footer">
        <span>VOYAGE CULTUREL</span>
        <span>RENCONTRER · DÉCOUVRIR · PARTAGER</span>
        <span>
          International Students Day <span className="footer-star">✳</span>
        </span>
      </footer>
    </div>
  )
}

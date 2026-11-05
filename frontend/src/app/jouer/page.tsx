'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useCountryFacts, useStand } from '@/hooks/useStand'
import { useAttractFact, useKiosk } from '@/hooks/useKiosk'
import SiteHeader from '@/components/SiteHeader'
import { Icon } from '@/components/Icon'
import { QuestionCard } from '@/components/QuestionCard'
import { Leaderboard } from '@/components/Leaderboard'
import { GameProgress } from '@/components/GameProgress'
import { NameEntry } from '@/components/NameEntry'
import { WelcomeScreen } from '@/components/WelcomeScreen'
import type { Selection } from '@/components/Globe'
import { STAGE_LABELS } from '@shared/game'
import type { Coordinates } from '@shared/types'

const Globe = dynamic(() => import('@/components/Globe'), {
  ssr: false,
  loading: () => <div className="globe-stage globe-loading">Préparation du globe…</div>,
})
export default function PlayerPage() {
  const stand = useStand('player'),
    state = stand.state?.role === 'player' ? stand.state : null,
    game = state?.game,
    question = state?.question
  const active = state?.phase === 'question' || state?.phase === 'feedback'
  const kiosk = useKiosk(active),
    [paused, setPaused] = useState(false),
    [showSummary, setShowSummary] = useState(true)
  const [selection, setSelection] = useState<Selection | null>(null),
    [mapMessage, setMapMessage] = useState(''),
    [cameraFocus, setCameraFocus] = useState<Coordinates | null>(null)
  const facts = useCountryFacts(),
    attract = !active && kiosk.view === 'attract',
    fact = useAttractFact(facts.data, attract && !paused)
  useEffect(() => {
    if (active) kiosk.setView('welcome')
  }, [active, kiosk.setView])
  useEffect(() => {
    setSelection(null)
    setMapMessage('')
    setCameraFocus(null)
  }, [game?.id, question?.turn])
  useEffect(() => {
    if (state?.phase === 'finished') setShowSummary(true)
  }, [state?.phase, game?.id])
  const target = useMemo(
    () =>
      state?.feedback
        ? { countryId: state.feedback.country.id, pin: state.feedback.location }
        : null,
    [state?.feedback],
  )
  const spotlight = useMemo(
    () => (attract && fact ? { countryId: fact.country.countryId, pin: fact.country.pin } : null),
    [attract, fact],
  )
  const turn = game && question ? { attemptId: game.id, turn: question.turn } : null
  const canSelect = active && state?.phase === 'question' && stand.connected && !stand.pending
  const backToAttract = useCallback(() => kiosk.setView('attract'), [kiosk.setView])
  const closeName = useCallback(() => kiosk.setView('welcome'), [kiosk.setView])
  const choose = (value: Selection) => {
    if (game?.scopeCountryIds && !game.scopeCountryIds.includes(value.country.id)) {
      setMapMessage('Ce pays n’est pas dans la sélection des 33 pays.')
      return
    }
    setSelection(value)
    setMapMessage('')
    stand.setError('')
  }
  const wake = () => {
    setShowSummary(false)
    kiosk.wake()
  }
  const summary =
    state?.phase === 'finished' && game && showSummary && !attract && kiosk.view !== 'name'
  const modalOpen =
    !active && !attract && !summary && (kiosk.view === 'welcome' || kiosk.view === 'name')
  return (
    <div
      className={`player-shell ${attract ? 'is-attract' : ''} ${active ? 'is-playing' : ''}`}
      data-kiosk-view={active ? 'game' : summary ? 'summary' : kiosk.view}
    >
      <SiteHeader role="player" connected={stand.connected} inert={modalOpen}>
        {attract && (
          <button
            className="icon-button motion-button"
            aria-label={paused ? 'Reprendre l’animation' : 'Suspendre l’animation'}
            aria-pressed={paused}
            onClick={() => setPaused(!paused)}
          >
            <Icon name={paused ? 'play' : 'pause'} />
          </button>
        )}
      </SiteHeader>
      <main className="player-main">
        <div className="player-scene" inert={modalOpen || attract}>
          <div className={`player-world ${!active ? 'world-idle' : ''}`}>
            <Globe
              selection={active ? selection : null}
              target={active || summary ? target : null}
              spotlight={spotlight}
              autoRotate={attract && !paused}
              focus={cameraFocus}
              allowedCountryIds={active ? game?.scopeCountryIds : undefined}
              disabled={!canSelect}
              onSelect={choose}
              onOcean={() => setMapMessage('Sélectionnez une terre, pas l’océan.')}
            />
          </div>
          <aside className="player-ranking" aria-label="Classement">
            <Leaderboard
              entries={state?.leaderboard ?? []}
              currentName={active ? game?.fullName : undefined}
            />
          </aside>
        </div>
        {active && game && question && (
          <aside className="player-sidebar" aria-label="Question et score">
            <GameProgress game={game} resolved={state.phase === 'feedback'} />
            <QuestionCard state={state}>
              {state.phase === 'question' ? (
                <div className="answer-controls">
                  <div className={`selection-summary ${selection ? 'has-selection' : ''}`}>
                    <span className="selection-icon">
                      <Icon name="pin" />
                    </span>
                    <span>
                      <small>Votre destination</small>
                      <strong>
                        {selection?.country.name ?? 'Choisissez un pays sur le globe'}
                      </strong>
                    </span>
                    {selection && (
                      <button
                        className="icon-button"
                        aria-label="Annuler la sélection"
                        onClick={() => setSelection(null)}
                      >
                        <Icon name="close" />
                      </button>
                    )}
                  </div>
                  <button
                    className="button button-primary validate-button"
                    disabled={!selection || !canSelect}
                    onClick={() => {
                      if (turn && selection) void stand.submit({ ...turn, pin: selection.pin })
                    }}
                  >
                    Valider mon choix
                    <Icon name="arrow" />
                  </button>
                  <p className="answer-note">
                    {game.allowRetry
                      ? 'Une seconde chance est disponible.'
                      : 'Une réponse par question.'}
                  </p>
                </div>
              ) : (
                <button
                  className="button button-primary next-button"
                  disabled={!stand.connected || stand.pending}
                  onClick={() => {
                    if (turn) void stand.next(turn)
                  }}
                >
                  Question suivante
                  <Icon name="arrow" />
                </button>
              )}
            </QuestionCard>
            {(stand.error || stand.notice || mapMessage) && (
              <p className="game-message" role={stand.error ? 'alert' : 'status'}>
                <Icon name="info" />
                {stand.error || stand.notice || mapMessage}
              </p>
            )}
          </aside>
        )}
        {summary && (
          <section className="game-summary panel" aria-label="Résultat de la tentative">
            <span className="summary-icon">
              <Icon name="trophy" width="36" height="36" />
            </span>
            <span className="section-kicker">
              {game.status === 'completed'
                ? 'Les quatre niveaux sont terminés'
                : 'Votre passage est enregistré'}
            </span>
            <h1>
              Bien joué,
              <br />
              <span dir="auto">{game.fullName}.</span>
            </h1>
            <strong className="summary-score">
              {game.score}
              <small> points</small>
            </strong>
            <div className="summary-stats">
              <span>
                <strong>
                  {game.correct}/{game.answered}
                </strong>
                réponses justes
              </span>
              <span>
                <strong>{STAGE_LABELS[game.stage - 1]}</strong>niveau atteint
              </span>
            </div>
            <p>
              Toutes vos tentatives sont conservées. Seul votre meilleur score reste au classement.
            </p>
            <button
              className="button button-primary"
              disabled={!stand.connected || stand.pending}
              onClick={() => void stand.begin(game.fullName, true)}
            >
              Rejouer avec ce nom
              <Icon name="reset" />
            </button>
            <button
              className="button button-secondary"
              disabled={!stand.connected || stand.pending}
              onClick={async () => {
                const result = await stand.leave(game.id)
                if (result.ok) {
                  setShowSummary(false)
                  kiosk.setView('name')
                }
              }}
            >
              Nouveau joueur
              <Icon name="arrow" />
            </button>
          </section>
        )}
        {attract && (
          <>
            {fact && (
              <aside className="attract-fact" aria-label="Découvrir un pays">
                <span className="fact-region">
                  <Icon name="pin" width="18" height="18" />
                  {fact.country.region}
                </span>
                <h1>{fact.country.countryName}</h1>
                <span className="fact-title">{fact.fact.title}</span>
                <p>{fact.fact.text}</p>
                <span className="fact-source">{fact.fact.source.label}</span>
                <div className="fact-timing" aria-hidden="true" key={fact.fact.id}>
                  <span style={{ animationPlayState: paused ? 'paused' : 'running' }} />
                </div>
              </aside>
            )}
            <button
              className="attract-wake-surface"
              aria-label="Toucher l’écran pour jouer"
              onPointerDown={(event) => {
                event.preventDefault()
                wake()
              }}
              onClick={wake}
            />
            <div className="touch-invitation" aria-hidden="true">
              <span className="touch-ring">
                <Icon name="play" />
              </span>
              <span>
                Touchez l’écran pour jouer<small>Un pays à trouver. Le monde à explorer.</small>
              </span>
            </div>
          </>
        )}
        {!active && !attract && !summary && kiosk.view === 'welcome' && (
          <WelcomeScreen
            connected={stand.connected}
            error={stand.error}
            onPlay={() => {
              setShowSummary(false)
              kiosk.setView('name')
            }}
            onBack={backToAttract}
          />
        )}
        {!active && !attract && kiosk.view === 'name' && (
          <NameEntry
            begin={stand.begin}
            pending={stand.pending}
            error={stand.error}
            onBack={closeName}
          />
        )}
        {active && (
          <div className="map-accessibility">
            <details>
              <summary>
                <Icon name="keyboard" width="18" height="18" />
                Choix au clavier
              </summary>
              <label htmlFor="accessible-country">Sélectionner un pays sur la carte</label>
              <select
                id="accessible-country"
                value={selection?.country.id ?? ''}
                disabled={!canSelect}
                onChange={(event) => {
                  const country = facts.data?.find((c) => c.countryId === event.target.value)
                  if (country) {
                    choose({
                      country: { id: country.countryId, name: country.countryName },
                      pin: country.pin,
                    })
                    setCameraFocus(country.pin)
                  }
                }}
              >
                <option value="">Choisir un pays…</option>
                {facts.data
                  ?.filter(
                    (c) => !game?.scopeCountryIds || game.scopeCountryIds.includes(c.countryId),
                  )
                  .sort((a, b) => a.countryName.localeCompare(b.countryName, 'fr'))
                  .map((c) => (
                    <option key={c.countryId} value={c.countryId}>
                      {c.countryName}
                    </option>
                  ))}
              </select>
            </details>
          </div>
        )}
      </main>
      <footer className="player-footer" inert={modalOpen}>
        <span>
          <Icon name="globe" width="15" height="15" />
          {active
            ? 'Glissez pour tourner · Touchez pour choisir'
            : 'Un globe à explorer, à votre rythme.'}
        </span>
        <span>
          Image terrestre ·{' '}
          <a href="/credits.txt" target="_blank" rel="noreferrer">
            Solar System Scope · CC BY 4.0
          </a>{' '}
          <span className="footer-divider" aria-hidden="true">
            /
          </span>{' '}
          Frontières · Natural Earth
        </span>
      </footer>
    </div>
  )
}

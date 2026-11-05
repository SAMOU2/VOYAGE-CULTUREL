'use client'

import { useEffect, useState } from 'react'
import { useCatalog, useStand } from '@/hooks/useStand'
import SiteHeader from '@/components/SiteHeader'
import { QuestionCard } from '@/components/QuestionCard'
import { AdminLeaderboard } from '@/components/AdminLeaderboard'
import { SettingsPanel } from '@/components/SettingsPanel'
import { Icon } from '@/components/Icon'
import { modeLabel, STAGE_LABELS } from '@shared/game'

export default function PresenterPage() {
  const stand = useStand('presenter'),
    state = stand.state?.role === 'presenter' ? stand.state : null,
    catalog = useCatalog()
  const [confirmEnd, setConfirmEnd] = useState(false),
    [message, setMessage] = useState('')
  const game = state?.game,
    question = state?.question
  const turn = game && question ? { attemptId: game.id, turn: question.turn } : null
  const playing = state?.phase === 'question' || state?.phase === 'feedback',
    canControl = stand.connected && stand.controlled && !stand.pending
  useEffect(() => {
    setConfirmEnd(false)
    setMessage('')
  }, [game?.id, question?.turn])
  return (
    <div className="admin-shell">
      <SiteHeader role="presenter" connected={stand.connected} />
      <main className="admin-main">
        <div className="admin-title">
          <div>
            <span className="section-kicker">Pilotage en temps réel</span>
            <h1>Parties et classement</h1>
          </div>
          <span className="admin-live">
            <i />
            {playing ? 'Une partie est en cours' : 'Prêt pour le prochain joueur'}
          </span>
        </div>
        {stand.error && (
          <div className="admin-alert" role="alert">
            <Icon name="info" />
            <p>{stand.error}</p>
            {!stand.connected && (
              <button className="button button-secondary" onClick={stand.reconnect}>
                Reconnecter
              </button>
            )}
          </div>
        )}
        {!state ? (
          <section className="panel admin-loading">
            <span className="loading-orbit" />
            <h2>{stand.error ? 'Le pupitre attend sa connexion' : 'Connexion au stand…'}</h2>
            <p>Le premier onglet présentateur prend la main, sans compte ni code à saisir.</p>
          </section>
        ) : (
          <div className="admin-grid">
            <div className="admin-left">
              <section className="current-game" aria-label="Partie en cours">
                <div className="section-heading">
                  <Icon name="globe" />
                  <h2>{game ? 'Le joueur actuel' : 'Aucune partie en cours'}</h2>
                  {game && <span>{modeLabel(game.mode)}</span>}
                </div>
                {!game ? (
                  <div className="stand-ready panel">
                    <span>
                      <Icon name="play" width="28" height="28" />
                    </span>
                    <div>
                      <h3>L’écran visiteur est prêt.</h3>
                      <p>
                        Le visiteur touche l’écran, choisit « Jouer » et écrit son nom complet sur
                        le clavier tactile. La question apparaît ici dès le début de sa partie.
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="admin-game-stats panel">
                      <div className="admin-player-name">
                        <Icon name="user" />
                        <div>
                          <small>Nom et prénom</small>
                          <strong dir="auto">{game.fullName}</strong>
                        </div>
                      </div>
                      <div>
                        <strong>
                          {game.score}
                          <small> pts</small>
                        </strong>
                        <span>score actuel</span>
                      </div>
                      <div>
                        <strong>
                          {game.answered}
                          <small> / {game.totalQuestions}</small>
                        </strong>
                        <span>questions résolues</span>
                      </div>
                      <div>
                        <strong>
                          {game.stage}
                          <small> / 4</small>
                        </strong>
                        <span>{STAGE_LABELS[game.stage - 1]}</span>
                      </div>
                    </div>
                    <div className="admin-question-grid">
                      <QuestionCard state={state} presenter>
                        {state.phase === 'question' && (
                          <div className="admin-question-controls">
                            <button
                              className="button button-secondary"
                              disabled={!canControl || !turn || (question?.hints.length ?? 0) >= 2}
                              onClick={() => {
                                if (turn) void stand.command({ type: 'hint', ...turn })
                              }}
                            >
                              <Icon name="bulb" />
                              Partager un indice
                            </button>
                            <button
                              className="button button-quiet"
                              disabled={!canControl || !turn}
                              onClick={async () => {
                                if (turn) {
                                  const result = await stand.command({
                                    type: 'replace-question',
                                    ...turn,
                                  })
                                  if (result.ok)
                                    setMessage(
                                      'Question changée, sans point ni progression supplémentaire.',
                                    )
                                }
                              }}
                            >
                              <Icon name="swap" />
                              Remplacer la question
                            </button>
                          </div>
                        )}
                        {state.phase === 'feedback' && (
                          <button
                            className="button button-primary next-button"
                            disabled={!canControl || !turn}
                            onClick={() => {
                              if (turn) void stand.command({ type: 'next', ...turn })
                            }}
                          >
                            Question suivante
                            <Icon name="arrow" />
                          </button>
                        )}
                      </QuestionCard>
                      {state.answer && (
                        <section className="private-answer panel" aria-label="Corrigé privé">
                          <span className="section-kicker">Réservé au pupitre</span>
                          <h2>{state.answer.country.name}</h2>
                          <p>{state.answer.explanation}</p>
                          <a href={state.answer.source.url} target="_blank" rel="noreferrer">
                            {state.answer.source.label}
                            <Icon name="arrow" width="16" height="16" />
                          </a>
                          <div className="private-hints">
                            {state.answer.hints.map((hint, i) => (
                              <div
                                key={i}
                                className={i < (question?.hints.length ?? 0) ? 'shared' : ''}
                              >
                                <span>
                                  <Icon name="bulb" width="17" height="17" />
                                  Indice {i + 1}
                                  <small>
                                    {i < (question?.hints.length ?? 0) ? 'Partagé' : 'Non partagé'}
                                  </small>
                                </span>
                                <p>{hint}</p>
                              </div>
                            ))}
                          </div>
                          {state.feedback && turn && (
                            <div className="verdict-correction">
                              <span>Corriger le verdict</span>
                              <button
                                className="button button-quiet"
                                disabled={!canControl || state.feedback.outcome === 'correct'}
                                onClick={() => void stand.command({ type: 'correct', ...turn })}
                              >
                                <Icon name="check" />
                                Accepter
                              </button>
                              <button
                                className="button button-quiet"
                                disabled={!canControl || state.feedback.outcome === 'incorrect'}
                                onClick={() => void stand.command({ type: 'incorrect', ...turn })}
                              >
                                <Icon name="close" />
                                Refuser
                              </button>
                            </div>
                          )}
                        </section>
                      )}
                    </div>
                    <div className="admin-game-footer">
                      {playing ? (
                        <button
                          className="button button-quiet"
                          disabled={!canControl}
                          onClick={() => setConfirmEnd(!confirmEnd)}
                        >
                          <Icon name="close" />
                          Terminer ce passage
                        </button>
                      ) : (
                        <button
                          className="button button-secondary"
                          disabled={!canControl}
                          onClick={() => void stand.command({ type: 'reset' })}
                        >
                          Prêt pour le prochain visiteur
                          <Icon name="arrow" />
                        </button>
                      )}
                      <span role="status">
                        {message ||
                          (!playing
                            ? 'Tentative enregistrée.'
                            : 'Remplacer une question ne fait pas avancer le niveau.')}
                      </span>
                    </div>
                    {confirmEnd && playing && (
                      <div
                        className="end-confirmation"
                        role="group"
                        aria-label="Confirmer la fin du passage"
                      >
                        <p>Terminer cette tentative ? Les points déjà obtenus seront conservés.</p>
                        <button
                          className="button button-primary"
                          disabled={!canControl}
                          onClick={() =>
                            void stand.command({ type: 'end-game', attemptId: game.id })
                          }
                        >
                          Oui, terminer
                        </button>
                        <button
                          className="button button-secondary"
                          onClick={() => setConfirmEnd(false)}
                        >
                          Continuer la partie
                        </button>
                      </div>
                    )}
                  </>
                )}
              </section>
              <AdminLeaderboard
                entries={state.adminLeaderboard}
                enabled={stand.connected && stand.controlled}
                loadHistory={stand.history}
              />
            </div>
            <aside className="admin-settings">
              {catalog.data && (
                <SettingsPanel
                  settings={state.settings}
                  catalog={catalog.data}
                  pending={!canControl}
                  save={(settings) => stand.command({ type: 'settings', settings })}
                />
              )}
              <p className="admin-privacy">
                <Icon name="info" />
                Le corrigé et les indices non partagés restent sur ce pupitre. L’écran visiteur ne
                reçoit la réponse qu’après le verdict.
              </p>
            </aside>
          </div>
        )}
      </main>
    </div>
  )
}

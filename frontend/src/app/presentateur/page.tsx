'use client'

import dynamic from 'next/dynamic'
import { useEffect, useMemo, useState } from 'react'
import type { Difficulty, StandSettings } from '@shared/types'
import { useStand } from '@/lib/useStand'
import SiteHeader from '@/components/SiteHeader'
import { QuestionCard } from '@/components/QuestionCard'
import { Leaderboard } from '@/components/Leaderboard'
import { Icon } from '@/components/Icon'

const Globe = dynamic(() => import('@/components/Globe'), { ssr: false })

export default function PresenterPage() {
  const stand = useStand('presenter')
  const state = stand.state?.role === 'presenter' ? stand.state : null
  const [name, setName] = useState(''),
    [saved, setSaved] = useState(false)
  useEffect(() => {
    setName(state?.participant.nickname ?? '')
  }, [state?.participant.nickname])
  const target = useMemo(
    () => (state ? { countryId: state.answer.country.id, pin: state.answer.location } : null),
    [state?.answer.country.id, state?.answer.location[0], state?.answer.location[1]],
  )
  const update = (settings: Partial<StandSettings>) => {
    if (state)
      void stand.command({ type: 'settings', settings: { ...state.settings, ...settings } })
  }
  const disabled = !stand.controlled || !stand.connected || stand.pending
  const finish = async () => {
    const success = await stand.command({ type: 'new-participant' })
    if (success) {
      setSaved(true)
      setTimeout(() => setSaved(false), 4_000)
    }
  }
  return (
    <div className="app-shell presenter-shell">
      <SiteHeader role="presenter" connected={stand.connected} />
      <div className="presenter-intro">
        <div>
          <p className="eyebrow">LE PUPITRE DU STAND</p>
          <h1>Faites voyager les esprits.</h1>
        </div>
        <span className="presenter-badge">
          <Icon name="settings" width="16" height="16" />
          PRÉSENTATEUR
        </span>
      </div>
      {(stand.error || saved) && (
        <div className={`stand-message ${stand.error ? 'is-error' : ''}`} role="status">
          {stand.error ||
            (saved
              ? 'Passage enregistré dans le classement. Le prochain visiteur peut jouer.'
              : '')}
          {!stand.controlled && (
            <button className="button button-quiet" onClick={stand.reconnect}>
              Reprendre la connexion
            </button>
          )}
        </div>
      )}
      {!state ? (
        <main className="panel connection-panel">
          <span className="loading-orbit" />
          <h2>Ouverture du pupitre…</h2>
          <p>{stand.error || 'Le stand se connecte automatiquement, sans compte ni code.'}</p>
        </main>
      ) : (
        <main className="presenter-layout">
          <section className="presenter-controls panel" aria-label="Commandes du présentateur">
            <div className="section-heading">
              <Icon name="user" />
              <h2>Le visiteur</h2>
              <span className="live-dot" />
            </div>
            <form
              className="nickname-form"
              onSubmit={(event) => {
                event.preventDefault()
                void stand.command({ type: 'rename', nickname: name })
              }}
            >
              <label htmlFor="nickname">
                Pseudo du visiteur <span>(facultatif)</span>
              </label>
              <div>
                <input
                  id="nickname"
                  maxLength={24}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Un prénom, un pseudo…"
                  disabled={disabled}
                />
                <button
                  className="icon-button"
                  type="submit"
                  aria-label="Enregistrer le pseudo"
                  disabled={disabled}
                >
                  <Icon name="check" />
                </button>
              </div>
            </form>
            <div className="presenter-score">
              <Icon name="spark" width="23" height="23" />
              <strong>{state.participant.score}</strong>
              <span>points</span>
            </div>
            <div className="visitor-stats">
              <span>
                <strong>{state.participant.correct}</strong>bonnes réponses
              </span>
              <span>
                <strong>{state.participant.answered}</strong>questions explorées
              </span>
            </div>
            <div className="presenter-buttons">
              <button
                className="button button-primary"
                disabled={disabled || state.phase !== 'feedback'}
                onClick={() => void stand.command({ type: 'next' })}
              >
                Question suivante
                <Icon name="arrow" />
              </button>
              <div className="two-buttons">
                <button
                  className="button button-secondary"
                  disabled={
                    disabled || state.phase !== 'question' || state.question.hints.length >= 2
                  }
                  onClick={() => void stand.command({ type: 'hint' })}
                >
                  <Icon name="bulb" />
                  Indice {state.question.hints.length}/2
                </button>
                <button
                  className="button button-secondary"
                  disabled={disabled || state.phase !== 'question'}
                  onClick={() => void stand.command({ type: 'skip' })}
                >
                  <Icon name="next" />
                  Passer
                </button>
              </div>
              <p className="control-help">
                Un indice : −5 points. Le score ne descend jamais sous zéro.
              </p>
            </div>
            {state.phase === 'feedback' && (
              <div className="verdict-controls">
                <span>Décision de l’animateur</span>
                <div className="two-buttons">
                  <button
                    className={`button button-quiet ${state.feedback?.outcome === 'correct' ? 'is-correct' : ''}`}
                    disabled={disabled}
                    onClick={() => void stand.command({ type: 'correct' })}
                  >
                    <Icon name="check" width="16" height="16" />
                    Accepter
                  </button>
                  <button
                    className={`button button-quiet ${state.feedback?.outcome === 'incorrect' ? 'is-incorrect' : ''}`}
                    disabled={disabled}
                    onClick={() => void stand.command({ type: 'incorrect' })}
                  >
                    <Icon name="close" width="16" height="16" />
                    Refuser
                  </button>
                </div>
              </div>
            )}
            <div className="finish-visitor">
              <button
                className="button button-finish"
                disabled={disabled}
                onClick={() => void finish()}
              >
                <Icon name="user" width="18" height="18" />
                {state.participant.answered ? 'Terminer le passage' : 'Visiteur suivant'}
                <Icon name="arrow" width="17" height="17" />
              </button>
              <small>Enregistre le score et accueille le prochain visiteur.</small>
            </div>
          </section>
          <section className="presenter-center" aria-label="Question et corrigé privé">
            <QuestionCard state={state} presenter />
            <div className="private-answer panel">
              <p className="eyebrow">
                <Icon name="check" width="15" height="15" />
                CORRIGÉ · VISIBLE ICI UNIQUEMENT
              </p>
              <h2>{state.answer.country.name}</h2>
              <p>{state.answer.explanation}</p>
              <a href={state.answer.source.url} target="_blank" rel="noreferrer">
                {state.answer.source.label}
                <Icon name="arrow" width="14" height="14" />
              </a>
            </div>
            <div className="presenter-globe panel">
              <Globe target={target} compact disabled />
            </div>
          </section>
          <aside className="presenter-aside">
            <section className="settings-card panel" aria-label="Réglages du stand">
              <div className="section-heading">
                <Icon name="settings" />
                <h2>Le parcours</h2>
              </div>
              <label htmlFor="theme">Thématique</label>
              <select
                id="theme"
                disabled={disabled}
                value={state.settings.theme}
                onChange={(event) => update({ theme: event.target.value })}
              >
                <option value="tous">Toutes les cultures</option>
                {state.catalog.themes.map((theme) => (
                  <option key={theme.id} value={theme.id}>
                    {theme.emoji} {theme.label}
                  </option>
                ))}
              </select>
              <label htmlFor="difficulty">Difficulté</label>
              <select
                id="difficulty"
                disabled={disabled}
                value={state.settings.difficulty}
                onChange={(event) =>
                  update({
                    difficulty:
                      event.target.value === 'progressive'
                        ? 'progressive'
                        : (Number(event.target.value) as Difficulty),
                  })
                }
              >
                <option value="progressive">Progressive · pour tous</option>
                {state.catalog.difficulties.map((level) => (
                  <option key={level.value} value={level.value}>
                    {level.label} · {level.points} points
                  </option>
                ))}
              </select>
              <label className="toggle-row" htmlFor="retry">
                <span>
                  Une seconde chance<small>Moitié des points au deuxième essai.</small>
                </span>
                <input
                  id="retry"
                  type="checkbox"
                  checked={state.settings.allowRetry}
                  disabled={disabled}
                  onChange={(event) => update({ allowRetry: event.target.checked })}
                />
              </label>
              <p className="settings-note">
                {state.catalog.questions} questions · {state.catalog.themes.length} thématiques
                <br />
                En continu, au rythme des visiteurs.
              </p>
            </section>
            <Leaderboard entries={state.leaderboard} />
          </aside>
        </main>
      )}
      <footer className="page-footer">
        <span>VOYAGE CULTUREL</span>
        <span>Un stand. Un visiteur à la fois. Le monde à découvrir.</span>
        <a href="/jouer" target="_blank" rel="noreferrer">
          Ouvrir l’écran joueur <Icon name="arrow" width="14" height="14" />
        </a>
      </footer>
    </div>
  )
}

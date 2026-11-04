'use client'

import type { PlayerState, PresenterState } from '@shared/types'
import { useEffect, type ReactNode } from 'react'
import { Icon } from './Icon'

export function QuestionCard({
  state,
  children,
  presenter = false,
}: {
  state: PlayerState | PresenterState
  children?: ReactNode
  presenter?: boolean
}) {
  const q = state.question,
    feedback = state.feedback
  useEffect(
    () => () => {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    },
    [q.turn],
  )
  const speak = () => {
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const speech = new SpeechSynthesisUtterance(q.prompt)
    speech.lang = 'fr-FR'
    window.speechSynthesis.speak(speech)
  }
  return (
    <section
      className={`question-card panel ${feedback ? 'resolved' : ''}`}
      aria-label="Question culturelle"
    >
      <div className="participant-row">
        <span className="participant-avatar">
          <Icon name="user" />
        </span>
        <span>
          <small>{presenter ? 'LE VISITEUR' : 'À VOUS DE JOUER'}</small>
          <strong>{state.participant.nickname}</strong>
        </span>
        <div className="score-pill">
          <Icon name="spark" width="17" height="17" />
          <strong>{state.participant.score}</strong>
          <small>pts</small>
        </div>
      </div>
      <div className="question-meta">
        <span className="theme-label">{q.themeLabel}</span>
        <span className="difficulty">
          <span className="difficulty-bars" aria-hidden="true">
            {[1, 2, 3, 4].map((n) => (
              <i key={n} className={n <= q.difficulty ? 'filled' : ''} />
            ))}
          </span>
          {q.difficultyLabel}
        </span>
      </div>
      <div className="question-title-row">
        <h1>{q.prompt}</h1>
        <button
          className="icon-button speak-button"
          onClick={speak}
          aria-label="Écouter la question"
          title="Écouter la question"
        >
          <Icon name="sound" width="18" height="18" />
        </button>
      </div>
      {!feedback && (
        <div className="question-value">
          <span>Quel pays se cache derrière cette question ?</span>
          <strong>
            +{q.points}
            <small> pts</small>
          </strong>
        </div>
      )}
      {q.hints.length > 0 && (
        <div className="hints" aria-live="polite">
          {q.hints.map((hint, index) => (
            <p key={hint}>
              <Icon name="bulb" width="16" height="16" />
              <span>
                <strong>Indice {index + 1}.</strong> {hint}
              </span>
            </p>
          ))}
        </div>
      )}
      {feedback && (
        <div className={`feedback feedback-${feedback.outcome}`} role="status">
          <span className="feedback-eyebrow">
            <Icon
              name={
                feedback.outcome === 'correct'
                  ? 'check'
                  : feedback.outcome === 'skipped'
                    ? 'next'
                    : 'globe'
              }
            />
            {feedback.outcome === 'correct'
              ? `Bien joué ! +${feedback.points} points`
              : feedback.outcome === 'skipped'
                ? 'Une nouvelle découverte'
                : 'On voyage, on apprend.'}
          </span>
          {!presenter && (
            <>
              <h2>{feedback.country.name}</h2>
              <p>{feedback.explanation}</p>
              <a href={feedback.source.url} target="_blank" rel="noreferrer">
                {feedback.source.label}
                <Icon name="arrow" width="14" height="14" />
              </a>
            </>
          )}
        </div>
      )}
      {children}
    </section>
  )
}

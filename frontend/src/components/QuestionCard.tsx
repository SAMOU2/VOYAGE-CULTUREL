'use client'

import type { StandState } from '@shared/types'
import { useEffect, type ReactNode } from 'react'
import { Icon } from './Icon'

export function QuestionCard({
  state,
  children,
  presenter = false,
}: {
  state: StandState
  children?: ReactNode
  presenter?: boolean
}) {
  const question = state.question,
    feedback = state.feedback
  useEffect(
    () => () => {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    },
    [question?.turn],
  )
  if (!question) return null
  const speak = () => {
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const speech = new SpeechSynthesisUtterance(question.prompt)
    speech.lang = 'fr-FR'
    window.speechSynthesis.speak(speech)
  }
  return (
    <section
      className={`question-card panel ${feedback ? 'resolved' : ''}`}
      aria-label="Question en cours"
    >
      <div className="question-scroll" tabIndex={0} role="group" aria-label="Énoncé et verdict">
        <div className="question-meta">
          <span>{question.themeLabel}</span>
          <strong>
            +{question.points}
            <small> pts</small>
          </strong>
        </div>
        <div className="question-title-row">
          <h1>{question.prompt}</h1>
          <button
            className="icon-button speak-button"
            onClick={speak}
            aria-label="Écouter la question"
            title="Écouter la question"
          >
            <Icon name="sound" />
          </button>
        </div>
        {question.hints.length > 0 && (
          <div className="hints" aria-live="polite">
            {question.hints.map((hint, i) => (
              <p key={i}>
                <Icon name="bulb" />
                <span>
                  <strong>Indice {i + 1}.</strong> {hint}
                </span>
              </p>
            ))}
          </div>
        )}
        {feedback && (
          <div className={`feedback feedback-${feedback.outcome}`} role="status">
            <div className="feedback-heading">
              <span className="verdict-icon">
                <Icon name={feedback.outcome === 'correct' ? 'check' : 'close'} />
              </span>
              <strong>
                {feedback.outcome === 'correct' ? 'Bonne réponse' : 'Ce n’est pas ce pays'}
              </strong>
              <span>{feedback.points > 0 ? `+${feedback.points} pts` : '0 pt'}</span>
            </div>
            {!presenter && (
              <>
                <span className="feedback-caption">
                  {feedback.outcome === 'correct' ? 'Vous avez trouvé' : 'La bonne réponse était'}
                </span>
                <h2>{feedback.country.name}</h2>
                <p>{feedback.explanation}</p>
                <a href={feedback.source.url} target="_blank" rel="noreferrer">
                  {feedback.source.label}
                  <Icon name="arrow" width="16" height="16" />
                </a>
              </>
            )}
          </div>
        )}
      </div>
      {children}
    </section>
  )
}

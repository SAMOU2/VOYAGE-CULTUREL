import type { PublicGame } from '@shared/types'
import { modeLabel, STAGE_LABELS } from '@shared/game'
import { Icon } from './Icon'

export function GameProgress({ game, resolved = false }: { game: PublicGame; resolved?: boolean }) {
  const remaining = game.questionsPerStage - game.stageAnswered
  return (
    <section className="game-progress panel" aria-label="Progression de la partie">
      <div className="player-identity">
        <span className="player-icon">
          <Icon name="user" />
        </span>
        <div>
          <small>À vous de jouer</small>
          <strong dir="auto">{game.fullName}</strong>
        </div>
      </div>
      <div className="game-score">
        <div>
          <span>Votre score</span>
          <strong data-testid="current-score">
            {game.score}
            <small> pts</small>
          </strong>
        </div>
        <span className="question-count">
          <strong>{Math.min(game.answered + (resolved ? 0 : 1), game.totalQuestions)}</strong> /{' '}
          {game.totalQuestions}
          <small>question</small>
        </span>
      </div>
      <ol className="stage-track" aria-label="Les quatre niveaux">
        {STAGE_LABELS.map((label, i) => (
          <li
            key={label}
            className={i + 1 < game.stage ? 'completed' : i + 1 === game.stage ? 'current' : ''}
            aria-current={i + 1 === game.stage ? 'step' : undefined}
          >
            <span>
              {i + 1 < game.stage ? (
                <Icon name="check" width="16" height="16" />
              ) : (
                String(i + 1).padStart(2, '0')
              )}
            </span>
            <small>{label}</small>
          </li>
        ))}
      </ol>
      <div className="stage-caption">
        <strong>
          Niveau {game.stage} · {STAGE_LABELS[game.stage - 1]}
        </strong>
        <span>
          {game.stageAnswered}/{game.questionsPerStage}
        </span>
      </div>
      <div
        className="progress-track"
        role="progressbar"
        aria-label="Questions résolues dans ce niveau"
        aria-valuemin={0}
        aria-valuemax={game.questionsPerStage}
        aria-valuenow={game.stageAnswered}
      >
        <span style={{ width: `${(100 * game.stageAnswered) / game.questionsPerStage}%` }} />
      </div>

      <div className="game-mode">
        <Icon name="globe" width="16" height="16" />
        {modeLabel(game.mode)}
        <span>
          {game.correct} bonne{game.correct > 1 ? 's' : ''} réponse{game.correct > 1 ? 's' : ''}
        </span>
      </div>
    </section>
  )
}

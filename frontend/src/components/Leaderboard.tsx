import type { LeaderboardEntry } from '@shared/types'
import { Icon } from './Icon'

export function Leaderboard({
  entries,
  compact = true,
  currentName,
}: {
  entries: LeaderboardEntry[]
  compact?: boolean
  currentName?: string
}) {
  const visible = entries.slice(0, compact ? 5 : 20)
  return (
    <section className="leaderboard panel" aria-label="Classement du stand">
      <div className="section-heading">
        <Icon name="trophy" />
        <h2>Meilleurs scores</h2>
        <span>TOP {compact ? '5' : '20'}</span>
      </div>
      <p className="ranking-help">Un joueur. Son meilleur score.</p>
      {!visible.length ? (
        <div className="empty-leaderboard">
          <span>01</span>
          <p>
            La première place
            <br />
            attend son joueur.
          </p>
        </div>
      ) : (
        <ol>
          {visible.map((entry) => (
            <li key={entry.userId} className={entry.fullName === currentName ? 'is-current' : ''}>
              <span className={`rank rank-${entry.rank}`}>
                {String(entry.rank).padStart(2, '0')}
              </span>
              <span className="leader-name" dir="auto" title={entry.fullName}>
                {entry.fullName}
                <small>
                  Niveau {entry.level} · {entry.correct}/{entry.answered}
                </small>
              </span>
              <strong>
                {entry.score}
                <small> pts</small>
              </strong>
            </li>
          ))}
        </ol>
      )}
      <span className="ranking-footnote">
        Chaque nouvelle tentative compte.
        <br />
        Seule la meilleure est affichée.
      </span>
    </section>
  )
}

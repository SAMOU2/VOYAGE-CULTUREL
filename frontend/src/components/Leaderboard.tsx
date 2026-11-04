import type { LeaderboardEntry } from '@shared/types'
import { Icon } from './Icon'

export function Leaderboard({
  entries,
  compact = false,
}: {
  entries: LeaderboardEntry[]
  compact?: boolean
}) {
  const visible = compact ? entries.slice(0, 3) : entries
  return (
    <section
      className={`leaderboard panel ${compact ? 'compact' : ''}`}
      aria-label="Classement du stand"
    >
      <div className="section-heading">
        <span className="heading-icon">
          <Icon name="trophy" />
        </span>
        <h2>Les grands voyageurs</h2>
        <span className="tiny-label">{compact ? 'TOP 3' : 'TOP 20'}</span>
      </div>
      {!entries.length ? (
        <p className="empty-leaderboard">
          Le premier voyage reste à écrire.
          <br />
          <span>Terminez un passage pour apparaître ici.</span>
        </p>
      ) : (
        <ol>
          {visible.map((entry) => (
            <li key={`${entry.rank}-${entry.completedAt}`}>
              <span className={`rank rank-${entry.rank}`}>
                {String(entry.rank).padStart(2, '0')}
              </span>
              <span className="leader-name">
                {entry.nickname}
                <small>
                  {entry.correct}/{entry.answered} bonnes réponses
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
    </section>
  )
}

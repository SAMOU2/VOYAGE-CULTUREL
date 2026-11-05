'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { AdminLeaderboardEntry, AttemptSummary } from '@shared/types'
import { STAGE_LABELS } from '@shared/game'
import { Icon } from './Icon'

export function AdminLeaderboard({
  entries,
  enabled,
  loadHistory,
}: {
  entries: AdminLeaderboardEntry[]
  enabled: boolean
  loadHistory: (id: string) => Promise<AttemptSummary[]>
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const history = useQuery({
    queryKey: ['attempt-history', 'presenter', selected],
    enabled: enabled && !!selected,
    queryFn: () => loadHistory(selected!),
    staleTime: 15_000,
  })
  const selectedName = entries.find((e) => e.userId === selected)?.fullName
  return (
    <section className="admin-ranking panel" aria-label="Classement détaillé">
      <div className="section-heading">
        <Icon name="trophy" />
        <h2>Classement du stand</h2>
        <span>
          {entries.length} joueur{entries.length > 1 ? 's' : ''}
        </span>
      </div>
      <p className="form-help">
        Meilleur score par nom. Toutes les tentatives restent enregistrées.
      </p>
      {!entries.length ? (
        <p className="admin-empty">Les résultats apparaîtront à la fin du premier passage.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Joueur</th>
                <th>Meilleur score</th>
                <th>Questions</th>
                <th>Niveau atteint</th>
                <th>Tentatives</th>
                <th>
                  <span className="sr-only">Historique</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.userId}>
                  <td>
                    <span className="table-rank">{String(entry.rank).padStart(2, '0')}</span>
                    <strong dir="auto">{entry.fullName}</strong>
                  </td>
                  <td className="table-score">
                    {entry.score}
                    <small> pts</small>
                  </td>
                  <td>
                    {entry.correct}/{entry.answered}
                  </td>
                  <td>
                    {entry.level} · {STAGE_LABELS[entry.level - 1]}
                  </td>
                  <td>{entry.attempts}</td>
                  <td>
                    <button
                      className="button button-quiet"
                      aria-expanded={selected === entry.userId}
                      onClick={() => setSelected(selected === entry.userId ? null : entry.userId)}
                    >
                      Tentatives
                      <Icon name="chevron" width="16" height="16" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {selected && (
        <div
          className="history-panel"
          role="region"
          aria-label={`Tentatives de ${selectedName ?? 'ce joueur'}`}
        >
          <div className="section-heading">
            <h3>
              Les tentatives de <b dir="auto">{selectedName}</b>
            </h3>
            <button
              className="icon-button"
              aria-label="Fermer les tentatives"
              onClick={() => setSelected(null)}
            >
              <Icon name="close" />
            </button>
          </div>
          {history.isPending ? (
            <p>Chargement…</p>
          ) : history.error ? (
            <p role="alert">{history.error.message}</p>
          ) : (
            <>
              <p className="form-help">
                Les 50 tentatives les plus récentes. Le fichier JSON conserve l’historique complet.
              </p>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Score</th>
                      <th>Réponses justes</th>
                      <th>Niveau</th>
                      <th>État</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.data?.map((attempt) => (
                      <tr key={attempt.id}>
                        <td>
                          {new Date(attempt.startedAt).toLocaleString('fr', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td>{attempt.score} pts</td>
                        <td>
                          {attempt.correct}/{attempt.answered}
                        </td>
                        <td>
                          {attempt.maxLevel} · {STAGE_LABELS[attempt.maxLevel - 1]}
                        </td>
                        <td>
                          {attempt.status === 'playing'
                            ? 'En cours'
                            : attempt.status === 'completed'
                              ? 'Terminée'
                              : attempt.status === 'stopped'
                                ? 'Arrêtée'
                                : 'Interrompue'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  )
}

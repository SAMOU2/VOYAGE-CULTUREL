'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import SiteHeader from '@/components/SiteHeader'
import WorldMap from '@/components/WorldMap'
import { DIFFICULTIES, QUESTION_COUNTS, THEME_EMOJI, THEMES } from '@/lib/catalog'
import { emitAck, getSocket, hostSession } from '@/lib/socket'
import type { HostState } from '@/lib/types'

const DIFFICULTY_LABEL: Record<number, string> = { 1: 'Facile', 2: 'Moyen', 3: 'Expert' }
const DIFFICULTY_CLASS: Record<number, string> = { 1: 'pill-green', 2: 'pill-gold', 3: 'pill-rose' }

interface Config {
  theme: string
  difficulty: string
  count: number
  allowRetry: boolean
}

export default function HostPage() {
  const [state, setState] = useState<HostState | null>(null)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [origin, setOrigin] = useState('')
  const [config, setConfig] = useState<Config>({ theme: 'tous', difficulty: 'mixte', count: 8, allowRetry: true })

  const showToast = useCallback((message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(null), 2200)
  }, [])

  /* ------------------------------ connexion ------------------------------ */

  const resume = useCallback(async () => {
    const session = hostSession.read()
    if (!session) return
    const res: any = await emitAck('host:rejoin', { code: session.code, token: session.hostToken })
    if (!res?.ok) {
      hostSession.clear()
      return
    }
    setState((s) => s ?? null)
  }, [])

  useEffect(() => {
    setOrigin(window.location.origin)
    const socket = getSocket()
    let resumed = false

    const onConnect = () => {
      setConnected(true)
      if (!resumed) {
        resumed = true
        void resume()
      }
    }
    const onDisconnect = () => setConnected(false)
    const onState = (next: HostState) => {
      if (next.role !== 'host') return
      setState(next)
      setConfig({
        theme: next.config.theme,
        difficulty: String(next.config.difficulty),
        count: next.config.count,
        allowRetry: next.config.allowRetry,
      })
    }

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('state', onState)
    if (socket.connected) onConnect()

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('state', onState)
    }
  }, [resume])

  const joinUrl = useMemo(
    () => (state ? `${origin}/jouer?code=${state.roomCode}` : ''),
    [origin, state]
  )

  // Le QR code est généré côté serveur (/api/qr) : aucune dépendance lourde dans le navigateur.
  useEffect(() => {
    setQr(joinUrl ? `/api/qr?data=${encodeURIComponent(joinUrl)}` : null)
  }, [joinUrl])

  /* ------------------------------- actions -------------------------------- */

  const createRoom = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setBusy(true)
    setError(null)
    const res: any = await emitAck('host:create', {
      theme: config.theme,
      difficulty: config.difficulty === 'mixte' ? 'mixte' : Number(config.difficulty),
      count: config.count,
      allowRetry: config.allowRetry,
    })
    setBusy(false)
    if (!res?.ok) {
      setError(res?.error ?? 'Création impossible.')
      return
    }
    hostSession.save({ code: res.code, hostToken: res.hostToken })
  }

  const command = async (type: string, payload: Record<string, unknown> = {}) => {
    if (!state) return
    const res: any = await emitAck('host:command', { code: state.roomCode, type, payload })
    if (!res?.ok) setError(res?.error ?? 'Commande refusée.')
    else setError(null)
  }

  const updateConfig = async (patch: Partial<Config>) => {
    const next = { ...config, ...patch }
    setConfig(next)
    await command('config', {
      theme: next.theme,
      difficulty: next.difficulty === 'mixte' ? 'mixte' : Number(next.difficulty),
      count: next.count,
      allowRetry: next.allowRetry,
    })
  }

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value)
      showToast(`${label} copié`)
    } catch {
      showToast('Copie impossible — sélectionnez le texte à la main')
    }
  }

  const resetRoom = () => {
    hostSession.clear()
    setState(null)
    setQr(null)
  }

  /* -------------------------------- rendu -------------------------------- */

  if (!state) {
    return (
      <div className="app">
        <SiteHeader />
        <main className="main">
          <div className="container" style={{ maxWidth: 720 }}>
            <span className="eyebrow">Interface présentateur</span>
            <h1 className="display-sm" style={{ marginTop: 12 }}>
              Ouvrir une salle
            </h1>
            <p className="muted small">
              Vous gardez la main : vous voyez les réponses attendues, distribuez les indices et validez les
              propositions. Le joueur ne reçoit la réponse qu&apos;après votre décision.
            </p>

            <form className="card stack" onSubmit={createRoom} style={{ marginTop: 18 }}>
              <div className="field">
                <label className="label" htmlFor="theme">
                  Thème de la partie
                </label>
                <select
                  id="theme"
                  className="select"
                  value={config.theme}
                  onChange={(e) => setConfig({ ...config, theme: e.target.value })}
                >
                  {THEMES.map((theme) => (
                    <option value={theme.id} key={theme.id}>
                      {theme.emoji} {theme.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label className="label" htmlFor="difficulty">
                  Difficulté
                </label>
                <select
                  id="difficulty"
                  className="select"
                  value={config.difficulty}
                  onChange={(e) => setConfig({ ...config, difficulty: e.target.value })}
                >
                  {DIFFICULTIES.map((difficulty) => (
                    <option value={difficulty.id} key={difficulty.id}>
                      {difficulty.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label className="label" htmlFor="count">
                  Nombre de questions
                </label>
                <select
                  id="count"
                  className="select"
                  value={config.count}
                  onChange={(e) => setConfig({ ...config, count: Number(e.target.value) })}
                >
                  {QUESTION_COUNTS.map((count) => (
                    <option value={count} key={count}>
                      {count} questions · environ {Math.round((count * 70) / 60)} min
                    </option>
                  ))}
                </select>
              </div>

              <label className="switch" htmlFor="retry">
                <input
                  id="retry"
                  type="checkbox"
                  checked={config.allowRetry}
                  onChange={(e) => setConfig({ ...config, allowRetry: e.target.checked })}
                />
                <span>
                  Accorder une seconde chance en cas d&apos;erreur
                  <span className="tiny muted" style={{ display: 'block' }}>
                    La seconde tentative vaut la moitié des points restants.
                  </span>
                </span>
              </label>

              {error && <p className="small rose" style={{ margin: 0 }}>{error}</p>}

              <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={busy}>
                {busy ? 'Ouverture…' : 'Créer la salle et afficher le code'}
              </button>

              <p className="tiny muted" style={{ margin: 0 }}>
                {connected ? <span className="teal">● Serveur local joignable</span> : <span className="rose">● Connexion…</span>}
              </p>
            </form>
          </div>
        </main>
      </div>
    )
  }

  const player = state.player
  const current = state.current
  const resolved = current?.resolved ?? null
  const inProgress = state.status === 'playing'

  return (
    <div className="app">
      <SiteHeader />
      <main className="main">
        <div className="container-wide">
          <div className="spread" style={{ marginBottom: 16 }}>
            <div className="row">
              <span className="pill pill-gold">🎤 Présentateur</span>
              <span className="pill pill-teal">
                <span className="dot" /> Salle {state.roomCode}
              </span>
              <span className="pill">
                {state.config.themeLabel} · {state.config.difficultyLabel}
              </span>
              {state.status === 'playing' && (
                <span className="pill">
                  Question {state.progress.index}/{state.progress.total}
                </span>
              )}
            </div>
            <div className="row">
              <Link className="btn btn-sm" href="/jouer" target="_blank" rel="noreferrer">
                Ouvrir l&apos;écran joueur
              </Link>
              <button className="btn btn-sm btn-ghost" type="button" onClick={resetRoom}>
                {state.status === 'lobby' ? 'Fermer la salle' : 'Nouvelle salle'}
              </button>
            </div>
          </div>

          {error && (
            <p className="small rose" style={{ marginBottom: 12 }}>
              {error}
            </p>
          )}

          {/* ------------------------------- SALLE D'ATTENTE ------------------------------- */}
          {state.status === 'lobby' && (
            <div className="host-grid">
              <div className="card">
                <div className="card-head">Accès des joueurs</div>
                <div className="qr-wrap">
                  <div>
                    <div className="tiny muted" style={{ letterSpacing: '0.18em', textTransform: 'uppercase' }}>
                      Code de la salle
                    </div>
                    <div className="code-badge">{state.roomCode}</div>
                    <div className="row" style={{ marginTop: 6 }}>
                      <button className="btn btn-sm" type="button" onClick={() => copy(state.roomCode, 'Code')}>
                        Copier le code
                      </button>
                      <button className="btn btn-sm" type="button" onClick={() => copy(joinUrl, 'Lien')}>
                        Copier le lien
                      </button>
                    </div>
                  </div>
                  {qr && (
                    <div className="qr">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={qr} alt={`QR code pour rejoindre la salle ${state.roomCode}`} width={180} height={180} />
                    </div>
                  )}
                </div>

                <div className="link-box" style={{ marginTop: 16 }}>
                  <span className="tiny muted">Lien</span>
                  <code>{joinUrl || '—'}</code>
                </div>

                <p className="tiny muted" style={{ marginTop: 12 }}>
                  Le joueur scanne le QR code ou ouvre ce lien depuis un appareil connecté au même Wi-Fi. Sur un
                  téléphone, n&apos;utilisez pas « localhost » : il désigne le téléphone lui-même.
                </p>

                <hr className="divider" />

                <div className="spread">
                  <div>
                    <div className="stat-label">Joueur</div>
                    <div className="row" style={{ marginTop: 6 }}>
                      {player ? (
                        <>
                          <span className="pill pill-teal">
                            <span className="dot" /> {player.pseudo}
                          </span>
                          <span className={`pill ${player.connected ? 'pill-green' : 'pill-rose'}`}>
                            {player.connected ? 'connecté' : 'déconnecté'}
                          </span>
                        </>
                      ) : (
                        <span className="pill pill-gold">
                          <span className="dot" /> En attente d&apos;un joueur…
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    className="btn btn-primary btn-lg"
                    type="button"
                    disabled={!player?.connected}
                    onClick={() => void command('start')}
                  >
                    Démarrer la partie
                  </button>
                </div>
              </div>

              <div className="card">
                <div className="card-head">Réglages</div>
                <div className="stack" style={{ gap: 12 }}>
                  <div className="field">
                    <label className="label" htmlFor="theme2">
                      Thème
                    </label>
                    <select
                      id="theme2"
                      className="select"
                      value={config.theme}
                      onChange={(e) => void updateConfig({ theme: e.target.value })}
                    >
                      {THEMES.map((theme) => (
                        <option value={theme.id} key={theme.id}>
                          {theme.emoji} {theme.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label className="label" htmlFor="difficulty2">
                      Difficulté
                    </label>
                    <select
                      id="difficulty2"
                      className="select"
                      value={config.difficulty}
                      onChange={(e) => void updateConfig({ difficulty: e.target.value })}
                    >
                      {DIFFICULTIES.map((difficulty) => (
                        <option value={difficulty.id} key={difficulty.id}>
                          {difficulty.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label className="label" htmlFor="count2">
                      Questions
                    </label>
                    <select
                      id="count2"
                      className="select"
                      value={config.count}
                      onChange={(e) => void updateConfig({ count: Number(e.target.value) })}
                    >
                      {QUESTION_COUNTS.map((count) => (
                        <option value={count} key={count}>
                          {count} questions
                        </option>
                      ))}
                    </select>
                  </div>
                  <label className="switch" htmlFor="retry2">
                    <input
                      id="retry2"
                      type="checkbox"
                      checked={config.allowRetry}
                      onChange={(e) => void updateConfig({ allowRetry: e.target.checked })}
                    />
                    <span>Seconde chance autorisée</span>
                  </label>
                </div>

                <p className="tiny muted" style={{ marginTop: 16 }}>
                  {state.bankSize} questions dans la banque, vérifiées avant la partie. Les réglages sont figés au
                  démarrage.
                </p>
              </div>
            </div>
          )}

          {/* ---------------------------------- PARTIE ---------------------------------- */}
          {inProgress && current && (
            <div className="host-grid">
              <div className="stack">
                <div className="question-card">
                  <div className="question-meta">
                    <span className="pill">
                      {THEME_EMOJI[current.theme] ?? '🌍'} {current.themeLabel}
                    </span>
                    <span className={`pill ${DIFFICULTY_CLASS[current.difficulty]}`}>
                      {DIFFICULTY_LABEL[current.difficulty]}
                    </span>
                    <span className="pill">
                      Question {state.progress.index}/{state.progress.total}
                    </span>
                    {current.attempts > 0 && <span className="pill pill-gold">Seconde tentative</span>}
                  </div>
                  <p className="question-text" style={{ margin: 0 }}>
                    {current.question}
                  </p>
                </div>

                <div className="answer-reveal">
                  <div className="spread">
                    <span className="tiny" style={{ letterSpacing: '0.18em', textTransform: 'uppercase', color: '#ffd98a' }}>
                      Réponse attendue — visible par vous seul
                    </span>
                    <span className="pill pill-gold">{current.country}</span>
                  </div>
                  <div className="big" style={{ marginTop: 8 }}>
                    {current.answer}
                  </div>
                  <div className="variants">
                    {current.accepted.slice(0, 8).map((variant) => (
                      <span className="variant" key={variant}>
                        {variant}
                      </span>
                    ))}
                  </div>
                  <p className="small" style={{ color: '#ffe9c2', margin: '12px 0 0' }}>
                    {current.explanation}
                  </p>
                  <p className="tiny" style={{ margin: '8px 0 0', color: 'rgba(255,233,194,0.7)' }}>
                    Source : {current.source.label}
                    {current.source.url ? (
                      <>
                        {' — '}
                        <a href={current.source.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>
                          consulter
                        </a>
                      </>
                    ) : null}
                  </p>
                </div>

                <div className="submission">
                  <div className="spread">
                    <span className="label">Proposition du joueur</span>
                    {player?.hasAnswered ? (
                      current.autoMatch ? (
                        <span className="pill pill-green">Saisie reconnue</span>
                      ) : (
                        <span className="pill pill-gold">À vous de juger</span>
                      )
                    ) : (
                      <span className="pill">En attente</span>
                    )}
                  </div>

                  {player?.hasAnswered ? (
                    <div style={{ marginTop: 8 }}>
                      <p style={{ margin: '0 0 6px', fontSize: 18 }}>
                        {player.text ? `« ${player.text} »` : '(réponse donnée sur la carte)'}
                      </p>
                      <div className="row small">
                        {player.pin ? (
                          <span className="pill">
                            Repère : {player.pin[1].toFixed(1)}° {player.pin[1] >= 0 ? 'N' : 'S'}, {player.pin[0].toFixed(1)}°{' '}
                            {player.pin[0] >= 0 ? 'E' : 'O'}
                          </span>
                        ) : (
                          <span className="pill">Pas de repère placé</span>
                        )}
                        {current.distanceKm != null && (
                          <span className={`pill ${current.nearTarget ? 'pill-green' : 'pill-rose'}`}>
                            à {current.distanceKm.toLocaleString('fr-FR')} km du lieu attendu
                            {current.nearTarget ? ' — proche' : ''}
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="small muted" style={{ margin: '8px 0 0' }}>
                      Le joueur explore la carte. Vous pouvez déjà donner un indice.
                    </p>
                  )}
                </div>

                {current.hintLevel > 0 && (
                  <ul className="hint-list" style={{ marginTop: 0 }}>
                    {current.hints.slice(0, current.hintLevel).map((hint, index) => (
                      <li className="hint-item" key={index}>
                        <span aria-hidden>💡</span>
                        <span>{hint}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {resolved && (
                  <div
                    className={`feedback ${resolved.outcome === 'correct' ? 'ok' : resolved.outcome === 'skipped' ? 'mid' : 'ko'}`}
                  >
                    <div className="spread">
                      <strong>
                        {resolved.outcome === 'correct'
                          ? '✅ Validée'
                          : resolved.outcome === 'skipped'
                          ? '⏭️ Passée'
                          : resolved.outcome === 'ended'
                          ? 'Partie terminée'
                          : '❌ Refusée'}
                      </strong>
                      <span className="pill">{resolved.points > 0 ? `+${resolved.points} points` : '0 point'}</span>
                    </div>
                  </div>
                )}

                <div className="card card-tight">
                  <div className="card-head">Commandes</div>
                  <div className="btn-grid">
                    <button
                      className="btn btn-gold"
                      type="button"
                      disabled={current.hintLevel >= current.hints.length || current.status === 'feedback'}
                      onClick={() => void command('hint')}
                    >
                      💡 Donner un indice
                    </button>
                    <button
                      className="btn btn-primary"
                      type="button"
                      disabled={!player?.hasAnswered || current.status === 'feedback'}
                      onClick={() => void command('correct')}
                    >
                      ✅ Bonne réponse
                    </button>
                    <button
                      className="btn btn-danger"
                      type="button"
                      disabled={!player?.hasAnswered || current.status === 'feedback'}
                      onClick={() => void command('incorrect')}
                    >
                      ❌ Incorrecte
                    </button>
                    <button
                      className="btn"
                      type="button"
                      disabled={current.status === 'feedback'}
                      onClick={() => void command('skip')}
                    >
                      ⏭️ Passer
                    </button>
                    <button
                      className="btn btn-primary"
                      type="button"
                      disabled={current.status !== 'feedback'}
                      onClick={() => void command('next')}
                    >
                      {state.progress.index >= state.progress.total ? '🏁 Voir le bilan' : 'Question suivante →'}
                    </button>
                    <button className="btn btn-ghost" type="button" onClick={() => void command('end')}>
                      Terminer la partie
                    </button>
                  </div>
                  <p className="tiny muted" style={{ margin: '10px 0 0' }}>
                    {state.config.allowRetry
                      ? 'Une erreur peut donner lieu à une seconde chance (moitié des points).'
                      : 'Une erreur clôt la question : aucune seconde chance dans cette partie.'}
                  </p>
                </div>
              </div>

              <aside className="stack">
                <div className="card card-tight">
                  <div className="card-head">Joueur</div>
                  <div className="spread">
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 600 }}>{player?.pseudo ?? '—'}</div>
                      <span className={`pill ${player?.connected ? 'pill-green' : 'pill-rose'}`} style={{ marginTop: 6 }}>
                        <span className="dot" /> {player?.connected ? 'connecté' : 'déconnecté'}
                      </span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="stat-label">Score</div>
                      <div className="stat-value teal">{player?.score ?? 0}</div>
                    </div>
                  </div>
                  <div className="stat-grid" style={{ marginTop: 12 }}>
                    <div className="stat">
                      <div className="stat-label">Niveau</div>
                      <div className="stat-value gold">{player?.level ?? 1}</div>
                    </div>
                    <div className="stat">
                      <div className="stat-label">Réussies</div>
                      <div className="stat-value">{player?.correct ?? 0}</div>
                    </div>
                  </div>
                </div>

                <div className="card card-tight">
                  <div className="card-head">Carte du présentateur</div>
                  <WorldMap
                    mode="flat"
                    className=""
                    pin={player?.pin ?? null}
                    target={current.coords}
                    targetIso={resolved ? current.isoN : null}
                    labels
                    interactive
                    compact
                  />
                  <p className="tiny muted" style={{ margin: '8px 0 0' }}>
                    Épingle rose : repère du joueur · repère doré : lieu attendu.
                  </p>
                </div>

                <div className="card card-tight">
                  <div className="card-head">Historique</div>
                  {state.history.length === 0 ? (
                    <p className="small muted" style={{ margin: 0 }}>
                      Les réponses validées apparaîtront ici.
                    </p>
                  ) : (
                    <div className="history">
                      {[...state.history].reverse().map((entry, index) => (
                        <div className="history-row" key={`${entry.questionId}-${index}`}>
                          <span>
                            {entry.outcome === 'correct' ? '✅' : entry.outcome === 'skipped' ? '⏭️' : '❌'}{' '}
                            {entry.text || 'réponse cartographique'}
                          </span>
                          <span className="muted">{entry.points > 0 ? `+${entry.points}` : '0'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </aside>
            </div>
          )}

          {/* ---------------------------------- BILAN ---------------------------------- */}
          {state.status === 'finished' && (
            <div className="stack">
              <div className="card" style={{ textAlign: 'center', padding: 40 }}>
                <div style={{ fontSize: 52 }} aria-hidden>
                  {state.badge.emoji}
                </div>
                <span className="eyebrow" style={{ justifyContent: 'center' }}>
                  Bilan de la partie
                </span>
                <h2 className="display-sm" style={{ marginTop: 10 }}>
                  {state.badge.label}
                </h2>
                <p className="muted">
                  {player?.pseudo ?? 'Le joueur'} termine avec {player?.score ?? 0} points et {player?.correct ?? 0}{' '}
                  bonne{(player?.correct ?? 0) > 1 ? 's' : ''} réponse{(player?.correct ?? 0) > 1 ? 's' : ''}.
                </p>

                <div className="recap" style={{ marginTop: 16, textAlign: 'left' }}>
                  <div className="stat">
                    <div className="stat-label">Score</div>
                    <div className="stat-value teal">{player?.score ?? 0}</div>
                  </div>
                  <div className="stat">
                    <div className="stat-label">Niveau</div>
                    <div className="stat-value gold">{player?.level ?? 1}</div>
                  </div>
                  <div className="stat">
                    <div className="stat-label">Pays trouvés</div>
                    <div className="stat-value">{player?.found.length ?? 0}</div>
                  </div>
                  <div className="stat">
                    <div className="stat-label">Questions</div>
                    <div className="stat-value">{state.history.length}</div>
                  </div>
                </div>

                <div className="country-list" style={{ justifyContent: 'center', marginTop: 18 }}>
                  {(player?.found ?? []).map((country) => (
                    <span className="pill pill-teal" key={country}>
                      {country}
                    </span>
                  ))}
                </div>

                <div className="row" style={{ justifyContent: 'center', marginTop: 24 }}>
                  <button className="btn btn-primary" type="button" onClick={() => void command('restart')}>
                    Rejouer dans la même salle
                  </button>
                  <button className="btn" type="button" onClick={resetRoom}>
                    Nouvelle salle
                  </button>
                </div>
              </div>

              <div className="card card-tight">
                <div className="card-head">Détail des réponses</div>
                {state.history.length === 0 ? (
                  <p className="small muted" style={{ margin: 0 }}>
                    Aucune réponse enregistrée.
                  </p>
                ) : (
                  <div className="history">
                    {state.history.map((entry, index) => (
                      <div className="history-row" key={`${entry.questionId}-${index}`}>
                        <span>
                          {entry.outcome === 'skipped' ? '⏭️' : entry.outcome === 'correct' ? '✅' : '❌'} Question{' '}
                          {index + 1} · {entry.text || 'réponse cartographique'}
                        </span>
                        <span className="muted">
                          {entry.points > 0 ? `+${entry.points} pts` : '0 pt'}
                          {entry.hintsUsed > 0 ? ` · ${entry.hintsUsed} indice${entry.hintsUsed > 1 ? 's' : ''}` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

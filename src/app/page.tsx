'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import WorldMap from '@/components/WorldMap'
import SiteHeader from '@/components/SiteHeader'

const RULES = [
  { label: 'Question facile', value: '+10 pts', note: 'Dès 8 ans' },
  { label: 'Question moyenne', value: '+20 pts', note: 'Culture générale' },
  { label: 'Question experte', value: '+30 pts', note: 'Pour les curieux' },
]

export default function HomePage() {
  const [bank, setBank] = useState<{ total: number; checkedAt: string } | null>(null)

  useEffect(() => {
    fetch('/api/bank')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setBank(data))
      .catch(() => undefined)
  }, [])

  return (
    <div className="app">
      <SiteHeader />

      <main className="main">
        <div className="container">
          <section className="hero">
            <div className="hero-copy">
              <span className="eyebrow">Jeu culturel · réseau local</span>
              <h1 className="display" style={{ marginTop: 16 }}>
                Le monde,
                <br />
                une question
                <br />
                à la fois.
              </h1>
              <p className="lead" style={{ marginTop: 18 }}>
                Un joueur explore un globe interactif. Un présentateur pilote la partie, garde les réponses et
                valide. Deux écrans, un seul Wi-Fi, aucune donnée qui quitte la salle.
              </p>

              <div className="row" style={{ marginTop: 26 }}>
                <Link href="/presentateur" className="btn btn-primary btn-lg">
                  Ouvrir une salle 🎤
                </Link>
                <Link href="/jouer" className="btn btn-lg">
                  Rejoindre une partie
                </Link>
              </div>

              <div className="row small muted" style={{ marginTop: 22, gap: 18 }}>
                <span className="pill pill-teal">
                  <span className="dot" /> {bank ? `${bank.total} questions vérifiées` : 'Banque de questions locale'}
                </span>
                <span className="pill">Un joueur · un présentateur</span>
                <span className="pill">Hors ligne après chargement</span>
              </div>
            </div>

            <div className="hero-globe">
              <WorldMap mode="globe" autoRotate compact interactive={false} target={[2.35, 48.85]} />
              <div className="orbit" aria-hidden />
            </div>
          </section>

          <section className="choice-grid" style={{ marginTop: 30 }}>
            <Link href="/presentateur" className="choice">
              <span className="choice-icon gold" aria-hidden>
                🎤
              </span>
              <h2 style={{ fontSize: 22, marginBottom: 0 }}>Je suis présentateur</h2>
              <p className="muted" style={{ margin: 0, fontSize: 14 }}>
                Créez une salle, projetez le code ou le QR code, gardez les réponses pour vous et validez les
                propositions du joueur.
              </p>
              <span className="teal small" style={{ marginTop: 'auto', fontWeight: 600 }}>
                Créer une salle →
              </span>
            </Link>

            <Link href="/jouer" className="choice">
              <span className="choice-icon" aria-hidden>
                🧭
              </span>
              <h2 style={{ fontSize: 22, marginBottom: 0 }}>Je suis joueur</h2>
              <p className="muted" style={{ margin: 0, fontSize: 14 }}>
                Saisissez le code de la salle, puis explorez la carte : zoomez, placez votre repère, répondez au
                clavier ou à la voix.
              </p>
              <span className="teal small" style={{ marginTop: 'auto', fontWeight: 600 }}>
                Rejoindre la partie →
              </span>
            </Link>
          </section>

          <section style={{ marginTop: 54 }}>
            <span className="eyebrow">Déroulement</span>
            <h2 className="display-sm" style={{ marginTop: 12 }}>
              Une manche, quatre temps
            </h2>
            <div className="steps" style={{ marginTop: 18 }}>
              <div className="step">
                <strong>La salle s&apos;ouvre</strong>
                Le présentateur choisit thème, difficulté et nombre de questions. Un code à 5 caractères et un QR
                code suffisent pour entrer.
              </div>
              <div className="step">
                <strong>La question s&apos;affiche</strong>
                Elle peut être lue à voix haute. Le joueur explore le globe ou la carte plate, cherche, puis
                place un repère.
              </div>
              <div className="step">
                <strong>Le présentateur tranche</strong>
                Il voit la réponse attendue, les variantes acceptées, la distance du repère. Indice, validation,
                nouvelle chance ou question suivante.
              </div>
              <div className="step">
                <strong>Le score grimpe</strong>
                Points, niveau et pays trouvés se mettent à jour sur les deux écrans. La fin de partie débloque
                un badge.
              </div>
            </div>
          </section>

          <section style={{ marginTop: 54 }}>
            <div className="card">
              <div className="spread" style={{ alignItems: 'flex-start' }}>
                <div>
                  <span className="eyebrow">Règles</span>
                  <h2 className="display-sm" style={{ marginTop: 12 }}>
                    Simple à comprendre, réglable par le présentateur
                  </h2>
                </div>
                <span className="pill pill-gold">Paramètres modifiables avant la partie</span>
              </div>

              <div className="stat-grid" style={{ marginTop: 20 }}>
                {RULES.map((rule) => (
                  <div className="stat" key={rule.label}>
                    <div className="stat-label">{rule.label}</div>
                    <div className="stat-value gold">{rule.value}</div>
                    <div className="tiny muted">{rule.note}</div>
                  </div>
                ))}
              </div>

              <ul className="muted small" style={{ marginTop: 20, paddingLeft: 18, lineHeight: 1.8 }}>
                <li>Un indice coûte 5 points, et la réponse vaut au minimum 5 points.</li>
                <li>
                  Mauvaise réponse : le présentateur peut accorder une seconde chance, à demi-points (option
                  activée par défaut).
                </li>
                <li>Une bonne réponse fait progresser d&apos;un niveau tous les 40 à 100 points.</li>
                <li>La réponse attendue n&apos;est jamais envoyée au navigateur du joueur avant la validation.</li>
              </ul>
            </div>
          </section>
        </div>
      </main>

      <footer className="footer">
        <div className="container spread">
          <span>Voyage Culturel — dossier de conception mis en œuvre (MVP).</span>
          <span>
            {bank ? `Banque vérifiée le ${new Date(bank.checkedAt).toLocaleDateString('fr-FR')}` : 'Banque locale de questions'} · Serveur sur le réseau local
          </span>
        </div>
      </footer>
    </div>
  )
}

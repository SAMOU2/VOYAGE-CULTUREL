import Link from 'next/link'
import WorldMap from '@/components/WorldMap'
import SiteHeader from '@/components/SiteHeader'

export default function HomePage() {
  return (
    <div className="app">
      <SiteHeader />
      <main id="main-content" className="page-width welcome">
        <div className="welcome-copy">
          <p className="overline">Le monde est votre terrain de jeu</p>
          <h1>
            Une question.
            <br />À vous de trouver
            <br />
            le bon pays.
          </h1>
          <p className="welcome-description">
            Explorez le globe, choisissez un pays et validez votre réponse.
          </p>
          <div className="welcome-actions">
            <Link href="/presentateur" className="btn btn-primary">
              Créer une salle
            </Link>
            <Link href="/jouer" className="btn">
              Rejoindre une partie
            </Link>
          </div>
          <p className="welcome-note">Un joueur, un présentateur, le même Wi-Fi.</p>
        </div>
        <div className="welcome-globe" aria-hidden="true">
          <WorldMap mode="globe" compact interactive={false} labels={false} />
        </div>
      </main>
    </div>
  )
}

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const LINKS = [
  { href: '/', label: 'Accueil' },
  { href: '/presentateur', label: 'Présentateur' },
  { href: '/jouer', label: 'Rejoindre' },
]

export default function SiteHeader() {
  const pathname = usePathname()

  return (
    <header className="topbar">
      <div className="container topbar-inner">
        <Link href="/" className="brand" aria-label="Voyage Culturel, retour à l'accueil">
          <span className="brand-mark" aria-hidden>
            🌍
          </span>
          <span>
            Voyage Culturel
            <small>Explorer · Répondre · Progresser</small>
          </span>
        </Link>

        <nav className="nav-links" aria-label="Navigation principale">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="nav-link"
              style={
                pathname === link.href
                  ? { color: 'var(--ink)', background: 'rgba(94,234,212,0.1)', borderColor: 'rgba(94,234,212,0.35)' }
                  : undefined
              }
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  )
}

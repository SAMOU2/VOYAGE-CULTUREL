'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

const LINKS = [
  { href: '/presentateur', label: 'Présentateur' },
  { href: '/jouer', label: 'Joueur' },
]

export default function SiteHeader({ children }: { children?: ReactNode }) {
  const pathname = usePathname()

  return (
    <header className="topbar">
      <a className="skip-link" href="#main-content">
        Aller au contenu
      </a>
      <div className="page-width topbar-inner">
        <Link href="/" className="brand" aria-label="Voyage Culturel, accueil">
          <svg width="25" height="25" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="1.4" />
            <path
              d="m15.8 8.2-2.1 5.5-5.5 2.1 2.1-5.5 5.5-2.1Z"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
          </svg>
          <span>Voyage Culturel</span>
        </Link>
        {children ? (
          <div className="header-actions">{children}</div>
        ) : (
          <nav className="nav-links" aria-label="Navigation principale">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="nav-link"
                aria-current={pathname === link.href ? 'page' : undefined}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        )}
      </div>
    </header>
  )
}

'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Icon } from './Icon'

export default function SiteHeader({
  role,
  connected,
  children,
  inert = false,
}: {
  role: 'player' | 'presenter'
  connected: boolean
  children?: ReactNode
  inert?: boolean
}) {
  const [fullscreen, setFullscreen] = useState(false),
    [message, setMessage] = useState('')
  const toggle = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else if (document.documentElement.requestFullscreen)
        await document.documentElement.requestFullscreen()
      else {
        setMessage('Le plein écran n’est pas disponible sur ce navigateur.')
        return
      }
      setMessage('')
    } catch {
      setMessage('Le navigateur a refusé le plein écran. Utilisez son menu ou le bouton.')
    }
  }, [])
  useEffect(() => {
    const changed = () => setFullscreen(Boolean(document.fullscreenElement))
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        void toggle()
      }
    }
    document.addEventListener('fullscreenchange', changed)
    window.addEventListener('keydown', shortcut)
    return () => {
      document.removeEventListener('fullscreenchange', changed)
      window.removeEventListener('keydown', shortcut)
    }
  }, [toggle])
  return (
    <>
      <header inert={inert} className={`site-header ${role === 'presenter' ? 'admin-header' : ''}`}>
        <Link
          href={role === 'presenter' ? '/presentateur' : '/jouer'}
          className="brand"
          aria-label="ALGOMANIA — Scientific Club"
        >
          {/* Image fournie par le club, recadrée sans redessiner sa marque. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/branding/algomania-logo.webp"
            alt="ALGOMANIA Scientific Club"
            width="1026"
            height="272"
            fetchPriority="high"
          />
        </Link>
        {role === 'presenter' && <span className="header-context">Pupitre du stand</span>}
        <div className="header-actions">
          {children}
          <span className={`connection ${connected ? 'online' : ''}`} role="status">
            <i aria-hidden="true" />
            {connected ? 'En direct' : 'Connexion…'}
          </span>
          {role === 'presenter' && (
            <Link
              className="mode-link"
              href="/jouer"
              target="_blank"
              rel="noreferrer"
              aria-label="Écran visiteur"
              title="Écran visiteur"
            >
              <span>Écran visiteur</span>
              <Icon name="arrow" />
            </Link>
          )}
          <button
            className="button button-quiet fullscreen-button"
            onClick={() => void toggle()}
            aria-label={fullscreen ? 'Quitter le plein écran' : 'Plein écran (Ctrl+F)'}
            title="Ctrl+F"
          >
            <Icon name={fullscreen ? 'shrink' : 'expand'} />
            <span>{fullscreen ? 'Réduire' : 'Plein écran'}</span>
          </button>
        </div>
      </header>
      {message && (
        <div className="fullscreen-message" role="status">
          {message}
          <button
            className="icon-button"
            aria-label="Fermer le message"
            onClick={() => setMessage('')}
          >
            <Icon name="close" />
          </button>
        </div>
      )}
    </>
  )
}

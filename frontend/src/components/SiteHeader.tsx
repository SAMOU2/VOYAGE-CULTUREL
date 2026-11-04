'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { Icon } from './Icon'

export default function SiteHeader({
  role,
  connected,
}: {
  role: 'player' | 'presenter'
  connected: boolean
}) {
  const [fullscreen, setFullscreen] = useState(false)
  const [message, setMessage] = useState('')
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
      setMessage('Le navigateur a refusé le plein écran. Utilisez le bouton ou son menu.')
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
      <header className="site-header">
        <Link className="brand" href="/jouer" aria-label="Voyage Culturel — jouer">
          <span className="brand-icon">
            <Icon name="globe" width="29" height="29" />
          </span>
          <span>
            VOYAGE
            <span>
              CULTUREL<span className="brand-dot">.</span>
            </span>
          </span>
        </Link>
        <div className="event-label">
          <span className="event-star">✳</span>
          <span>
            INTERNATIONAL
            <br />
            <strong>STUDENTS DAY</strong>
          </span>
        </div>
        <div className="header-actions">
          <span
            className={`connection ${connected ? 'online' : ''}`}
            title={connected ? 'Connecté au stand' : 'Connexion au stand…'}
          >
            <i />
            {connected ? 'Stand en direct' : 'Connexion…'}
          </span>
          <button
            className="button button-quiet fullscreen-button"
            onClick={() => void toggle()}
            aria-label={fullscreen ? 'Quitter le plein écran' : 'Plein écran (Ctrl+F)'}
            title="Ctrl+F"
          >
            <Icon name={fullscreen ? 'shrink' : 'expand'} />
            <span>{fullscreen ? 'Réduire' : 'Plein écran'}</span>
            <kbd>Ctrl F</kbd>
          </button>
          <Link href={role === 'player' ? '/presentateur' : '/jouer'} className="mode-link">
            {role === 'player' ? 'Présentateur' : 'Écran joueur'}
            <Icon name="arrow" width="16" height="16" />
          </Link>
        </div>
      </header>
      {message && (
        <div className="fullscreen-message" role="status">
          {message}
          <button aria-label="Fermer le message" onClick={() => setMessage('')}>
            <Icon name="close" />
          </button>
        </div>
      )}
    </>
  )
}

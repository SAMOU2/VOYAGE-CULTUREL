'use client'

import { useEffect, useRef } from 'react'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { Icon } from './Icon'

export function WelcomeScreen({
  connected,
  error,
  onPlay,
  onBack,
}: {
  connected: boolean
  error: string
  onPlay: () => void
  onBack: () => void
}) {
  const panel = useRef<HTMLElement>(null),
    play = useRef<HTMLButtonElement>(null)
  useFocusTrap(panel, onBack)
  useEffect(() => {
    if (connected) play.current?.focus({ preventScroll: true })
  }, [connected])
  return (
    <div className="kiosk-overlay welcome-overlay">
      <section
        ref={panel}
        className="welcome-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
      >
        <span className="welcome-icon">
          <Icon name="globe" width="36" height="36" />
        </span>
        <h1 id="welcome-title">Prêt à jouer ?</h1>
        <p>
          Tournez le globe, choisissez le bon pays et cumulez des points au fil des quatre niveaux.
        </p>
        <button
          ref={play}
          className="button button-primary play-button"
          disabled={!connected}
          onClick={onPlay}
        >
          Jouer
          <Icon name="play" />
        </button>
        <span className="welcome-note">Clavier tactile · Aucun compte nécessaire</span>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
      </section>
    </div>
  )
}

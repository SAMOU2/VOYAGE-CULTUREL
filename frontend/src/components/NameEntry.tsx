'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { Result, ReturningPlayer } from '@shared/types'
import { isValidName, NAME_MAX_LENGTH, normalizeName } from '@shared/game'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { TouchKeyboard } from './TouchKeyboard'
import { Icon } from './Icon'

export function NameEntry({
  begin,
  pending,
  error,
  onBack,
}: {
  begin: (name: string, confirm?: boolean) => Promise<Result>
  pending: boolean
  error: string
  onBack: () => void
}) {
  const [name, setName] = useState(''),
    [returning, setReturning] = useState<ReturningPlayer | null>(null)
  const input = useRef<HTMLInputElement>(null),
    panel = useRef<HTMLDivElement>(null),
    replay = useRef<HTMLButtonElement>(null)
  useFocusTrap(panel, onBack)
  useEffect(() => {
    if (returning) replay.current?.focus()
    else input.current?.focus({ preventScroll: true })
  }, [returning])
  const insert = (text: string) => {
    const element = input.current,
      start = element?.selectionStart ?? name.length,
      end = element?.selectionEnd ?? name.length
    const next = [...(name.slice(0, start) + text + name.slice(end))]
      .slice(0, NAME_MAX_LENGTH)
      .join('')
    setName(next)
    requestAnimationFrame(() => {
      element?.focus({ preventScroll: true })
      element?.setSelectionRange(
        Math.min(next.length, start + text.length),
        Math.min(next.length, start + text.length),
      )
    })
  }
  const backspace = () => {
    const element = input.current,
      start = element?.selectionStart ?? name.length,
      end = element?.selectionEnd ?? name.length
    const prefix = [...name.slice(0, start)]
    if (start === end) prefix.pop()
    const before = prefix.join(''),
      next = before + name.slice(end)
    setName(next)
    requestAnimationFrame(() => {
      element?.focus({ preventScroll: true })
      element?.setSelectionRange(before.length, before.length)
    })
  }
  const submit = async (event?: FormEvent) => {
    event?.preventDefault()
    if (pending || !isValidName(normalizeName(name))) return
    const result = await begin(normalizeName(name))
    if (result.ok && result.returning) setReturning(result.returning)
  }
  return (
    <div className="kiosk-overlay name-overlay">
      <div
        className="name-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="name-title"
        ref={panel}
      >
        <div className="sheet-heading">
          <button className="button button-quiet" onClick={onBack} disabled={pending}>
            <Icon name="back" />
            Retour
          </button>
          <span>Nom et prénom · Sans compte</span>
          <Icon name="globe" width="28" height="28" />
        </div>
        {returning ? (
          <div className="returning-player">
            <span className="section-kicker">Heureux de vous revoir</span>
            <h1 id="name-title" dir="auto">
              {returning.fullName}
            </h1>
            <p>
              Ce nom a déjà joué {returning.attempts} fois. Une nouvelle tentative repart de zéro ;
              seul votre meilleur score reste au classement.
            </p>
            <div className="returning-best">
              <Icon name="trophy" />
              <span>Meilleur score</span>
              <strong>
                {returning.bestScore}
                <small> pts</small>
              </strong>
            </div>
            <div className="returning-actions">
              <button
                ref={replay}
                className="button button-primary"
                disabled={pending}
                onClick={() => void begin(name, true)}
              >
                {pending ? 'Préparation…' : 'Rejouer avec ce nom'}
                <Icon name="arrow" />
              </button>
              <button
                className="button button-secondary"
                disabled={pending}
                onClick={() => {
                  setReturning(null)
                  setName('')
                }}
              >
                Écrire un autre nom
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={(event) => void submit(event)}>
            <div className="name-heading">
              <div>
                <span className="section-kicker">À vous de jouer</span>
                <h1 id="name-title">Comment vous appelez-vous ?</h1>
              </div>
            </div>
            <label htmlFor="full-name">Nom et prénom</label>
            <div className="name-input-row">
              <span className="name-input-icon">
                <Icon name="user" width="25" height="25" />
              </span>
              <input
                ref={input}
                id="full-name"
                name="fullName"
                type="text"
                required
                inputMode="none"
                autoComplete="name"
                autoCapitalize="words"
                dir="auto"
                value={name}
                onChange={(e) => setName([...e.target.value].slice(0, NAME_MAX_LENGTH).join(''))}
                maxLength={128}
                placeholder="Votre nom et prénom, dans un seul champ"
                aria-describedby="name-help"
                disabled={pending}
              />
              <span className="character-count">
                {[...name].length}/{NAME_MAX_LENGTH}
              </span>
            </div>
            <p id="name-help" className="form-help">
              Le clavier tactile ou un clavier physique fonctionnent. Aucun compte ni mot de passe.
            </p>
            <TouchKeyboard
              disabled={pending}
              insert={insert}
              backspace={backspace}
              clear={() => {
                setName('')
                input.current?.focus()
              }}
            />
            <div className="name-submit">
              <p>Votre nom apparaîtra au classement du stand.</p>
              <button
                className="button button-primary"
                type="submit"
                disabled={pending || !isValidName(normalizeName(name))}
              >
                {pending ? 'Préparation…' : 'Commencer la partie'}
                <Icon name="arrow" />
              </button>
            </div>
          </form>
        )}
        {error && (
          <p className="inline-error" role="alert">
            <Icon name="info" />
            {error}
          </p>
        )}
      </div>
    </div>
  )
}

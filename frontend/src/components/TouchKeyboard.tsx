'use client'

import { useState } from 'react'
import { Icon } from './Icon'

export function TouchKeyboard({
  insert,
  backspace,
  clear,
  disabled = false,
}: {
  disabled?: boolean
  insert: (text: string) => void
  backspace: () => void
  clear: () => void
}) {
  const [arabic, setArabic] = useState(false),
    [upper, setUpper] = useState(true),
    [accents, setAccents] = useState(false)
  const rows = arabic
    ? ['ضصثقفغعهخح', 'جشسيبلاتنم', 'كطدذظزورةى', 'أإآؤئء']
    : accents
      ? ['ÉÈÊËÀÂÇ', 'ÎÏÔŒ', 'ÙÛÜŸ']
      : ['AZERTYUIOP', 'QSDFGHJKLM', 'WXCVBNÉÀÇ']
  return (
    <div
      className="touch-keyboard"
      role="group"
      aria-label="Clavier tactile"
      lang={arabic ? 'ar' : 'fr'}
      dir={arabic ? 'rtl' : 'ltr'}
    >
      {rows.map((row, i) => (
        <div className="keyboard-row" key={i}>
          {[...row].map((char) => (
            <button
              disabled={disabled}
              key={char}
              type="button"
              className="keyboard-key"
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => {
                insert(arabic ? char : upper ? char : char.toLocaleLowerCase('fr'))
                if (!arabic) {
                  setUpper(false)
                  setAccents(false)
                }
              }}
              aria-label={char}
            >
              {arabic ? char : upper ? char : char.toLocaleLowerCase('fr')}
            </button>
          ))}
        </div>
      ))}
      <div className="keyboard-row keyboard-functions">
        <button
          disabled={disabled}
          type="button"
          className="keyboard-key keyboard-language"
          onClick={() => setArabic(!arabic)}
          aria-label={arabic ? 'Clavier français' : 'Clavier arabe'}
        >
          {arabic ? 'FR' : 'العربية'}
        </button>
        {!arabic && (
          <button
            disabled={disabled}
            type="button"
            className="keyboard-key"
            aria-label="Majuscules"
            aria-pressed={upper}
            onClick={() => setUpper(!upper)}
          >
            ⇧
          </button>
        )}
        {!arabic && (
          <button
            disabled={disabled}
            type="button"
            className="keyboard-key keyboard-language"
            aria-label={accents ? 'Clavier alphabétique' : 'Clavier avec accents'}
            aria-pressed={accents}
            onClick={() => setAccents(!accents)}
          >
            {accents ? 'ABC' : 'ÀÉ'}
          </button>
        )}
        <button
          disabled={disabled}
          type="button"
          className="keyboard-key"
          aria-label="Apostrophe"
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => insert('’')}
        >
          ’
        </button>
        <button
          disabled={disabled}
          type="button"
          className="keyboard-key keyboard-space"
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => {
            insert(' ')
            setUpper(true)
          }}
        >
          Espace
        </button>
        <button
          disabled={disabled}
          type="button"
          className="keyboard-key"
          aria-label="Trait d’union"
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => insert('-')}
        >
          -
        </button>
        <button
          disabled={disabled}
          type="button"
          className="keyboard-key"
          aria-label="Effacer le dernier caractère"
          onPointerDown={(e) => e.preventDefault()}
          onClick={backspace}
        >
          <Icon name="backspace" />
        </button>
        <button
          disabled={disabled}
          type="button"
          className="keyboard-key keyboard-clear"
          onPointerDown={(e) => e.preventDefault()}
          onClick={clear}
        >
          Tout effacer
        </button>
      </div>
    </div>
  )
}

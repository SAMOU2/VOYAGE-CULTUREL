'use client'

import { useEffect, useState } from 'react'
import type { Catalog, GameSettings, Result } from '@shared/types'
import { DEFAULT_SETTINGS } from '@shared/game'
import { Icon } from './Icon'

export function SettingsPanel({
  settings,
  catalog,
  pending,
  save,
}: {
  settings: GameSettings
  catalog: Catalog
  pending: boolean
  save: (settings: GameSettings) => Promise<Result>
}) {
  const [draft, setDraft] = useState(settings),
    [search, setSearch] = useState(''),
    [message, setMessage] = useState('')
  useEffect(() => {
    setDraft(settings)
  }, [settings])
  const selected = new Set(draft.clubCountryIds),
    dirty = JSON.stringify(draft) !== JSON.stringify(settings)
  const filtered = catalog.countries.filter((c) =>
    c.name
      .toLocaleLowerCase('fr')
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .includes(search.toLocaleLowerCase('fr').normalize('NFD').replace(/\p{M}/gu, '')),
  )
  const edit = (next: GameSettings | ((previous: GameSettings) => GameSettings)) => {
    setMessage('')
    setDraft(next)
  }
  const toggle = (id: string) =>
    edit((previous) => ({
      ...previous,
      clubCountryIds: previous.clubCountryIds.includes(id)
        ? previous.clubCountryIds.filter((x) => x !== id)
        : [...previous.clubCountryIds, id],
    }))
  return (
    <section className="settings-panel panel" aria-label="Réglages du stand">
      <div className="section-heading">
        <Icon name="settings" />
        <h2>La prochaine partie</h2>
      </div>
      <p className="form-help">
        Les changements s’appliquent au prochain joueur, jamais au milieu de sa tentative.
      </p>
      <fieldset className="mode-choice">
        <legend>Terrain de jeu</legend>
        {(['club33', 'world'] as const).map((mode) => (
          <label key={mode} className={draft.mode === mode ? 'selected' : ''}>
            <input
              type="radio"
              name="game-mode"
              value={mode}
              checked={draft.mode === mode}
              onChange={() => edit({ ...draft, mode })}
            />
            <Icon name="globe" />
            <span>
              <strong>{mode === 'club33' ? 'Sélection du club' : 'Monde entier'}</strong>
              <small>
                {mode === 'club33'
                  ? '33 pays choisis pour le stand'
                  : `${catalog.countries.length} pays et territoires`}
              </small>
            </span>
            <Icon name="check" />
          </label>
        ))}
      </fieldset>
      <div className="settings-inline">
        <div className="settings-length">
          <label htmlFor="questions-per-stage">Questions par niveau</label>
          <select
            id="questions-per-stage"
            value={draft.questionsPerStage}
            onChange={(e) => edit({ ...draft, questionsPerStage: Number(e.target.value) })}
          >
            {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <option key={n} value={n}>
                {n} questions · {n * 4} au total
              </option>
            ))}
          </select>
        </div>
        <label className="retry-choice">
          <input
            type="checkbox"
            checked={draft.allowRetry}
            onChange={(e) => edit({ ...draft, allowRetry: e.target.checked })}
          />
          <span>
            Autoriser une seconde chance<small>Moitié des points à la deuxième réponse.</small>
          </span>
        </label>
      </div>
      <details className="country-settings">
        <summary>
          Personnaliser les 33 pays
          <span className={selected.size === 33 ? 'count-valid' : ''}>{selected.size} / 33</span>
        </summary>
        <p className="form-help">
          Décochez un pays puis choisissez son remplaçant. La sauvegarde exige exactement 33 pays
          distincts.
        </p>
        <div className="country-search">
          <label htmlFor="country-search">Rechercher un pays</label>
          <input
            id="country-search"
            type="search"
            placeholder="Ex. Algérie"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="country-checkboxes">
          {filtered.map((country) => (
            <label key={country.id}>
              <input
                type="checkbox"
                checked={selected.has(country.id)}
                onChange={() => toggle(country.id)}
                disabled={!selected.has(country.id) && selected.size >= 33}
              />
              <span>
                {country.name}
                <small>{country.region}</small>
              </span>
            </label>
          ))}
        </div>
        <button
          className="button button-quiet"
          type="button"
          onClick={() => {
            edit({ ...draft, clubCountryIds: [...DEFAULT_SETTINGS.clubCountryIds] })
            setSearch('')
          }}
        >
          Restaurer la sélection proposée
        </button>
      </details>
      <div className="settings-save">
        <span role="status">
          {message || (dirty ? 'Modifications non enregistrées' : 'Réglages enregistrés')}
        </span>
        <button
          className="button button-primary"
          disabled={pending || !dirty || selected.size !== 33}
          onClick={async () => {
            const result = await save(draft)
            setMessage(result.ok ? 'Enregistré pour la prochaine partie.' : result.error)
          }}
        >
          {pending ? 'Enregistrement…' : 'Enregistrer'}
          <Icon name="check" />
        </button>
      </div>
    </section>
  )
}

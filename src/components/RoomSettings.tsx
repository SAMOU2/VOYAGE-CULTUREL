import { DIFFICULTIES, QUESTION_COUNTS, THEMES } from '@/lib/catalog'

export interface RoomConfig {
  theme: string
  difficulty: string
  count: number
  allowRetry: boolean
}

interface RoomSettingsProps {
  config: RoomConfig
  onChange: (patch: Partial<RoomConfig>) => void
  disabled?: boolean
}

export default function RoomSettings({ config, onChange, disabled = false }: RoomSettingsProps) {
  return (
    <fieldset className="settings-fields" disabled={disabled}>
      <legend className="sr-only">Réglages de la partie</legend>
      <div className="field">
        <label htmlFor="theme">Thème</label>
        <select id="theme" value={config.theme} onChange={(event) => onChange({ theme: event.target.value })}>
          {THEMES.map((theme) => (
            <option value={theme.id} key={theme.id}>
              {theme.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="difficulty">Difficulté</label>
          <select
            id="difficulty"
            value={config.difficulty}
            onChange={(event) => onChange({ difficulty: event.target.value })}
          >
            {DIFFICULTIES.map((difficulty) => (
              <option value={difficulty.value ?? difficulty.id} key={difficulty.id}>
                {difficulty.id === 'mixte' ? 'Progressive' : difficulty.short}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="count">Questions</label>
          <select
            id="count"
            value={config.count}
            onChange={(event) => onChange({ count: Number(event.target.value) })}
          >
            {QUESTION_COUNTS.map((count) => (
              <option value={count} key={count}>
                {count} questions
              </option>
            ))}
          </select>
        </div>
      </div>
      <details className="disclosure settings-options">
        <summary>Options</summary>
        <div className="disclosure-content">
          <label className="checkbox-label" htmlFor="retry">
            <input
              id="retry"
              type="checkbox"
              checked={config.allowRetry}
              onChange={(event) => onChange({ allowRetry: event.target.checked })}
            />
            Seconde chance à demi-points
          </label>
        </div>
      </details>
    </fieldset>
  )
}

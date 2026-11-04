/** Catalogue statique (miroir de data/questions.json) pour les formulaires. */
export const THEMES = [
  { id: 'tous', label: 'Tous les thèmes', emoji: '🌍' },
  { id: 'capitales', label: 'Capitales', emoji: '🏛️' },
  { id: 'monuments', label: 'Monuments & patrimoine', emoji: '🗿' },
  { id: 'langues', label: 'Langues & peuples', emoji: '💬' },
  { id: 'nature', label: 'Fleuves, montagnes & nature', emoji: '🏔️' },
  { id: 'traditions', label: 'Traditions & fêtes', emoji: '🎭' },
  { id: 'histoire', label: 'Histoire & civilisations', emoji: '📜' },
]

export const DIFFICULTIES = [
  { id: 'mixte', label: 'Progressive (facile → expert)', short: 'Mixte' },
  { id: 'facile', value: 1, label: 'Facile — repères connus', short: 'Facile' },
  { id: 'moyen', value: 2, label: 'Moyen — culture générale', short: 'Moyen' },
  { id: 'difficile', value: 3, label: 'Difficile — connaissances précises', short: 'Difficile' },
  { id: 'expert', value: 4, label: 'Expert — repères moins connus', short: 'Expert' },
]

export const QUESTION_COUNTS = [5, 8, 10, 12, 15]

export const THEME_LABEL: Record<string, string> = Object.fromEntries(THEMES.map((t) => [t.id, t.label]))
export const THEME_EMOJI: Record<string, string> = Object.fromEntries(THEMES.map((t) => [t.id, t.emoji]))

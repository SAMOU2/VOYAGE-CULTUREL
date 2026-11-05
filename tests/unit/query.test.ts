import test from 'node:test'
import assert from 'node:assert/strict'
import { createQueryClient, newestState } from '../../frontend/src/lib/queryClient.js'
import { CURRENT_QUESTION_KEY } from '../../shared/game.js'

test('React Query : un snapshot HTTP ancien ne remplace pas un événement récent', () => {
  const client = createQueryClient(),
    key = [CURRENT_QUESTION_KEY, 'player']
  client.setQueryData(key, { revision: 20, phase: 'feedback', game: { score: 10 } })
  const latest = client.getQueryData(key)
  client.setQueryData(key, { revision: 19, phase: 'question', game: { score: 0 } })
  assert.equal(client.getQueryData(key), latest)
  client.setQueryData(key, { revision: 21, phase: 'question', game: { score: 10 } })
  assert.deepEqual(client.getQueryData(key), {
    revision: 21,
    phase: 'question',
    game: { score: 10 },
  })
  client.clear()
})
test('React Query : partage structurel des tableaux inchangés, pas de recréation du globe', () => {
  const previous = {
    revision: 1,
    game: { scopeCountryIds: ['012', '250'] },
    leaderboard: [{ score: 10 }],
  }
  const next = newestState(previous, {
    revision: 2,
    game: { scopeCountryIds: ['012', '250'] },
    leaderboard: [{ score: 10 }],
  }) as typeof previous
  assert.equal(next.game, previous.game)
  assert.equal(next.leaderboard, previous.leaderboard)
})
test('caches joueur et pupitre séparés ; retrait privé sans toucher l’état public', () => {
  const client = createQueryClient()
  client.setQueryData([CURRENT_QUESTION_KEY, 'player'], { revision: 1, role: 'player' })
  client.setQueryData([CURRENT_QUESTION_KEY, 'presenter'], {
    revision: 1,
    role: 'presenter',
    answer: 'privé',
  })
  client.setQueryData(['attempt-history', 'presenter', 'u1'], [{ fullName: 'Démonstration' }])
  client.removeQueries({ queryKey: [CURRENT_QUESTION_KEY, 'presenter'] })
  client.removeQueries({ queryKey: ['attempt-history', 'presenter'] })
  assert.deepEqual(client.getQueryData([CURRENT_QUESTION_KEY, 'player']), {
    revision: 1,
    role: 'player',
  })
  assert.equal(client.getQueryData([CURRENT_QUESTION_KEY, 'presenter']), undefined)
  assert.equal(client.getQueryData(['attempt-history', 'presenter', 'u1']), undefined)
  client.clear()
})

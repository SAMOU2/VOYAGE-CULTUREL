import { QueryClient, replaceEqualDeep } from '@tanstack/react-query'

/** Une réponse HTTP ancienne ne doit pas écraser un événement Socket.IO plus récent. */
export function newestState(old: unknown, next: unknown): unknown {
  if (
    old &&
    next &&
    typeof old === 'object' &&
    typeof next === 'object' &&
    'revision' in old &&
    'revision' in next &&
    typeof old.revision === 'number' &&
    typeof next.revision === 'number' &&
    old.revision > next.revision
  )
    return old
  return replaceEqualDeep(old, next)
}
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        retry: 1,
        refetchOnWindowFocus: false,
        structuralSharing: newestState,
      },
      mutations: { retry: false },
    },
  })
}

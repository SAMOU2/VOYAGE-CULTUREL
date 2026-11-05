import type { Result } from '@shared/types'

export async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal, cache: 'no-store' })
  if (!response.ok) throw new Error('Le stand ne répond pas. Vérifiez la connexion.')
  return response.json() as Promise<T>
}
export function withAck<T extends object>(
  send: (done: (error: Error | null, result: Result<T>) => void) => void,
): Promise<Result<T>> {
  return new Promise((resolve) =>
    send((error, result) =>
      resolve(
        error || !result ? { ok: false, error: 'Le stand ne répond pas. Réessayez.' } : result,
      ),
    ),
  )
}

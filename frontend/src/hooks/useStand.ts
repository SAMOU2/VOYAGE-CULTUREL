'use client'

import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  ActionData,
  AdminLeaderboardEntry,
  AttemptSummary,
  BeginPayload,
  Catalog,
  Command,
  Coordinates,
  CountryFact,
  LeaderboardEntry,
  PlayerState,
  Result,
  Role,
  StandState,
  TurnPayload,
} from '@shared/types'
import { CURRENT_QUESTION_KEY } from '@shared/game'
import { getJson, withAck } from '@/lib/api'
import { useStandConnection } from './useStandConnection'

type Action =
  | { kind: 'begin'; payload: BeginPayload }
  | { kind: 'submit'; payload: TurnPayload & { pin: Coordinates } }
  | { kind: 'next'; payload: TurnPayload }
  | { kind: 'leave'; payload: { attemptId: string } }
  | { kind: 'command'; payload: Command }
export function useStand(role: Role) {
  const connection = useStandConnection(role),
    client = useQueryClient()
  const [error, setError] = useState(''),
    [notice, setNotice] = useState('')
  const busy = useRef(false)
  const query = useQuery<StandState>({
    queryKey: [CURRENT_QUESTION_KEY, role],
    enabled: role === 'player' || (connection.connected && connection.controlled),
    staleTime: Infinity,
    queryFn: async ({ signal }) => {
      if (role === 'player') return getJson<PlayerState>('/api/current-question', signal)
      const socket = connection.socketRef.current
      if (!socket?.connected) throw new Error('Le pupitre est hors connexion.')
      const result = await withAck<{ state: StandState }>((done) =>
        socket.timeout(8_000).emit('stand:current-question', {}, done),
      )
      if (!result.ok) throw new Error(result.error)
      if (result.state.role !== role) throw new Error('Le pupitre actif a changé.')
      return result.state
    },
  })
  const state = query.data
  useEffect(() => {
    setError('')
    setNotice('')
  }, [state?.game?.id, state?.question?.turn, state?.phase])
  const mutation = useMutation({
    mutationFn: async (action: Action): Promise<Result> => {
      const socket = connection.socketRef.current
      if (!socket?.connected || !connection.connected || !connection.controlled)
        throw new Error('Le stand est hors connexion.')
      const result = await withAck<ActionData>((done) => {
        switch (action.kind) {
          case 'begin':
            socket.timeout(8_000).emit('player:begin', action.payload, done)
            break
          case 'submit':
            socket.timeout(8_000).emit('player:submit', action.payload, done)
            break
          case 'next':
            socket.timeout(8_000).emit('player:next', action.payload, done)
            break
          case 'leave':
            socket.timeout(8_000).emit('player:leave', action.payload, done)
            break
          case 'command':
            socket.timeout(8_000).emit('presenter:command', action.payload, done)
            break
        }
      })
      if (!result.ok) throw new Error(result.error)
      return result
    },
    onSuccess: async (result) => {
      if (result.ok && !result.returning)
        await client.invalidateQueries({ queryKey: [CURRENT_QUESTION_KEY, role] })
    },
  })
  const run = async (action: Action): Promise<Result> => {
    if (busy.current) return { ok: false, error: 'Une demande est déjà en cours.' }
    busy.current = true
    setError('')
    setNotice('')
    try {
      const result = await mutation.mutateAsync(action)
      if (result.ok && result.retry) setNotice('Une seconde chance : choisissez un autre pays.')
      return result
    } catch (failure) {
      const message = (failure as Error).message
      setError(message)
      return { ok: false, error: message }
    } finally {
      busy.current = false
    }
  }
  const leaderboard = useQuery<LeaderboardEntry[] | AdminLeaderboardEntry[]>({
    queryKey: ['leaderboard', role],
    staleTime: Infinity,
    enabled: role === 'player' || (connection.connected && connection.controlled),
    queryFn: async ({ signal }) => {
      if (role === 'player') return getJson<LeaderboardEntry[]>('/api/leaderboard', signal)
      const socket = connection.socketRef.current
      if (!socket?.connected) throw new Error('Pupitre hors connexion.')
      const result = await withAck<{ state: StandState }>((done) =>
        socket.timeout(8_000).emit('stand:current-question', {}, done),
      )
      if (!result.ok || result.state.role !== 'presenter')
        throw new Error('Accès au classement détaillé refusé.')
      return result.state.adminLeaderboard
    },
  })
  const history = async (userId: string): Promise<AttemptSummary[]> => {
    const socket = connection.socketRef.current
    if (!socket?.connected || !connection.controlled) throw new Error('Pupitre hors connexion.')
    const result = await withAck<{ attempts: AttemptSummary[] }>((done) =>
      socket.timeout(8_000).emit('presenter:history', { userId }, done),
    )
    if (!result.ok) throw new Error(result.error)
    return result.attempts
  }
  return {
    state,
    leaderboard: leaderboard.data ?? state?.leaderboard ?? [],
    connected: connection.connected,
    controlled: connection.controlled,
    pending: mutation.isPending,
    error: error || connection.error || (!state ? (query.error?.message ?? '') : ''),
    notice,
    setError,
    history,
    reconnect: connection.reconnect,
    begin: (fullName: string, confirmExisting = false) =>
      run({ kind: 'begin', payload: { fullName, confirmExisting } }),
    submit: (payload: TurnPayload & { pin: Coordinates }) => run({ kind: 'submit', payload }),
    next: (payload: TurnPayload) => run({ kind: 'next', payload }),
    leave: (attemptId: string) => run({ kind: 'leave', payload: { attemptId } }),
    command: (payload: Command) => run({ kind: 'command', payload }),
  }
}
export const useCatalog = () =>
  useQuery({
    queryKey: ['catalog'],
    queryFn: ({ signal }) => getJson<Catalog>('/api/catalog', signal),
    staleTime: Infinity,
  })
export const useCountryFacts = () =>
  useQuery({
    queryKey: ['country-facts'],
    queryFn: ({ signal }) => getJson<CountryFact[]>('/api/facts', signal),
    staleTime: Infinity,
  })
export type StandHook = ReturnType<typeof useStand>

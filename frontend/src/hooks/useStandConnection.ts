'use client'

import { useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import { useQueryClient } from '@tanstack/react-query'
import type { ClientEvents, Role, ServerEvents, StandState } from '@shared/types'
import { CURRENT_QUESTION_KEY } from '@shared/game'

export type StandSocket = Socket<ServerEvents, ClientEvents>
const tokenKey = 'algomania-presenter'
export function useStandConnection(role: Role) {
  const client = useQueryClient(),
    socketRef = useRef<StandSocket | null>(null)
  const [connected, setConnected] = useState(false),
    [controlled, setControlled] = useState(role === 'player'),
    [error, setError] = useState('')
  useEffect(() => {
    let active = true
    const socket: StandSocket = io({
      autoConnect: false,
      addTrailingSlash: false,
      // WebSocket direct évite de suspendre les commandes pendant une montée
      // polling → WebSocket derrière le proxy ; HTTP reste un vrai secours.
      transports: ['websocket', 'polling'],
      tryAllTransports: true,
    })
    socketRef.current = socket
    const apply = (next: StandState) => {
      if (!active || next.role !== role) return
      client.setQueryData([CURRENT_QUESTION_KEY, role], next)
      client.setQueryData(
        ['leaderboard', role],
        next.role === 'presenter' ? next.adminLeaderboard : next.leaderboard,
      )
      if (role === 'presenter')
        void client.invalidateQueries({ queryKey: ['attempt-history', 'presenter'] })
    }
    socket.on('stand:state', apply)
    socket.on('connect', () => {
      if (!active) return
      setError('')
      if (role === 'presenter') {
        let token: string | undefined
        try {
          token = sessionStorage.getItem(tokenKey) || undefined
        } catch {
          /* navigation privée */
        }
        socket.timeout(8_000).emit('presenter:claim', { token }, (failure, result) => {
          if (!active) return
          if (failure || !result?.ok) {
            setControlled(false)
            setError(
              failure
                ? 'Le pupitre ne répond pas.'
                : !result.ok
                  ? result.error
                  : 'Connexion impossible.',
            )
            return
          }
          try {
            sessionStorage.setItem(tokenKey, result.token)
          } catch {
            /* facultatif */
          }
          setControlled(true)
          setConnected(true)
        })
      } else
        socket.timeout(8_000).emit('stand:watch', {}, (failure, result) => {
          if (!active) return
          if (failure || !result?.ok) setError('Connexion au stand impossible. Réessayez.')
          else setConnected(true)
        })
    })
    socket.on('presenter:replaced', () => {
      if (!active) return
      setControlled(false)
      setConnected(false)
      setError('Le pupitre a été repris dans un autre onglet.')
      client.removeQueries({ queryKey: [CURRENT_QUESTION_KEY, 'presenter'] })
      client.removeQueries({ queryKey: ['leaderboard', 'presenter'] })
      client.removeQueries({ queryKey: ['attempt-history', 'presenter'] })
    })
    socket.on('disconnect', () => {
      if (active) {
        setConnected(false)
        if (role === 'presenter') setControlled(false)
      }
    })
    socket.on('connect_error', () => {
      if (active) {
        setConnected(false)
        setError('Connexion interrompue. Reconnexion automatique…')
      }
    })
    socket.connect()
    return () => {
      active = false
      socket.removeAllListeners()
      socket.disconnect()
      if (socketRef.current === socket) socketRef.current = null
      if (role === 'presenter') {
        client.removeQueries({ queryKey: [CURRENT_QUESTION_KEY, 'presenter'] })
        client.removeQueries({ queryKey: ['leaderboard', 'presenter'] })
        client.removeQueries({ queryKey: ['attempt-history', 'presenter'] })
      }
    }
  }, [client, role])
  return {
    socketRef,
    connected,
    controlled,
    error,
    reconnect: () => {
      const socket = socketRef.current
      if (socket) {
        socket.disconnect()
        socket.connect()
      }
    },
  }
}

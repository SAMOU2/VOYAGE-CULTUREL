'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import type {
  ClientEvents,
  Command,
  Coordinates,
  Result,
  ServerEvents,
  StandState,
} from '@shared/types'

type StandSocket = Socket<ServerEvents, ClientEvents>
const tokenKey = 'voyage-stand-presenter'

export function useStand(role: 'player' | 'presenter') {
  const socketRef = useRef<StandSocket | null>(null)
  const pendingRef = useRef(false)
  const turnRef = useRef(0)
  const [state, setState] = useState<StandState | null>(null)
  const [connected, setConnected] = useState(false)
  const [controlled, setControlled] = useState(role === 'player')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    // Aucun hôte localhost côté navigateur : le proxy Next transporte HTTP et WebSocket.
    const socket: StandSocket = io({
      autoConnect: false,
      addTrailingSlash: false,
      transports: ['polling', 'websocket'],
    })
    socketRef.current = socket
    socket.on('connect', () => {
      setError('')
      if (role === 'presenter') {
        let token: string | undefined
        try {
          token = sessionStorage.getItem(tokenKey) || undefined
        } catch {
          /* stockage privé désactivé */
        }
        socket
          .timeout(8_000)
          .emit('presenter:claim', { token }, (failure: Error | null, result: Result) => {
            if (failure || !result?.ok) {
              setControlled(false)
              setError(
                failure ? 'Le stand ne répond pas. Réessayez.' : !result.ok ? result.error : '',
              )
              return
            }
            if (result.token)
              try {
                sessionStorage.setItem(tokenKey, result.token)
              } catch {
                /* facultatif */
              }
            setControlled(true)
            setConnected(true)
          })
      } else {
        socket.timeout(8_000).emit('stand:watch', {}, (failure: Error | null, result: Result) => {
          if (failure || !result?.ok) setError('Connexion au stand impossible. Réessayez.')
          else setConnected(true)
        })
      }
    })
    socket.on('stand:state', (next) => {
      setState(next)
      if (role === 'player' && turnRef.current !== next.question.turn) {
        setError('')
        setNotice('')
      }
      turnRef.current = next.question.turn
    })
    socket.on('presenter:replaced', () => {
      setControlled(false)
      setError('Le pupitre a été repris dans un autre onglet.')
    })
    socket.on('disconnect', () => {
      setConnected(false)
      if (role === 'presenter') setControlled(false)
    })
    socket.on('connect_error', () => {
      setConnected(false)
      setError('Connexion au stand interrompue. Reconnexion automatique…')
    })
    socket.connect()
    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [role])

  const request = useCallback(
    async (
      kind: 'command' | 'submit',
      payload: Command | { turn: number; pin: Coordinates },
    ): Promise<boolean> => {
      const socket = socketRef.current
      if (!socket?.connected || !connected) {
        setError('Le stand est hors connexion.')
        return false
      }
      if (pendingRef.current) return false
      pendingRef.current = true
      setPending(true)
      setError('')
      setNotice('')
      return new Promise((resolve) => {
        const done = (failure: Error | null, result: Result) => {
          pendingRef.current = false
          setPending(false)
          if (failure || !result?.ok) {
            setError(
              failure
                ? 'Le stand ne répond pas. Réessayez.'
                : !result.ok
                  ? result.error
                  : 'Demande impossible.',
            )
            resolve(false)
          } else {
            if (result.retry)
              setNotice('Pas tout à fait… Vous avez une seconde chance ! Choisissez un autre pays.')
            resolve(true)
          }
        }
        if (kind === 'command')
          socket.timeout(8_000).emit('presenter:command', payload as Command, done)
        else
          socket
            .timeout(8_000)
            .emit('player:submit', payload as { turn: number; pin: Coordinates }, done)
      })
    },
    [connected],
  )
  return {
    state,
    connected,
    controlled,
    pending,
    error,
    notice,
    setError,
    command: (command: Command) => request('command', command),
    submit: (turn: number, pin: Coordinates) => request('submit', { turn, pin }),
    reconnect: () => {
      const socket = socketRef.current
      if (socket) {
        socket.disconnect()
        socket.connect()
      }
    },
  }
}

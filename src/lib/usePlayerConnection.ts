'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { emitAck, getSocket, playerSession } from './socket'
import type { AvailableRoom, PlayerState } from './types'

interface JoinResult {
  ok: boolean
  error?: string
  code: string
  playerId: string
  pseudo: string
}

/** Découverte sur le serveur courant : aucun compte ni code de salle à saisir. */
export function usePlayerConnection() {
  const router = useRouter()
  const [state, setState] = useState<PlayerState | null>(null)
  const [connected, setConnected] = useState(false)
  const [available, setAvailable] = useState<AvailableRoom[]>([])
  const [joining, setJoining] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [pseudo, setPseudo] = useState('Joueur')
  const [error, setError] = useState<string | null>(null)
  const active = useRef(false)
  const epoch = useRef(0)
  const restoring = useRef(false)
  const joiningRef = useRef(false)
  const stateRef = useRef<PlayerState | null>(null)
  const nameRef = useRef('Joueur')
  const lastAutoJoin = useRef<string | null>(null)

  const discover = useCallback(() => {
    if (active.current && getSocket().connected) getSocket().emit('lobby:subscribe', {})
  }, [])

  const joinRoom = useCallback(
    async (roomId?: string) => {
      if (
        !active.current ||
        !getSocket().connected ||
        restoring.current ||
        joiningRef.current ||
        stateRef.current
      )
        return
      const current = epoch.current
      joiningRef.current = true
      setJoining(true)
      setError(null)
      const response = await emitAck<JoinResult>('player:join', {
        ...(roomId ? { roomId } : {}),
        pseudo: nameRef.current.trim() || 'Joueur',
      })
      if (!active.current || current !== epoch.current) return
      joiningRef.current = false
      setJoining(false)
      if (!response?.ok) {
        setError(response?.error ?? 'Connexion impossible.')
        discover()
        return
      }
      playerSession.save({ code: response.code, playerId: response.playerId, pseudo: response.pseudo })
      playerSession.saveName(response.pseudo)
    },
    [discover],
  )

  useEffect(() => {
    active.current = true
    const saved = playerSession.read()
    const savedName = saved?.pseudo || playerSession.readName() || 'Joueur'
    nameRef.current = savedName
    setPseudo(savedName)
    const socket = getSocket()

    const onConnect = async () => {
      const current = ++epoch.current
      setConnected(true)
      restoring.current = true
      joiningRef.current = false
      setJoining(false)
      lastAutoJoin.current = null
      const session = playerSession.read()
      if (session) {
        const response = await emitAck('player:rejoin', { code: session.code, playerId: session.playerId })
        if (!active.current || current !== epoch.current) return
        if (response?.ok) {
          restoring.current = false
          return
        }
        playerSession.clear()
      }
      if (!active.current || current !== epoch.current) return
      stateRef.current = null
      setState(null)
      restoring.current = false
      discover()
    }
    const onDisconnect = () => {
      ++epoch.current
      restoring.current = true
      joiningRef.current = false
      setConnected(false)
      setJoining(false)
      setAvailable([])
    }
    const onState = (next: PlayerState) => {
      if (next.role !== 'player') return
      if (!stateRef.current) {
        nameRef.current = next.pseudo || nameRef.current
        setPseudo(nameRef.current)
        setError(null)
      }
      stateRef.current = next
      setState(next)
      setAvailable([])
    }
    const onAvailable = (rooms: AvailableRoom[]) => {
      if (stateRef.current || restoring.current) return
      setAvailable(rooms)
    }
    const onClosed = (payload: { roomId: string; message: string }) => {
      if (stateRef.current?.roomCode !== payload.roomId) return
      ++epoch.current
      playerSession.clear()
      stateRef.current = null
      setState(null)
      setAvailable([])
      joiningRef.current = false
      restoring.current = false
      lastAutoJoin.current = null
      setJoining(false)
      setError(payload.message)
      discover()
    }

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('state', onState)
    socket.on('lobby:update', onAvailable)
    socket.on('room:closed', onClosed)
    if (socket.connected) void onConnect()
    return () => {
      active.current = false
      ++epoch.current
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('state', onState)
      socket.off('lobby:update', onAvailable)
      socket.off('room:closed', onClosed)
      socket.emit('lobby:unsubscribe')
    }
  }, [discover])

  useEffect(() => {
    if (!connected || state || restoring.current) return
    if (available.length !== 1) {
      lastAutoJoin.current = null
      return
    }
    const only = available[0]
    if (lastAutoJoin.current === only.id) return
    lastAutoJoin.current = only.id
    void joinRoom()
  }, [available, connected, state, joinRoom])

  const updatePseudo = (value: string) => {
    nameRef.current = value.slice(0, 18)
    setPseudo(nameRef.current)
  }

  const savePseudo = async (event: React.FormEvent) => {
    event.preventDefault()
    if (renaming || !connected) return
    const clean = nameRef.current.trim() || 'Joueur'
    if (stateRef.current) {
      setRenaming(true)
      const response = await emitAck<{ ok: boolean; error?: string; pseudo: string }>('player:rename', {
        pseudo: clean,
      })
      if (!active.current) return
      setRenaming(false)
      if (!response.ok) return setError(response.error ?? 'Pseudo non enregistré.')
      const session = playerSession.read()
      if (session) playerSession.save({ ...session, pseudo: response.pseudo })
    }
    playerSession.saveName(clean)
    updatePseudo(clean)
    setError(null)
  }

  const retry = () => {
    lastAutoJoin.current = null
    setError(null)
    discover()
  }

  const leave = () => {
    active.current = false
    ++epoch.current
    getSocket().emit('player:leave', {})
    playerSession.clear()
    router.push('/')
  }

  return {
    state,
    connected,
    available,
    joining,
    renaming,
    pseudo,
    error,
    setError,
    updatePseudo,
    savePseudo,
    joinRoom,
    retry,
    leave,
  }
}

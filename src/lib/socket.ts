'use client'

import { io, type Socket } from 'socket.io-client'

let socket: Socket | null = null

export function getSocket(): Socket {
  if (!socket) {
    socket = io({
      autoConnect: true,
      // Le repli long-polling est indispensable derrière certains proxys Wi-Fi.
      transports: ['polling', 'websocket'],
      reconnectionDelay: 600,
      reconnectionDelayMax: 4000,
    })
  }
  return socket
}

export function emitAck<T = { ok: boolean; error?: string }>(event: string, payload?: unknown): Promise<T> {
  const s = getSocket()
  return new Promise((resolve) => {
    let settled = false
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        resolve({ ok: false, error: 'Le serveur ne répond pas. Vérifiez le réseau local.' } as T)
      }
    }, 8000)
    s.emit(event, payload, (res: T) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(res)
    })
  })
}

const HOST_KEY = 'voyage-culturel:host'
const PLAYER_KEY = 'voyage-culturel:player'

export interface HostSession {
  code: string
  hostToken: string
}
export interface PlayerSession {
  code: string
  playerId: string
  pseudo: string
}

function read<T>(key: string): T | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown | null) {
  if (typeof window === 'undefined') return
  try {
    if (value === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* stockage indisponible : on continue sans reprise de session */
  }
}

export const hostSession = {
  read: () => read<HostSession>(HOST_KEY),
  save: (s: HostSession) => write(HOST_KEY, s),
  clear: () => write(HOST_KEY, null),
}

export const playerSession = {
  read: () => read<PlayerSession>(PLAYER_KEY),
  save: (s: PlayerSession) => write(PLAYER_KEY, s),
  clear: () => write(PLAYER_KEY, null),
}

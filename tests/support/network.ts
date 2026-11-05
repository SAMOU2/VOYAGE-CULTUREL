import { io, type Socket } from 'socket.io-client'
import type {
  Ack,
  ActionData,
  ClientEvents,
  Command,
  Result,
  ServerEvents,
  StandState,
} from '../../shared/types.js'
export type Client = Socket<ServerEvents, ClientEvents>
export function response<T extends object = ActionData>(
  send: (ack: Ack<T>) => void,
): Promise<Result<T>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Ack Socket.IO absent')), 5_000)
    send((result) => {
      clearTimeout(timer)
      resolve(result)
    })
  })
}
export async function connect(url: string): Promise<Client> {
  const socket: Client = io(url, {
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
    addTrailingSlash: false,
    autoConnect: false,
  })
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve())
    socket.once('connect_error', reject)
    socket.connect()
  })
  return socket
}
export const watch = (socket: Client) => response((ack) => socket.emit('stand:watch', {}, ack))
export const claim = (socket: Client, token?: string) =>
  response<{ token: string }>((ack) => socket.emit('presenter:claim', { token }, ack))
export const command = (socket: Client, payload: Command) =>
  response((ack) => socket.emit('presenter:command', payload, ack))
export const snapshot = (socket: Client) =>
  response<{ state: StandState }>((ack) => socket.emit('stand:current-question', {}, ack))
export function nextState(
  socket: Client,
  predicate: (state: StandState) => boolean = () => true,
): Promise<StandState> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('stand:state', receive)
      reject(new Error('Snapshot Socket.IO absent'))
    }, 5_000)
    const receive = (state: StandState) => {
      if (predicate(state)) {
        clearTimeout(timer)
        socket.off('stand:state', receive)
        resolve(state)
      }
    }
    socket.on('stand:state', receive)
  })
}

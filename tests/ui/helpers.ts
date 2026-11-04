import { io, type Socket } from 'socket.io-client'
import type { Ack, ClientEvents, Command, Result, ServerEvents } from '../../shared/types.js'
import type { Page } from '@playwright/test'
import { PerspectiveCamera, Vector3 } from 'three'
import { spherePoint } from '../../shared/geometry.js'

function response(send: (ack: Ack) => void): Promise<Result> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Stand injoignable')), 8_000)
    send((result) => {
      clearTimeout(timeout)
      if (!result.ok) reject(new Error(result.error))
      else resolve(result)
    })
  })
}
export async function resetStand(baseURL: string) {
  const socket: Socket<ServerEvents, ClientEvents> = io(baseURL, {
    transports: ['websocket'],
    reconnection: false,
    addTrailingSlash: false,
  })
  try {
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve())
      socket.once('connect_error', reject)
    })
    await response((ack) => socket.emit('presenter:claim', {}, ack))
    const command = (payload: Command) =>
      response((ack) => socket.emit('presenter:command', payload, ack))
    await command({ type: 'new-participant' })
    await command({
      type: 'settings',
      settings: { theme: 'tous', difficulty: 'progressive', allowRetry: true },
    })
  } finally {
    socket.disconnect()
  }
}
export async function pickFrance(page: Page, flat = false) {
  const canvas = page.getByLabel(
    flat
      ? 'Planisphère interactif de secours'
      : 'Globe terrestre 3D interactif : glisser pour tourner, cliquer pour choisir un pays',
    { exact: true },
  )
  await canvas.scrollIntoViewIfNeeded()
  const bounds = await canvas.boundingBox()
  if (!bounds) throw new Error('Canvas absent')
  let x: number, y: number
  if (flat) {
    const scale = Math.min(bounds.width / (2 * Math.PI), bounds.height / Math.PI) * 0.94
    x = bounds.width / 2 + ((2.3522 * Math.PI) / 180) * scale
    y = bounds.height / 2 - ((48.8566 * Math.PI) / 180) * scale
  } else {
    const camera = new PerspectiveCamera(40, bounds.width / bounds.height, 0.05, 30)
    camera.position.set(...spherePoint([14, 22], 3.65))
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld()
    const projected = new Vector3(...spherePoint([2.3522, 48.8566])).project(camera)
    x = ((projected.x + 1) / 2) * bounds.width
    y = ((1 - projected.y) / 2) * bounds.height
  }
  await canvas.click({ position: { x, y } })
}

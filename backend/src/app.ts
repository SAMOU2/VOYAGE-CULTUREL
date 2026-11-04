import express from 'express'
import { createServer } from 'node:http'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import { DATA } from './paths.js'
import { Stand } from './stand.js'
import { JsonStore } from './store.js'
import { attachRealtime } from './realtime.js'
import { catalog } from './data.js'

export async function startBackend(
  options: { port?: number; host?: string; usersFile?: string } = {},
) {
  const store = await JsonStore.open(
    options.usersFile ?? process.env.USERS_FILE ?? join(DATA, 'users.json'),
  )
  const stand = new Stand(store)
  const app = express()
  app.disable('x-powered-by')
  app.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    next()
  })
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'voyage-culturel-stand' })
  })
  app.get('/api/state', (_req, res) => {
    res.json(stand.playerState())
  })
  app.get('/api/catalog', (_req, res) => {
    res.json(catalog)
  })
  app.get('/api/leaderboard', (_req, res) => {
    res.json(store.leaderboard())
  })
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Route inconnue' })
  })
  const http = createServer(app)
  const io = attachRealtime(http, stand)
  await new Promise<void>((resolve, reject) => {
    http.once('error', reject)
    http.listen(
      options.port ?? Number(process.env.BACKEND_PORT ?? 4000),
      options.host ?? '0.0.0.0',
      resolve,
    )
  })
  return {
    app,
    http,
    io,
    stand,
    port: (http.address() as AddressInfo).port,
    close: () => new Promise<void>((resolve) => io.close(() => resolve())),
  }
}

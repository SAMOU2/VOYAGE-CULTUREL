import express from 'express'
import { createServer } from 'node:http'
import { dirname, join } from 'node:path'
import type { AddressInfo } from 'node:net'
import { DATA } from './paths.js'
import { Stand } from './stand.js'
import { JsonStore } from './store.js'
import { SettingsStore } from './settings.js'
import { attachRealtime } from './realtime.js'
import { catalog, facts } from './data.js'

export async function startBackend(
  options: {
    port?: number
    host?: string
    usersFile?: string
    settingsFile?: string
    random?: () => number
  } = {},
) {
  const usersFile = options.usersFile ?? process.env.USERS_FILE ?? join(DATA, 'users.json')
  const store = await JsonStore.open(usersFile)
  const configuration = await SettingsStore.open(
    options.settingsFile ?? process.env.SETTINGS_FILE ?? join(dirname(usersFile), 'settings.json'),
  )
  const stand = new Stand(store, configuration, options.random)
  const app = express()
  app.disable('x-powered-by')
  app.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    next()
  })
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'algomania-geo-stand' })
  })
  app.get(['/api/current-question', '/api/state'], (_req, res) => {
    res.json(stand.playerState())
  })
  app.get('/api/catalog', (_req, res) => {
    res.json(catalog)
  })
  app.get('/api/facts', (_req, res) => {
    res.setHeader('Link', `<${facts.license.url}>; rel="license"`)
    res.json(facts.countries)
  })
  app.get('/api/leaderboard', (_req, res) => {
    res.json(store.leaderboard())
  })
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Route inconnue' })
  })
  const http = createServer(app),
    io = attachRealtime(http, stand)
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
    close: async () => {
      await new Promise<void>((resolve) => io.close(() => resolve()))
      await stand.flush()
    },
  }
}

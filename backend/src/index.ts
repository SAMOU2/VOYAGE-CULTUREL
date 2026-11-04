import { startBackend } from './app.js'

try {
  const backend = await startBackend()
  console.log(`Stand Express prêt sur http://0.0.0.0:${backend.port}`)
  let closing = false
  const shutdown = async () => {
    if (closing) return
    closing = true
    try {
      await backend.stand.store.save(backend.stand.participant)
    } catch (error) {
      console.error('Sauvegarde du dernier visiteur impossible :', error)
    }
    await backend.close()
    process.exit(0)
  }
  process.on('SIGINT', () => {
    void shutdown()
  })
  process.on('SIGTERM', () => {
    void shutdown()
  })
} catch (error) {
  console.error('Démarrage du backend impossible :', error)
  process.exitCode = 1
}

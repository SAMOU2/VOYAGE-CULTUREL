import { startBackend } from './app.js'

try {
  const backend = await startBackend()
  console.log('ALGOMANIA · Express prêt sur le port ' + backend.port)
  let closing = false
  const shutdown = async () => {
    if (closing) return
    closing = true
    try {
      await backend.close()
      process.exit(0)
    } catch (error) {
      console.error('Fermeture du stand impossible :', error)
      process.exit(1)
    }
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

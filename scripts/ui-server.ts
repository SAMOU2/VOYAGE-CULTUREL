/** Serveur Playwright isolé : ses visiteurs ne sont jamais ceux du stand. */
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ROOT } from '../backend/src/paths.js'

const directory = await mkdtemp(join(tmpdir(), 'algomania-ui-'))
const child = spawn(
  process.execPath,
  [join(ROOT, 'node_modules/tsx/dist/cli.mjs'), join(ROOT, 'scripts/run.ts'), 'dev'],
  {
    cwd: ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      PORT: process.env.UI_PORT || '3100',
      BACKEND_PORT: process.env.UI_BACKEND_PORT || '4100',
      USERS_FILE: join(directory, 'users.json'),
      SETTINGS_FILE: join(directory, 'settings.json'),
      STAND_UI_TEST: '1',
    },
  },
)
let stopping = false
const stop = () => {
  if (stopping) return
  stopping = true
  child.kill('SIGTERM')
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
child.once('error', (error) => {
  console.error(error)
  process.exitCode = 1
})
child.once('exit', async (code) => {
  await rm(directory, { recursive: true, force: true })
  process.exit(code ?? 0)
})

import { spawn, type ChildProcess } from 'node:child_process'
import { resolve } from 'node:path'
import { ROOT } from '../backend/src/paths.js'

const root = ROOT
const production = process.argv[2] === 'start'
const backendPort = process.env.BACKEND_PORT || '4000'
const frontendPort = process.env.PORT || '3000'
if (backendPort === frontendPort) throw new Error('PORT et BACKEND_PORT doivent être différents.')
const environment: NodeJS.ProcessEnv = {
  ...process.env,
  BACKEND_PORT: backendPort,
  NODE_ENV: production ? 'production' : 'development',
}
const children: ChildProcess[] = []
let stopping = false
function launch(file: string, args: string[], cwd: string): ChildProcess {
  const child = spawn(process.execPath, [file, ...args], {
    cwd,
    env: environment,
    stdio: 'inherit',
  })
  children.push(child)
  child.once('error', (error) => {
    console.error(error)
    stop(1)
  })
  child.once('exit', (code) => {
    if (!stopping) stop(code ?? 1)
  })
  return child
}
function stop(code: number): void {
  if (stopping) return
  stopping = true
  for (const child of children) if (child.exitCode === null) child.kill('SIGTERM')
  const fallback = setTimeout(() => {
    for (const child of children) if (child.exitCode === null) child.kill('SIGKILL')
    process.exit(code)
  }, 5_000)
  Promise.all(
    children.map((child) =>
      child.exitCode !== null
        ? Promise.resolve()
        : new Promise<void>((resolve) => child.once('exit', () => resolve())),
    ),
  )
    .then(() => {
      clearTimeout(fallback)
      process.exit(code)
    })
    .catch(() => process.exit(code))
}
process.on('SIGINT', () => stop(0))
process.on('SIGTERM', () => stop(0))
if (production)
  launch(resolve(root, 'backend/dist/backend/src/index.js'), [], resolve(root, 'backend'))
else
  launch(
    resolve(root, 'node_modules/tsx/dist/cli.mjs'),
    [
      'watch',
      '--include',
      '../data/questions.json',
      '--include',
      '../data/countries.json',
      'src/index.ts',
    ],
    resolve(root, 'backend'),
  )
launch(
  resolve(root, 'node_modules/next/dist/bin/next'),
  [production ? 'start' : 'dev', '--hostname', '0.0.0.0', '--port', frontendPort],
  resolve(root, 'frontend'),
)

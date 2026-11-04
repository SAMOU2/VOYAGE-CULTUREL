import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { once, type EventEmitter } from 'node:events'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'
import { createWatchIgnore } from '../../frontend/next.config.js'

const require = createRequire(import.meta.url)
const windowsRoot = String.raw`C:\Users\Samuel\VOYAGE-CULTUREL`

test('Windows : aucun watcher sur la racine du disque, ses fichiers système ou les dossiers parents', () => {
  const ignored = createWatchIgnore(windowsRoot)
  for (const path of [
    'C:\\',
    'C:\\package.json',
    'C:\\DumpStack.log.tmp',
    'C:\\hiberfil.sys',
    'C:\\pagefile.sys',
    'C:\\swapfile.sys',
    'C:\\Users\\package.json',
    'C:\\Users\\Samuel',
    'C:\\Users\\Samuel\\package-lock.json',
    'D:\\pagefile.sys',
  ])
    assert.ok(ignored.test(path), `Chemin hors dépôt non exclu : ${path}`)
})

test('Windows : frontend, shared et configurations du dépôt restent surveillés, avec les deux séparateurs', () => {
  const ignored = createWatchIgnore(windowsRoot)
  for (const relative of [
    'frontend/src/app/jouer/page.tsx',
    'shared/geometry.ts',
    'frontend/next.config.ts',
    'package.json',
    'tsconfig.json',
  ]) {
    assert.equal(ignored.test(`${windowsRoot}\\${relative.replace(/\//g, '\\')}`), false)
    assert.equal(ignored.test(`${windowsRoot.replace(/\\/g, '/')}/${relative}`), false)
  }
  assert.equal(ignored.test(windowsRoot), false)
  assert.equal(ignored.test('c:/users/samuel/voyage-culturel/shared/types.ts'), false)
})

test('le préfixe d’un dépôt voisin ne suffit pas à entrer dans le périmètre', () => {
  const ignored = createWatchIgnore(windowsRoot)
  assert.ok(ignored.test(`${windowsRoot}-copie/shared/types.ts`))
  assert.ok(ignored.test(`${windowsRoot}.old/frontend/src/app/page.tsx`))
})

test('node_modules, .git et .next restent exclus à toutes les profondeurs', () => {
  const ignored = createWatchIgnore(windowsRoot)
  for (const relative of [
    'node_modules/three/package.json',
    'frontend/node_modules/next/package.json',
    '.git/index',
    'frontend/.next/server/app/jouer.js',
  ]) {
    assert.ok(ignored.test(`${windowsRoot}/${relative}`))
  }
  assert.equal(ignored.test(`${windowsRoot}/frontend/src/lib/node_modules-note.ts`), false)
})

test('POSIX : sources du dépôt incluses, parents et dépôts voisins exclus, casse conservée', () => {
  const ignored = createWatchIgnore('/home/samuel/VOYAGE-CULTUREL/')
  for (const file of [
    '/home/samuel/VOYAGE-CULTUREL/shared/geometry.ts',
    '/home/samuel/VOYAGE-CULTUREL/frontend/src/app/jouer/page.tsx',
  ])
    assert.equal(ignored.test(file), false)
  for (const file of [
    '/',
    '/package.json',
    '/home/samuel/package.json',
    '/home/samuel/VOYAGE-CULTUREL-copy/app.ts',
    '/home/samuel/voyage-culturel/shared/types.ts',
  ])
    assert.ok(ignored.test(file))
})

test('partage UNC et noms de dossier contenant espaces et métacaractères', () => {
  const unc = createWatchIgnore(String.raw`\\NAS\Students Day\VOYAGE+[2026]`)
  assert.equal(unc.test(String.raw`\\nas\Students Day\VOYAGE+[2026]\shared\geometry.ts`), false)
  assert.equal(unc.test('//NAS/Students Day/VOYAGE+[2026]/frontend/src/app/page.tsx'), false)
  assert.ok(unc.test('//NAS/Students Day/VOYAGE2026/shared/geometry.ts'))
  assert.ok(unc.test('//NAS/other/project/package.json'))
  const posix = createWatchIgnore('/home/samuel/Voyage (ISD)+[2026]')
  assert.equal(posix.test('/home/samuel/Voyage (ISD)+[2026]/shared/types.ts'), false)
  assert.ok(posix.test('/home/samuel/Voyage ISD2026/shared/types.ts'))
})

test('exclusions RegExp de Next préservées et résultats stables entre deux appels', () => {
  const ignored = createWatchIgnore(windowsRoot, /(?:^|\/)generated-cache(?:\/|$)/g)
  for (let i = 0; i < 3; i++) {
    assert.ok(ignored.test(`${windowsRoot}/frontend/generated-cache/file.ts`))
    assert.ok(ignored.test('C:/pagefile.sys'))
    assert.equal(ignored.test(`${windowsRoot}/shared/geometry.ts`), false)
  }
})

test('une racine relative est refusée plutôt que d’exclure silencieusement toutes les sources', () => {
  assert.throws(() => createWatchIgnore('../VOYAGE-CULTUREL'), /chemin absolu/)
})

test('Watchpack réel : surveille les deux dossiers sources, sans ouvrir le dossier extérieur', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'voyage-watch-'))
  const root = join(directory, 'repo'),
    outside = join(directory, 'system')
  await mkdir(join(root, 'frontend'), { recursive: true })
  await mkdir(join(root, 'shared'))
  await mkdir(outside)
  const front = join(root, 'frontend', 'page.ts'),
    shared = join(root, 'shared', 'geometry.ts'),
    system = join(outside, 'pagefile.sys')
  await Promise.all([
    writeFile(front, 'export const page = 1\n'),
    writeFile(shared, 'export const value = 1\n'),
    writeFile(system, 'ne pas surveiller'),
  ])
  type Watcher = EventEmitter & {
    watch(options: {
      files: string[]
      directories: string[]
      missing: string[]
      startTime: number
    }): void
    getTimeInfoEntries(): Map<string, unknown>
    fileWatchers: Map<string, unknown>
    directoryWatchers: Map<string, unknown>
    close(): void
  }
  const Watchpack = require('next/dist/compiled/watchpack/watchpack.js') as new (options: {
    ignored: RegExp
    aggregateTimeout: number
  }) => Watcher
  const watcher = new Watchpack({ ignored: createWatchIgnore(root), aggregateTimeout: 5 })
  try {
    const scanned = once(watcher, 'aggregated', { signal: AbortSignal.timeout(5_000) })
    watcher.watch({
      files: [front, shared, system],
      directories: [outside],
      missing: [join(outside, 'package.json')],
      startTime: Date.now() - 60_000,
    })
    assert.ok(watcher.fileWatchers.has(front))
    assert.ok(watcher.fileWatchers.has(shared))
    assert.equal(watcher.fileWatchers.has(system), false)
    assert.equal(watcher.fileWatchers.has(join(outside, 'package.json')), false)
    assert.equal(watcher.directoryWatchers.has(outside), false)
    await scanned
    assert.ok(watcher.getTimeInfoEntries().has(front))
    assert.ok(watcher.getTimeInfoEntries().has(shared))
    assert.equal(watcher.getTimeInfoEntries().has(system), false)
    const changed = once(watcher, 'aggregated', { signal: AbortSignal.timeout(5_000) })
    await writeFile(shared, 'export const value = 2\n')
    const [files] = (await changed) as [Set<string>]
    assert.ok(files.has(shared), 'Le rechargement de shared/ doit rester actif')
  } finally {
    watcher.close()
    await rm(directory, { recursive: true, force: true })
  }
})

test('Next charge la config TypeScript : racine explicite, options dev préservées et production inchangée', async () => {
  const { default: loadConfig } = require('next/dist/server/config.js') as {
    default: (phase: string, directory: string) => Promise<NextConfig>
  }
  const root = fileURLToPath(new URL('../../', import.meta.url)).replace(/[\\/]$/, '')
  const config = await loadConfig('phase-development-server', join(root, 'frontend'))
  assert.equal(config.outputFileTracingRoot, root)
  assert.equal(config.turbopack?.root, root)
  assert.ok(config.webpack)
  const original = { watchOptions: { ignored: /custom-cache/, aggregateTimeout: 5, poll: 777 } }
  type Context = Parameters<NonNullable<NextConfig['webpack']>>[1]
  const dev = config.webpack(structuredClone(original), { dev: true } as Context)
  assert.equal(dev.watchOptions.aggregateTimeout, 5)
  assert.equal(dev.watchOptions.poll, 777)
  assert.ok(dev.watchOptions.ignored instanceof RegExp)
  assert.ok(dev.watchOptions.ignored.test(join(root, 'custom-cache', 'file.ts')))
  assert.ok(dev.watchOptions.ignored.test('/package.json'))
  assert.equal(dev.watchOptions.ignored.test(join(root, 'shared', 'geometry.ts')), false)
  const production = config.webpack(original, { dev: false } as Context)
  assert.equal(production, original)
  assert.equal(production.watchOptions.ignored.source, 'custom-cache')
})

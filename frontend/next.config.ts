import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'

const separator = String.raw`[\\/]`
const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Watchpack inspecte tous les voisins d'un fichier surveillé avant d'appliquer
 * les exclusions. Ignorer seulement pagefile.sys ne suffit donc pas : il faut
 * empêcher les dépendances manquantes hors dépôt d'ouvrir un watcher sur C:\.
 * Les fichiers frontend/, shared/ et les workspaces restent dans le périmètre.
 */
export function createWatchIgnore(projectRoot: string, previous?: RegExp): RegExp {
  if (!/^(?:[a-z]:[\\/]|[\\/])/i.test(projectRoot)) {
    throw new Error('Le périmètre de surveillance doit être un chemin absolu.')
  }
  const normalizedRoot = projectRoot.replace(/\\/g, '/').replace(/\/+$/, '')
  const rootPattern = normalizedRoot.split('/').map(escapeRegExp).join(separator)
  const sources = [
    `^(?!${rootPattern}(?:${separator}|$))`,
    `(?:^|${separator})(?:node_modules|\\.git|\\.next)(?:${separator}|$)`,
  ]
  if (previous) sources.push(`(?:${previous.source})`)
  // Un RegExp global/sticky alternerait les résultats entre deux appels de Watchpack.
  const flags = new Set((previous?.flags ?? '').replace(/[gy]/g, ''))
  if (/^(?:[a-z]:|\/\/)/i.test(normalizedRoot)) flags.add('i')
  return new RegExp(sources.join('|'), [...flags].join(''))
}

// Next charge ce fichier depuis frontend/ ; ne pas inférer la racine en remontant
// les éventuels lockfiles du profil utilisateur ou du disque Windows.
const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const backend = process.env.BACKEND_ORIGIN || `http://127.0.0.1:${process.env.BACKEND_PORT || 4000}`
const config: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  poweredByHeader: false,
  outputFileTracingRoot: projectRoot,
  webpack(webpackConfig, { dev }) {
    if (dev) {
      const previous = webpackConfig.watchOptions?.ignored
      webpackConfig.watchOptions = {
        ...webpackConfig.watchOptions,
        ignored: createWatchIgnore(projectRoot, previous instanceof RegExp ? previous : undefined),
      }
    }
    return webpackConfig
  },
  allowedDevOrigins: ['*.e2b.app', '*.arena.ai', 'localhost', '127.0.0.1'],
  eslint: { ignoreDuringBuilds: true },
  experimental: { externalDir: true, optimizePackageImports: ['three', 'd3-geo'] },
  async rewrites() {
    // URL relative côté navigateur ; Express reste un processus distinct.
    return [
      { source: '/api/:path*', destination: `${backend}/api/:path*` },
      { source: '/socket.io/:path*', destination: `${backend}/socket.io/:path*` },
    ]
  },
}
export default config

import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Autorise l'accès au serveur de développement depuis l'aperçu hébergé (proxy) et le réseau local.
  allowedDevOrigins: ['*.e2b.app', '*.arena.ai', 'localhost', '127.0.0.1'],
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    // Évite les avertissements de préchargement inutiles en mode local.
    optimizePackageImports: ['d3-geo'],
  },
}

export default nextConfig

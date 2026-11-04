import type { NextConfig } from 'next'

const backend = process.env.BACKEND_ORIGIN || `http://127.0.0.1:${process.env.BACKEND_PORT || 4000}`
const config: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  poweredByHeader: false,
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

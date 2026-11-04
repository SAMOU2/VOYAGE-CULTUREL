import type { Metadata, Viewport } from 'next'
import '@fontsource-variable/inter'
import '@fontsource-variable/outfit'
import './globals.css'

export const metadata: Metadata = {
  title: 'Voyage Culturel — International Students Day',
  description:
    'Le stand culturel : faites tourner la Terre, choisissez un pays et faites voyager votre curiosité. International Students Day.',
}
export const viewport: Viewport = {
  themeColor: '#080f1e',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
}
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  )
}

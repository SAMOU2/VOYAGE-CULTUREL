import type { Metadata, Viewport } from 'next'
import '@fontsource-variable/inter'
import '@fontsource-variable/outfit'
import './globals.css'

export const metadata: Metadata = {
  title: 'Voyage Culturel — le globe des questions',
  description:
    'Jeu culturel en réseau local : un joueur explore un globe interactif et répond à des questions de géographie et de culture, pendant que le présentateur pilote la partie.',
}

export const viewport: Viewport = {
  themeColor: '#050a15',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <div className="sky" aria-hidden />
        <div className="grid-lines" aria-hidden />
        {children}
      </body>
    </html>
  )
}

import type { Metadata, Viewport } from 'next'
import '@fontsource-variable/inter'
import '@fontsource-variable/noto-sans-arabic'
import { QueryProvider } from '@/components/QueryProvider'
import './globals.css'

export const metadata: Metadata = {
  title: 'ALGOMANIA · Le défi géographique',
  description:
    'Le jeu géographique du Scientific Club ALGOMANIA : explorez la Terre et trouvez les pays.',
}
export const viewport: Viewport = {
  themeColor: '#08275e',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
}
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  )
}

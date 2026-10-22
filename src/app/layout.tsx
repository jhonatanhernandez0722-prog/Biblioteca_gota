import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import { Suspense } from 'react'
import { DemoBanner } from '@/components/layout/DemoBanner'
import { CookieBanner } from '@/components/legal/CookieConsent'
import { Toaster } from '@/components/ui/Toaster'
import { env } from '@/server/env'
import { isDemoMode } from '@/server/site'
import './globals.css'

/* Fuentes alojadas en el proyecto: la web no depende de un servicio externo para verse bien. */
const manrope = localFont({
  src: '../fonts/manrope-variable.woff2',
  variable: '--font-manrope',
  weight: '200 800',
  display: 'swap',
  fallback: ['system-ui', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
  adjustFontFallback: 'Arial',
})

const dmSerif = localFont({
  src: [
    { path: '../fonts/dm-serif-display-400.woff2', weight: '400', style: 'normal' },
    { path: '../fonts/dm-serif-display-400-italic.woff2', weight: '400', style: 'italic' },
  ],
  variable: '--font-dm-serif',
  display: 'swap',
  fallback: ['Georgia', 'Times New Roman', 'serif'],
  adjustFontFallback: 'Times New Roman',
})

export const metadata: Metadata = {
  metadataBase: new URL(env().APP_URL),
  title: {
    default: 'Biblioteca Gota Gota · Descubre, consulta y pide libros',
    template: '%s · Biblioteca Gota Gota',
  },
  description:
    'Descubre nuevas historias, encuentra tu próxima lectura y pide libros en préstamo en Biblioteca Gota Gota.',
  applicationName: 'Biblioteca Gota Gota',
  openGraph: {
    type: 'website',
    locale: 'es_CO',
    siteName: 'Biblioteca Gota Gota',
  },
}

export const viewport: Viewport = {
  themeColor: '#16324F',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${manrope.variable} ${dmSerif.variable}`}>
      <body>
        <a href="#contenido" className="skip-link">
          Saltar al contenido
        </a>
        {isDemoMode() ? <DemoBanner /> : null}
        {children}
        <Suspense fallback={null}>
          <Toaster />
        </Suspense>
        <CookieBanner />
      </body>
    </html>
  )
}

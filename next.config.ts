import type { NextConfig } from 'next'

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
]

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    // Solo se optimizan las portadas que sirve la propia aplicación.
    localPatterns: [{ pathname: '/media/covers/**', search: '' }],
    qualities: [75, 85],
  },
  experimental: {
    serverActions: {
      // Portadas de hasta 5 MB + margen para el multipart.
      bodySizeLimit: '6mb',
    },
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default nextConfig

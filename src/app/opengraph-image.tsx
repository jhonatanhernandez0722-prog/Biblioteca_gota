import { ImageResponse } from 'next/og'
import { dropMarkDataUri, OG_COLORS, ogFonts, ripplesDataUri } from '@/server/og'

export const alt = 'Biblioteca Gota Gota: cada libro, una nueva forma de ver el mundo'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

/** Imagen para compartir la web: el titular de la portada sobre el campo de tinta. */
export default async function Image() {
  const fonts = await ogFonts()
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: OG_COLORS.ink,
          color: OG_COLORS.paper,
          fontFamily: 'Manrope',
          padding: '72px 80px',
          position: 'relative',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- Satori solo admite <img> */}
        <img src={ripplesDataUri()} width={640} height={192} style={{ position: 'absolute', right: -200, bottom: -60 }} alt="" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- Satori solo admite <img> */}
          <img src={dropMarkDataUri()} width={46} height={60} alt="" />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 24, fontWeight: 700, color: OG_COLORS.water }}>Biblioteca</span>
            <span style={{ fontFamily: 'DM Serif Display', fontSize: 44, lineHeight: 1 }}>Gota Gota</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 900 }}>
          <span style={{ fontFamily: 'DM Serif Display', fontSize: 86, lineHeight: 1.02, letterSpacing: -2 }}>
            Cada libro, una nueva forma de ver el mundo
          </span>
          <span style={{ fontSize: 30, color: OG_COLORS.mutedOnInk }}>Descubre, reserva y pide libros en préstamo.</span>
        </div>
      </div>
    ),
    { ...size, fonts },
  )
}

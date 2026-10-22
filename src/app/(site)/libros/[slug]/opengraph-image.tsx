import { ImageResponse } from 'next/og'
import { joinAuthors, truncate } from '@/lib/text'
import { getBookBySlug } from '@/server/catalog'
import { getStorage } from '@/server/integrations/storage'
import { dropMarkDataUri, OG_COLORS, ogFonts, ripplesDataUri } from '@/server/og'

export const alt = 'Ficha del libro en Biblioteca Gota Gota'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

/** Tarjeta para compartir un libro: su portada sobre el agua y el título en la voz de la biblioteca. */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const book = await getBookBySlug(slug)
  const fonts = await ogFonts()

  let cover: string | null = null
  if (book?.coverKey) {
    const data = await getStorage().read(`covers/${book.coverKey}`)
    if (data) cover = `data:image/jpeg;base64,${data.toString('base64')}`
  }
  const title = book ? truncate(book.title, 70) : 'Biblioteca Gota Gota'
  const titleSize = title.length > 40 ? 58 : 72

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          background: OG_COLORS.ink,
          color: OG_COLORS.paper,
          fontFamily: 'Manrope',
          padding: '64px 72px',
        }}
      >
        <div style={{ position: 'relative', display: 'flex', width: 340, alignItems: 'flex-start', justifyContent: 'center' }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- Satori solo admite <img> */}
          <img src={ripplesDataUri()} width={420} height={126} style={{ position: 'absolute', left: -40, top: 400 }} alt="" />
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element -- Satori solo admite <img>
            <img
              src={cover}
              width={300}
              height={450}
              style={{ objectFit: 'cover', borderRadius: 4, boxShadow: '0 30px 60px rgba(0,0,0,0.45)' }}
              alt=""
            />
          ) : (
            <div
              style={{
                width: 300,
                height: 450,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                padding: 32,
                background: OG_COLORS.ink2,
                borderRadius: 4,
                fontFamily: 'DM Serif Display',
                fontSize: 40,
                lineHeight: 1.05,
              }}
            >
              <span>{title}</span>
              {/* eslint-disable-next-line @next/next/no-img-element -- Satori solo admite <img> */}
              <img src={dropMarkDataUri()} width={30} height={39} alt="" />
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flex: 1, paddingLeft: 64 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- Satori solo admite <img> */}
            <img src={dropMarkDataUri()} width={34} height={44} alt="" />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 20, fontWeight: 700, color: OG_COLORS.water }}>Biblioteca</span>
              <span style={{ fontFamily: 'DM Serif Display', fontSize: 34, lineHeight: 1 }}>Gota Gota</span>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <span style={{ fontFamily: 'DM Serif Display', fontSize: titleSize, lineHeight: 1.04, letterSpacing: -1 }}>{title}</span>
            {book ? (
              <span style={{ fontSize: 30, fontWeight: 700, color: OG_COLORS.water }}>{joinAuthors(book.authors)}</span>
            ) : null}
          </div>
          <span style={{ fontSize: 24, color: OG_COLORS.mutedOnInk }}>
            {book?.publishedYear ? `Edición de ${book.publishedYear}. ` : ''}Pídelo con tu carné de lector.
          </span>
        </div>
      </div>
    ),
    { ...size, fonts },
  )
}

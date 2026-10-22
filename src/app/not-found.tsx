import Link from 'next/link'
import { DropMark } from '@/components/brand/DropMark'
import { Ripples } from '@/components/brand/Ripples'

export default function NotFound() {
  return (
    <main id="contenido" className="container" style={{ minHeight: '80dvh', display: 'grid', placeItems: 'center', padding: '64px 0' }}>
      <div style={{ display: 'grid', justifyItems: 'center', gap: 24, textAlign: 'center', maxWidth: 520 }}>
        <div style={{ position: 'relative', width: 220, display: 'grid', justifyItems: 'center' }}>
          <DropMark size={72} />
          <div style={{ width: 220, marginTop: -8 }}>
            <Ripples rings={3} />
          </div>
        </div>
        <h1 style={{ fontSize: 'var(--fs-h1)' }}>Esta página no existe</h1>
        <p className="lead" style={{ marginInline: 'auto' }}>
          Puede que el enlace esté mal escrito o que la página se haya movido. El catálogo sigue en su sitio.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Link href="/explorar" className="btn">
            Buscar un libro
          </Link>
          <Link href="/" className="btn btn--ghost">
            Ir al inicio
          </Link>
        </div>
      </div>
    </main>
  )
}

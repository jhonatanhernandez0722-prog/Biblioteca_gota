import Link from 'next/link'

export default function BookNotFound() {
  return (
    <div className="container" style={{ padding: '64px 0' }}>
      <div className="empty">
        <h1 style={{ fontSize: 'var(--fs-h2)' }}>Este libro no está en el catálogo</h1>
        <p>Puede que el enlace esté mal escrito o que la ficha se haya retirado. Búscalo por su título o su autor.</p>
        <Link href="/explorar" className="btn">
          Buscar en el catálogo
        </Link>
      </div>
    </div>
  )
}

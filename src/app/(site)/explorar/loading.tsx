/** Esqueleto del catálogo: conserva la composición mientras llegan los resultados. */
export default function Loading() {
  return (
    <div className="container" aria-busy="true" aria-live="polite">
      <p className="visually-hidden">Cargando el catálogo…</p>
      <div style={{ padding: 'clamp(32px, 4vw, 56px) 0 32px', display: 'grid', gap: 12 }}>
        <div className="skeleton" style={{ width: 'min(100%, 420px)', height: 48 }} />
        <div className="skeleton" style={{ width: 'min(100%, 560px)', height: 20 }} />
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
          gap: '48px 32px',
          marginTop: 32,
        }}
      >
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} style={{ display: 'grid', gap: 12 }}>
            <div className="skeleton" style={{ aspectRatio: '2 / 3' }} />
            <div className="skeleton" style={{ height: 18, width: '85%' }} />
            <div className="skeleton" style={{ height: 14, width: '60%' }} />
          </div>
        ))}
      </div>
    </div>
  )
}

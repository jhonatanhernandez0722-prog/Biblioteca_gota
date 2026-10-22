import { AdminHeader } from '@/components/admin/AdminPage'
import { ImportWorkbench } from '@/components/admin/ImportWorkbench'
import { requireStaff } from '@/server/auth/current-user'
import { listCategories } from '@/server/catalog'
import { getDefaultProviderId, listProviders } from '@/server/integrations/metadata'

export const metadata = { title: 'Importar libro' }

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireStaff('/admin/libros/importar')
  const { q } = await searchParams
  const categories = (await listCategories()).map((c) => ({ slug: c.slug, name: c.name }))
  return (
    <>
      <AdminHeader
        title="Importar libro por ISBN o título"
        description="Busca en una fuente bibliográfica, revisa los datos sin salir de la página y guárdalos en el catálogo de la biblioteca."
        back={{ href: '/admin/libros', label: 'Libros' }}
      />
      <ImportWorkbench
        categories={categories}
        providers={listProviders()}
        defaultProvider={getDefaultProviderId()}
        initialQuery={q?.slice(0, 120)}
      />
    </>
  )
}

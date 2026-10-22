import Link from 'next/link'
import { AdminHeader } from '@/components/admin/AdminPage'
import { BookForm } from '@/components/admin/BookForm'
import { EMPTY_BOOK } from '@/components/admin/book-form-values'
import { requireStaff } from '@/server/auth/current-user'
import { listCategories } from '@/server/catalog'

export const metadata = { title: 'Nueva ficha' }

export default async function NewBookPage() {
  await requireStaff('/admin/libros/nuevo')
  const categories = (await listCategories()).map((c) => ({ slug: c.slug, name: c.name }))
  return (
    <>
      <AdminHeader
        title="Nueva ficha"
        description={
          <>
            Para libros que no están en las fuentes bibliográficas. Si tiene ISBN, prueba antes a{' '}
            <Link href="/admin/libros/importar" className="link">
              importarlo
            </Link>
            : ahorra trabajo y evita erratas.
          </>
        }
        back={{ href: '/admin/libros', label: 'Libros' }}
      />
      <div style={{ maxWidth: 920 }}>
        <BookForm initial={EMPTY_BOOK} categories={categories} />
      </div>
    </>
  )
}

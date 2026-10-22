import { SiteFooter } from '@/components/layout/SiteFooter'
import { SiteHeader } from '@/components/layout/SiteHeader'
import { getCurrentUser } from '@/server/auth/current-user'

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  return (
    <>
      <SiteHeader user={user} />
      <main id="contenido" tabIndex={-1}>
        {children}
      </main>
      <SiteFooter signedIn={Boolean(user)} />
    </>
  )
}

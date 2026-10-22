import type { Metadata } from 'next'
import { AdminNav } from '@/components/admin/AdminNav'
import { ROLE_LABEL } from '@/lib/status'
import { requireStaff } from '@/server/auth/current-user'
import { countStaffLoanViews } from '@/server/circulation'
import styles from './admin.module.css'

export const metadata: Metadata = {
  title: { default: 'Panel', template: '%s · Panel · Gota Gota' },
  robots: { index: false, follow: false },
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff()
  const counts = await countStaffLoanViews()
  return (
    <div className={styles.shell}>
      <AdminNav
        user={{ name: user.name, role: ROLE_LABEL[user.role], isAdmin: user.role === 'admin' }}
        attention={counts.requests + counts.overdue}
      />
      <main id="contenido" tabIndex={-1} className={styles.main}>
        {children}
      </main>
    </div>
  )
}

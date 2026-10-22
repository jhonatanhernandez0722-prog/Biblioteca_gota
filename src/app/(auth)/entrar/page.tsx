import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { LoginForm, type DemoAccount } from '@/components/auth/AuthForms'
import { getCurrentUser, safeNextPath } from '@/server/auth/current-user'
import { isDemoMode } from '@/server/site'
import styles from '../auth.module.css'

export const metadata: Metadata = { title: 'Entrar' }

/** Solo en modo demostración: cuentas sembradas por `npm run db:seed`. */
const DEMO_ACCOUNTS: DemoAccount[] = [
  { label: 'Lector', email: 'lector@gotagota.example', password: 'LectorGota-2026' },
  { label: 'Bibliotecario', email: 'biblioteca@gotagota.example', password: 'BibliotecaGota-2026' },
  { label: 'Administración', email: 'admin@gotagota.example', password: 'AdminGota-2026' },
]

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ siguiente?: string }> }) {
  const { siguiente } = await searchParams
  const next = siguiente ? safeNextPath(siguiente) : undefined
  if (await getCurrentUser()) redirect(next ?? '/cuenta')

  return (
    <>
      <h1 className={styles.title}>Entrar</h1>
      <p className={styles.lead}>Consulta tus préstamos, renueva tus libros y reserva los que están prestados.</p>
      <LoginForm next={next} demoAccounts={isDemoMode() ? DEMO_ACCOUNTS : undefined} />
      <p className={styles.switch}>
        ¿Aún no tienes cuenta?{' '}
        <Link href={next ? `/registro?siguiente=${encodeURIComponent(next)}` : '/registro'} className="link">
          Crea tu carné de lector
        </Link>
      </p>
    </>
  )
}

import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { RegisterForm } from '@/components/auth/AuthForms'
import { getCurrentUser, safeNextPath } from '@/server/auth/current-user'
import styles from '../auth.module.css'

export const metadata: Metadata = { title: 'Crear cuenta' }

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ siguiente?: string }> }) {
  const { siguiente } = await searchParams
  const next = siguiente ? safeNextPath(siguiente) : undefined
  if (await getCurrentUser()) redirect(next ?? '/cuenta')

  return (
    <>
      <h1 className={styles.title}>Crea tu carné</h1>
      <p className={styles.lead}>
        Es gratis y tarda dos minutos. Ten a mano tu documento (CC o TI) y una tarjeta de crédito: con tu carné de
        lector puedes pedir hasta 5 libros a la vez.
      </p>
      <RegisterForm next={next} />
      <p className={styles.switch}>
        ¿Ya tienes cuenta?{' '}
        <Link href={next ? `/entrar?siguiente=${encodeURIComponent(next)}` : '/entrar'} className="link">
          Entra
        </Link>
      </p>
    </>
  )
}

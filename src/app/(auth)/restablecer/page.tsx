import type { Metadata } from 'next'
import Link from 'next/link'
import { ResetPasswordForm } from '@/components/auth/AuthForms'
import { isResetTokenValid } from '@/server/users'
import styles from '../auth.module.css'

export const metadata: Metadata = { title: 'Nueva contraseña', robots: { index: false } }

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams
  const valid = typeof token === 'string' && token.length >= 20 && token.length <= 200 && await isResetTokenValid(token)

  if (!valid) {
    return (
      <>
        <h1 className={styles.title}>El enlace ya no sirve</h1>
        <p className={styles.lead}>
          Los enlaces para restablecer la contraseña caducan en una hora y solo se pueden usar una vez.
        </p>
        <Link href="/recuperar" className="btn btn--block">
          Pedir un enlace nuevo
        </Link>
      </>
    )
  }

  return (
    <>
      <h1 className={styles.title}>Elige una contraseña nueva</h1>
      <p className={styles.lead}>Al guardarla, cerraremos las sesiones abiertas en otros dispositivos.</p>
      <ResetPasswordForm token={token} />
    </>
  )
}

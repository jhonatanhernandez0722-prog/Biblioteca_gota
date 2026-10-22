import type { Metadata } from 'next'
import Link from 'next/link'
import { ForgotPasswordForm } from '@/components/auth/AuthForms'
import styles from '../auth.module.css'

export const metadata: Metadata = { title: 'Recuperar contraseña' }

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className={styles.title}>Recupera tu contraseña</h1>
      <p className={styles.lead}>
        Escribe el correo de tu cuenta y te enviaremos un enlace para crear una contraseña nueva.
      </p>
      <ForgotPasswordForm />
      <p className={styles.switch}>
        ¿La recordaste?{' '}
        <Link href="/entrar" className="link">
          Entra
        </Link>
      </p>
    </>
  )
}

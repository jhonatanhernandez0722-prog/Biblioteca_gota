import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CircleAlert } from 'lucide-react'
import { ChangePasswordForm, IdentityForm, LoanCardsManager, ProfileForm } from '@/components/account/ProfileForms'
import { describeCard, formatPhone, maskDocument, type CardBrand } from '@/lib/identity'
import { formatDate } from '@/lib/dates'
import { ROLE_LABEL } from '@/lib/status'
import { requireUser } from '@/server/auth/current-user'
import { getLegalParty, getLibraryInfo } from '@/server/site'
import { getConsentStates } from '@/server/consents'
import { RevokePrivacyForm } from '@/components/legal/ConsentForms'
import { LEGAL_DOCUMENTS, LEGAL_PATH } from '@/lib/legal'
import { getUserById, listLoanCards } from '@/server/users'
import styles from '../cuenta.module.css'

export const metadata: Metadata = { title: 'Mi perfil' }

export default async function ProfilePage() {
  const session = await requireUser('/cuenta/perfil')
  const user = await getUserById(session.id)
  if (!user) notFound()
  const info = getLibraryInfo()
  const consents = await getConsentStates(user.id)
  const party = getLegalParty()
  const cards = await listLoanCards(user.id)
  const savedCard =
    user.identity.cardBrand && user.identity.cardLast4
      ? describeCard(user.identity.cardBrand as CardBrand, user.identity.cardLast4)
      : null

  return (
    <div className="container">
      <header className={styles.head}>
        <div className={styles.headText}>
          <p>
            <Link href="/cuenta" className="link">
              Mis préstamos
            </Link>
          </p>
          <h1>Mi perfil</h1>
        </div>
      </header>

      <div className={styles.profileGrid}>
        <section aria-labelledby="datos" className={styles.panel}>
          <h2 id="datos" className={styles.panelTitle}>
            Tus datos
          </h2>
          <ProfileForm name={user.name} />
          <dl className={styles.facts}>
            <div>
              <dt>Correo</dt>
              <dd>{user.email}</dd>
            </div>
            <div>
              <dt>Carné</dt>
              <dd>{user.cardNumber}</dd>
            </div>
            <div>
              <dt>Perfil</dt>
              <dd>{ROLE_LABEL[user.role]}</dd>
            </div>
            <div>
              <dt>Lector desde</dt>
              <dd>{formatDate(user.createdAt)}</dd>
            </div>
          </dl>
          <p className="meta">
            Para cambiar tu correo o pedir que borremos tu cuenta, escríbenos a{' '}
            <a href={`mailto:${info.email}`} className="link">
              {info.email}
            </a>
            .
          </p>
        </section>

        <section aria-labelledby="datos-prestamo-titulo" id="datos-prestamo" className={styles.panel}>
          <h2 id="datos-prestamo-titulo" className={styles.panelTitle}>
            Datos para préstamos
          </h2>
          {user.identity.complete ? (
            <dl className={styles.facts} style={{ borderTop: 0, paddingTop: 0 }}>
              <div>
                <dt>Teléfono</dt>
                <dd>{formatPhone(user.identity.phone!)}</dd>
              </div>
              <div>
                <dt>Documento</dt>
                <dd>{maskDocument(user.identity.documentType!, user.identity.documentNumber!)}</dd>
              </div>
              <div>
                <dt>Tarjeta</dt>
                <dd>{savedCard}</dd>
              </div>
            </dl>
          ) : (
            <div className="alert alert--warning" role="note">
              <CircleAlert aria-hidden="true" />
              <p>Completa estos datos para poder pedir y reservar libros.</p>
            </div>
          )}
          <IdentityForm
            values={{
              phone: user.identity.phone ?? '',
              documentType: user.identity.documentType ?? '',
              documentNumber: user.identity.documentNumber ?? '',
            }}
            savedCard={savedCard}
          />
        </section>

        <section aria-labelledby="carnes" className={styles.panel}>
          <h2 id="carnes" className={styles.panelTitle}>
            Carnés de préstamo
          </h2>
          <p className="meta">Al pedir un libro eliges con cuál. El de la biblioteca no se puede eliminar.</p>
          <LoanCardsManager cards={cards} />
        </section>

        <section aria-labelledby="aceptaciones" className={styles.panel}>
          <h2 id="aceptaciones" className={styles.panelTitle}>
            Tus aceptaciones
          </h2>
          <ul role="list" style={{ display: 'grid', gap: 12 }}>
            {consents.map((c) => (
              <li key={c.slug}>
                <Link href={LEGAL_PATH[c.slug]} className="link">
                  {LEGAL_DOCUMENTS[c.slug].title}
                </Link>
                <p className="meta">
                  {c.result === 'accepted'
                    ? `Aceptada (versión ${c.version}) el ${formatDate(c.recordedAt!)}${c.current ? '' : '. Hay una versión nueva pendiente.'}`
                    : c.result === 'revoked'
                      ? `Revocada el ${formatDate(c.recordedAt!)}`
                      : 'Sin aceptar'}
                </p>
              </li>
            ))}
          </ul>
          {consents.find((c) => c.slug === 'privacidad')?.result === 'accepted' ? (
            <>
              <p className="meta">
                Puedes revocar la autorización de tratamiento de datos. Quedará registrado y no podrás pedir libros hasta
                volver a autorizarlo. Para pedir la supresión de tus datos escribe a {party.email}.
              </p>
              <RevokePrivacyForm />
            </>
          ) : null}
        </section>

        <section aria-labelledby="clave" className={styles.panel}>
          <h2 id="clave" className={styles.panelTitle}>
            Contraseña
          </h2>
          <p className="meta">Al cambiarla cerraremos tus sesiones en otros dispositivos.</p>
          <ChangePasswordForm />
        </section>
      </div>
    </div>
  )
}

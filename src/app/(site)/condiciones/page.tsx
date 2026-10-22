import type { Metadata } from 'next'
import Link from 'next/link'
import { DraftNotice } from '@/components/layout/DraftNotice'
import { LOAN_RULES, MAX_TOTAL_LOAN_DAYS } from '@/lib/rules'
import styles from '../prose.module.css'

export const metadata: Metadata = { title: 'Condiciones de préstamo' }

export default function ConditionsPage() {
  return (
    <div className={`container ${styles.page}`}>
      <header className={styles.head}>
        <h1>Condiciones de préstamo</h1>
        <p className={styles.lead}>Las reglas que la aplicación aplica en cada solicitud, préstamo, renovación y reserva.</p>
      </header>
      <DraftNotice className={styles.draft} />
      <div className={styles.prose}>
        <h2>Quién puede pedir libros</h2>
        <p>
          Cualquier persona con una cuenta activa en Biblioteca Gota Gota. Al crearla recibes un número de carné, que
          presentas en el mostrador al recoger un libro.
        </p>

        <h2>Plazos</h2>
        <ul>
          <li>
            El préstamo dura <strong>{LOAN_RULES.loanDays} días naturales</strong> desde la entrega del ejemplar y vence
            al final del último día.
          </li>
          <li>
            Puedes renovarlo <strong>hasta {LOAN_RULES.maxRenewals} veces</strong>; cada renovación suma{' '}
            {LOAN_RULES.loanDays} días a la fecha de devolución vigente, con un máximo de {MAX_TOTAL_LOAN_DAYS} días.
          </li>
          <li>No se puede renovar un préstamo vencido ni un libro que otra persona está esperando.</li>
          <li>
            Un ejemplar apartado se guarda <strong>{LOAN_RULES.pickupDays} días</strong>. Si no se recoge, el apartado
            caduca y el ejemplar pasa a la siguiente persona.
          </li>
        </ul>

        <h2>Límites</h2>
        <ul>
          <li>
            Hasta <strong>{LOAN_RULES.maxActiveLoans} libros a la vez</strong>, sumando solicitudes pendientes, apartados
            y préstamos en curso.
          </li>
          <li>
            Hasta <strong>{LOAN_RULES.maxActiveReservations} reservas</strong> en lista de espera.
          </li>
          <li>Solo puedes tener una solicitud o un préstamo vivo de cada título.</li>
          <li>Con un préstamo vencido no se pueden pedir otros libros hasta devolverlo.</li>
        </ul>

        <h2>Reservas</h2>
        <p>
          Si no quedan ejemplares libres, puedes reservar el libro. La lista de espera se atiende por orden de llegada:
          cuando vuelve un ejemplar, se aparta para la primera persona y le avisamos por correo.
        </p>

        <h2>Cuidado de los ejemplares</h2>
        <p>
          Los libros son de toda la comunidad. Devuélvelos en el estado en que los recibiste. Si un ejemplar se pierde o
          se daña, el equipo de la biblioteca te indicará cómo reponerlo.
        </p>

        <h2>Cancelaciones y suspensiones</h2>
        <p>
          Puedes cancelar una solicitud o liberar un ejemplar apartado desde tu cuenta en cualquier momento. La biblioteca
          puede rechazar una solicitud explicando el motivo, y suspender cuentas que incumplan estas condiciones; una
          cuenta suspendida no puede pedir ni reservar libros.
        </p>
        <p>
          ¿Dudas? Escríbenos desde <Link href="/contacto">contacto</Link>.
        </p>
      </div>
    </div>
  )
}

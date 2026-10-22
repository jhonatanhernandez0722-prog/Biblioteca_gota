import type { Metadata } from 'next'
import Link from 'next/link'
import { DraftNotice } from '@/components/layout/DraftNotice'
import { fineAmount, formatCOP } from '@/lib/fines'
import { FINE_RULES, LOAN_RULES } from '@/lib/rules'
import styles from '../prose.module.css'

export const metadata: Metadata = { title: 'Condiciones de préstamo' }

export default function ConditionsPage() {
  return (
    <div className={`container ${styles.page}`}>
      <header className={styles.head}>
        <h1>Condiciones de préstamo</h1>
        <p className={styles.lead}>Las reglas que la aplicación aplica en cada solicitud, préstamo, devolución y reserva.</p>
      </header>
      <DraftNotice className={styles.draft} />
      <div className={styles.prose}>
        <h2>Quién puede pedir libros</h2>
        <p>
          Cualquier persona con una cuenta activa en Biblioteca Gota Gota que haya registrado su{' '}
          <strong>teléfono</strong>, su <strong>documento de identidad</strong> (cédula de ciudadanía o tarjeta de
          identidad) y una <strong>tarjeta de crédito</strong> como respaldo. Al crear la cuenta recibes un número de
          carné, que presentas en el mostrador al recoger un libro. Puedes registrar carnés adicionales y elegir con cuál
          pides cada libro.
        </p>

        <h2>Plazos</h2>
        <ul>
          <li>
            Al pedir un libro eliges el plazo de lectura: <strong>{LOAN_RULES.loanPeriods.join(', ')} días naturales</strong>{' '}
            desde la entrega del ejemplar. Vence al final del último día.
          </li>
          <li>
            <strong>El plazo es definitivo:</strong> una vez confirmada la solicitud no se puede ampliar, acortar ni
            renovar. El sistema lo bloquea también para el personal de la biblioteca.
          </li>
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
          <li>Con un préstamo vencido o una multa pendiente no se pueden pedir ni reservar otros libros.</li>
        </ul>

        <h2>Multas por mora</h2>
        <ul>
          <li>
            Cada día natural de retraso en la devolución genera una multa de{' '}
            <strong>{formatCOP(FINE_RULES.dailyFine)} COP</strong>: multa = días de retraso ×{' '}
            {formatCOP(FINE_RULES.dailyFine)}.
          </li>
          <li>
            Ejemplos:{' '}
            {[1, 3, 7, 10]
              .map((d) => `${d} ${d === 1 ? 'día' : 'días'}, ${formatCOP(fineAmount(d))}`)
              .join('; ')}
            .
          </li>
          <li>Mientras no devuelvas el libro, tu cuenta muestra la multa acumulada. Al devolverlo se fija su valor.</li>
          <li>Las multas se pagan en el mostrador. La plataforma nunca hace cargos a tu tarjeta.</li>
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

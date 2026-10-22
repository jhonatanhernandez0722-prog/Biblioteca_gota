import type { Metadata } from 'next'
import Link from 'next/link'
import { LOAN_RULES, MAX_TOTAL_LOAN_DAYS } from '@/lib/rules'
import styles from '../prose.module.css'

export const metadata: Metadata = {
  title: 'Cómo funciona el préstamo',
  description: 'Pide, recoge, renueva y devuelve libros en Biblioteca Gota Gota: plazos y reglas del préstamo.',
}

const QUESTIONS = [
  {
    q: '¿Necesito una cuenta?',
    a: 'Para consultar el catálogo, no. Para pedir o reservar libros, sí: la cuenta es tu carné de lector y tarda dos minutos en crearse.',
  },
  {
    q: '¿Cuántos libros puedo tener a la vez?',
    a: `Hasta ${LOAN_RULES.maxActiveLoans}, contando los que tienes en casa, los que están apartados para ti y las solicitudes pendientes. Además puedes estar en la lista de espera de ${LOAN_RULES.maxActiveReservations} libros.`,
  },
  {
    q: '¿Y si el libro que quiero está prestado?',
    a: `Resérvalo. Cuando vuelva un ejemplar, se aparta automáticamente para la primera persona de la lista y le avisamos por correo. Tendrás ${LOAN_RULES.pickupDays} días para recogerlo.`,
  },
  {
    q: '¿Puedo renovar un préstamo?',
    a: `Sí, hasta ${LOAN_RULES.maxRenewals} veces, cada una de ${LOAN_RULES.loanDays} días, siempre que el préstamo no haya vencido y nadie esté esperando ese libro. Se hace desde «Mis préstamos».`,
  },
  {
    q: '¿Qué pasa si me retraso al devolverlo?',
    a: 'Mientras tengas un préstamo vencido no podrás pedir otros libros. Devuélvelo en el mostrador y podrás seguir pidiendo con normalidad.',
  },
  {
    q: '¿Qué pasa si no recojo un libro apartado?',
    a: `El apartado caduca a los ${LOAN_RULES.pickupDays} días y el ejemplar pasa a la siguiente persona en espera o vuelve a la estantería.`,
  },
]

export default function HowItWorksPage() {
  return (
    <div className={`container ${styles.page}`}>
      <header className={styles.head}>
        <h1>Cómo funciona el préstamo</h1>
        <p className={styles.lead}>
          Cuatro pasos, de la búsqueda a la devolución. Las reglas son las mismas para todas las personas y el sistema las
          aplica igual en la web y en el mostrador.
        </p>
      </header>

      <div className={styles.layout}>
        <div className={styles.prose}>
          <h2>Del catálogo a tus manos</h2>
          <ol>
            <li>
              <strong>Encuentra el libro.</strong> Busca por título, autor, ISBN o tema en{' '}
              <Link href="/explorar">el catálogo</Link>. En cada ficha verás si hay ejemplares en la estantería.
            </li>
            <li>
              <strong>Pídelo desde tu cuenta.</strong> Con un botón envías la solicitud. Si todos los ejemplares están
              prestados, puedes reservarlo y entrar en la lista de espera.
            </li>
            <li>
              <strong>Recógelo en el mostrador.</strong> El equipo aparta un ejemplar para ti y te avisa por correo.
              Tienes {LOAN_RULES.pickupDays} días para recogerlo con tu número de carné.
            </li>
            <li>
              <strong>Léelo y devuélvelo.</strong> El préstamo dura {LOAN_RULES.loanDays} días desde que lo recoges. Tu
              cuenta muestra la fecha de devolución y te deja renovarlo.
            </li>
          </ol>

          <h2>Preguntas frecuentes</h2>
          <div className={styles.qa}>
            {QUESTIONS.map((item) => (
              <details key={item.q}>
                <summary>{item.q}</summary>
                <div>
                  <p>{item.a}</p>
                </div>
              </details>
            ))}
          </div>
          <p>
            Las reglas completas están en las <Link href="/condiciones">condiciones de préstamo</Link>.
          </p>
        </div>

        <aside className={styles.aside} aria-labelledby="plazos">
          <h2 id="plazos">Plazos</h2>
          <dl className={styles.facts}>
            <div>
              <dt>Préstamo</dt>
              <dd>{LOAN_RULES.loanDays} días</dd>
            </div>
            <div>
              <dt>Renovaciones</dt>
              <dd>Hasta {LOAN_RULES.maxRenewals}</dd>
            </div>
            <div>
              <dt>Máximo con renovaciones</dt>
              <dd>{MAX_TOTAL_LOAN_DAYS} días</dd>
            </div>
            <div>
              <dt>Para recoger un apartado</dt>
              <dd>{LOAN_RULES.pickupDays} días</dd>
            </div>
            <div>
              <dt>Libros a la vez</dt>
              <dd>{LOAN_RULES.maxActiveLoans}</dd>
            </div>
          </dl>
          <Link href="/registro" className="btn btn--block">
            Crear mi carné
          </Link>
        </aside>
      </div>
    </div>
  )
}

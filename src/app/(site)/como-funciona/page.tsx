import type { Metadata } from 'next'
import Link from 'next/link'
import { fineAmount, formatCOP } from '@/lib/fines'
import { FINE_RULES, LOAN_RULES } from '@/lib/rules'
import styles from '../prose.module.css'

export const metadata: Metadata = {
  title: 'Cómo funciona el préstamo',
  description: 'Pide, recoge y devuelve libros en Biblioteca Gota Gota: plazos de lectura, multas y reglas del préstamo.',
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
    q: '¿Puedo renovar o cambiar el plazo?',
    a: `No. Al pedir el libro eliges entre ${LOAN_RULES.loanPeriods.join(', ')} días, y ese plazo queda fijo en cuanto confirmas: no se amplía ni se renueva. Si dudas, la calculadora de cada ficha te sugiere un plazo según tu ritmo de lectura.`,
  },
  {
    q: '¿Qué pasa si me retraso al devolverlo?',
    a: `Cada día de retraso suma ${formatCOP(FINE_RULES.dailyFine)} de multa, y mientras tengas un préstamo vencido o una multa pendiente no podrás pedir otros libros. Tu cuenta muestra la multa acumulada día a día; se paga en el mostrador.`,
  },
  {
    q: '¿Qué datos necesito para pedir libros?',
    a: 'Además de tu nombre y correo, un número de teléfono, tu documento de identidad (cédula de ciudadanía o tarjeta de identidad) y una tarjeta de crédito como respaldo. De la tarjeta solo guardamos la franquicia y los últimos cuatro dígitos, y nunca se le hacen cargos.',
  },
  {
    q: '¿Puedo usar otro carné?',
    a: 'Sí. Al pedir un libro puedes elegir uno de los carnés guardados en tu cuenta o escribir otro número; lo guardamos para la próxima vez. Los gestionas en «Mi perfil».',
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
              <strong>Pídelo desde tu cuenta.</strong> Eliges el plazo de lectura ({LOAN_RULES.loanPeriods.join(', ')}{' '}
              días) y el carné, y confirmas. Si todos los ejemplares están prestados, puedes reservarlo y entrar en la
              lista de espera.
            </li>
            <li>
              <strong>Recógelo en el mostrador.</strong> El equipo aparta un ejemplar para ti y te avisa por correo.
              Tienes {LOAN_RULES.pickupDays} días para recogerlo con tu número de carné.
            </li>
            <li>
              <strong>Léelo y devuélvelo.</strong> El plazo que elegiste cuenta desde que lo recoges y no cambia. Tu
              cuenta muestra la fecha de devolución y, si te retrasas, la multa acumulada.
            </li>
          </ol>

          <h2>Multas por mora</h2>
          <p>
            Cada día natural de retraso cuesta <strong>{formatCOP(FINE_RULES.dailyFine)}</strong>. El sistema lo calcula
            solo: <strong>multa = días de retraso × {formatCOP(FINE_RULES.dailyFine)}</strong>.
          </p>
          <div className="table-wrap">
            <table className="table">
              <caption className="visually-hidden">Ejemplos de multas por días de retraso</caption>
              <thead>
                <tr>
                  <th scope="col">Días de retraso</th>
                  <th scope="col" className="num">
                    Multa
                  </th>
                </tr>
              </thead>
              <tbody>
                {[1, 3, 7, 10].map((d) => (
                  <tr key={d}>
                    <td>
                      {d} {d === 1 ? 'día' : 'días'}
                    </td>
                    <td className="num">{formatCOP(fineAmount(d))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

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
              <dt>Plazo de lectura</dt>
              <dd>{LOAN_RULES.loanPeriods.join(', ')} días</dd>
            </div>
            <div>
              <dt>Renovaciones</dt>
              <dd>No: plazo fijo</dd>
            </div>
            <div>
              <dt>Multa por día de retraso</dt>
              <dd>{formatCOP(FINE_RULES.dailyFine)}</dd>
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

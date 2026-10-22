import type { Metadata } from 'next'
import { getLibraryInfo } from '@/server/site'
import styles from '../prose.module.css'

export const metadata: Metadata = { title: 'Accesibilidad' }

export default function AccessibilityPage() {
  const info = getLibraryInfo()
  return (
    <div className={`container ${styles.page}`}>
      <header className={styles.head}>
        <h1>Accesibilidad</h1>
        <p className={styles.lead}>
          Queremos que cualquier persona pueda buscar y pedir libros, use el dispositivo o la tecnología que use.
        </p>
      </header>
      <div className={styles.prose}>
        <h2>Lo que cuidamos</h2>
        <ul>
          <li>Contraste de color de nivel AA de las WCAG 2.2 en textos y controles.</li>
          <li>Navegación completa con teclado y foco siempre visible.</li>
          <li>Estados que no dependen solo del color: la disponibilidad lleva icono y texto.</li>
          <li>Formularios con etiquetas visibles y errores que explican cómo corregirlos.</li>
          <li>Botones y enlaces con un área de pulsación de al menos 44 píxeles en las vistas públicas.</li>
          <li>Si tu sistema pide reducir el movimiento, la web elimina las animaciones.</li>
          <li>Los textos se pueden ampliar hasta el 200 % sin perder contenido.</li>
        </ul>

        <h2>Limitaciones conocidas</h2>
        <ul>
          <li>
            Las portadas son imágenes de las editoriales. Las tratamos como decorativas cuando el título del libro está
            escrito justo al lado, para no repetirlo dos veces al lector de pantalla.
          </li>
          <li>Algunas descripciones importadas de proveedores externos pueden estar en otro idioma hasta que el equipo las revise.</li>
        </ul>

        <h2>Cuéntanos qué falla</h2>
        <p>
          Si encuentras una barrera, escríbenos a <a href={`mailto:${info.email}`}>{info.email}</a> indicando la página y
          lo que intentabas hacer. Te responderemos y te ayudaremos a completar tu préstamo mientras lo resolvemos.
        </p>
      </div>
    </div>
  )
}

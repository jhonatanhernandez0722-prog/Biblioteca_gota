import { LOAN_RULES, MAX_TOTAL_LOAN_DAYS } from './rules'

/**
 * Documentos legales versionados. El texto es dato: la página se genera a partir de aquí
 * y el hash de cada versión cubre su contenido. Para cambiar un documento, NO se edita
 * una versión publicada: se copia, se sube `version` y `effectiveAt` y se describe el
 * cambio en `changes`. Las versiones anteriores quedan en LEGAL_HISTORY.
 *
 * Los datos del responsable llegan como parámetros ({{...}}) desde las variables LEGAL_*.
 */
export type LegalSlug = 'terminos' | 'privacidad' | 'cookies' | 'reembolsos'

export interface LegalSection {
  heading: string
  paragraphs?: string[]
  items?: string[]
}

export interface LegalDocument {
  slug: LegalSlug
  title: string
  version: string
  effectiveAt: string
  summary: string
  changes: string
  sections: LegalSection[]
}

export interface LegalParty {
  name: string
  taxId: string
  address: string
  email: string
  phone: string
  /** true si falta algún dato obligatorio del responsable. */
  incomplete: boolean
}

const EFFECTIVE = '2026-10-21'

export const LEGAL_DOCUMENTS: Record<LegalSlug, LegalDocument> = {
  terminos: {
    slug: 'terminos',
    title: 'Términos y condiciones de uso',
    version: '1.0',
    effectiveAt: EFFECTIVE,
    summary: 'Reglas para usar la plataforma y el servicio de préstamo de libros.',
    changes: 'Primera versión.',
    sections: [
      {
        heading: 'Quién presta el servicio',
        paragraphs: [
          'Esta plataforma la opera {{name}} ({{taxId}}), con domicilio en {{address}}. Contacto: {{email}}, {{phone}}.',
        ],
      },
      {
        heading: 'Qué ofrece la plataforma',
        paragraphs: [
          'Consultar el catálogo de la biblioteca, crear una cuenta de lector, solicitar préstamos de ejemplares físicos, reservar libros prestados, renovar préstamos y consultar el historial propio.',
          'La plataforma no vende productos ni cobra por el servicio: no se realizan pagos ni se guardan datos de tarjetas.',
        ],
      },
      {
        heading: 'Cuenta de lector',
        items: [
          'Para pedir libros necesitas una cuenta con nombre, correo y contraseña. Consultar el catálogo no requiere cuenta.',
          'Eres responsable de mantener tu contraseña en secreto y de que tus datos sean correctos.',
          'Cada cuenta es personal. El número de carné identifica tus préstamos en el mostrador.',
        ],
      },
      {
        heading: 'Reglas de préstamo',
        items: [
          `El préstamo dura ${LOAN_RULES.loanDays} días naturales desde la entrega y vence al final del último día.`,
          `Se puede renovar hasta ${LOAN_RULES.maxRenewals} veces (máximo ${MAX_TOTAL_LOAN_DAYS} días) si el préstamo no ha vencido y nadie espera el libro.`,
          `Un ejemplar apartado se guarda ${LOAN_RULES.pickupDays} días; después pasa a la siguiente persona.`,
          `Puedes tener hasta ${LOAN_RULES.maxActiveLoans} libros y ${LOAN_RULES.maxActiveReservations} reservas a la vez.`,
          'Con un préstamo vencido no podrás pedir otros libros hasta devolverlo.',
        ],
      },
      {
        heading: 'Cuidado de los ejemplares',
        paragraphs: [
          'Los libros son de uso común. Si un ejemplar se pierde o se daña, el equipo de la biblioteca te indicará cómo reponerlo. La plataforma no realiza cobros automáticos por este motivo.',
        ],
      },
      {
        heading: 'Suspensión y cancelación',
        paragraphs: [
          'La biblioteca puede rechazar solicitudes explicando el motivo y suspender cuentas que incumplan estos términos. Puedes dejar de usar la plataforma y pedir la eliminación de tu cuenta en cualquier momento escribiendo a {{email}}.',
        ],
      },
      {
        heading: 'Disponibilidad y datos bibliográficos',
        paragraphs: [
          'Hacemos lo posible por mantener la plataforma disponible, pero puede haber interrupciones. Parte de los datos bibliográficos y portadas provienen de Open Library; la biblioteca los revisa, pero pueden contener errores.',
        ],
      },
      {
        heading: 'Cambios en estos términos',
        paragraphs: [
          'Si cambian estos términos publicaremos la nueva versión con su fecha de entrada en vigor, conservaremos las anteriores en el historial de versiones y te pediremos aceptarla la próxima vez que entres si el cambio te afecta.',
        ],
      },
      {
        heading: 'Ley aplicable',
        paragraphs: [
          'Estos términos se rigen por la ley colombiana. Nada de lo aquí dispuesto limita los derechos que la ley te reconoce y que no pueden excluirse por contrato.',
        ],
      },
    ],
  },
  privacidad: {
    slug: 'privacidad',
    title: 'Política de privacidad y tratamiento de datos personales',
    version: '1.0',
    effectiveAt: EFFECTIVE,
    summary: 'Qué datos tratamos, para qué, y cómo ejercer tus derechos (Ley 1581 de 2012).',
    changes: 'Primera versión.',
    sections: [
      {
        heading: 'Responsable del tratamiento',
        paragraphs: ['{{name}} ({{taxId}}), {{address}}. Canal de atención de datos personales: {{email}}, {{phone}}.'],
      },
      {
        heading: 'Datos que tratamos y por qué',
        items: [
          'Nombre: identificarte en el mostrador y en los avisos de préstamo.',
          'Correo electrónico: iniciar sesión, avisarte cuando un libro está listo o una solicitud cambia, y restablecer tu contraseña.',
          'Contraseña: solo en forma cifrada (scrypt), para autenticarte. Nadie del equipo puede leerla.',
          'Número de carné: generado por el sistema para identificar tus préstamos.',
          'Préstamos, reservas y renovaciones con sus fechas: gestionar el servicio y demostrar el estado de cada ejemplar.',
          'Registro de aceptaciones de estos documentos: demostrar qué autorizaste, cuándo y en qué versión.',
          'Registro de operaciones del equipo: resolver incidencias sobre préstamos y fichas.',
        ],
        paragraphs: [
          'No pedimos documento de identidad, fecha de nacimiento, teléfono ni dirección. No usamos analítica, publicidad ni perfiles de comportamiento.',
        ],
      },
      {
        heading: 'Finalidades',
        paragraphs: [
          'Usamos los datos solo para prestar el servicio de préstamo descrito en los términos. No los vendemos ni los cedemos, ni los usaremos para finalidades nuevas sin informarte y, cuando la ley lo exija, pedir tu autorización.',
        ],
      },
      {
        heading: 'Quién accede y encargados',
        items: [
          'Tú, y el personal de la biblioteca según su función: el personal bibliotecario ve los correos parcialmente; la administración, completos.',
          'Proveedor de correo: si está activado, los avisos se envían mediante {{mailProvider}}, que actúa como encargado y puede tratar tu correo fuera de Colombia.',
          'Open Library recibe solo búsquedas bibliográficas del personal, nunca datos de lectores.',
        ],
      },
      {
        heading: 'Tus derechos',
        items: [
          'Conocer, actualizar y rectificar tus datos.',
          'Solicitar prueba de la autorización que otorgaste.',
          'Ser informado sobre el uso que se da a tus datos.',
          'Revocar la autorización o pedir la supresión de tus datos cuando no exista un deber legal o contractual de conservarlos.',
          'Acceder gratuitamente a tus datos.',
          'Presentar quejas ante la Superintendencia de Industria y Comercio tras agotar el trámite de consulta o reclamo ante nosotros.',
        ],
      },
      {
        heading: 'Cómo ejercerlos',
        paragraphs: [
          'Escribe a {{email}} indicando tu nombre, correo de la cuenta y tu solicitud. Atenderemos las consultas en un máximo de diez (10) días hábiles, prorrogables cinco (5) más, y los reclamos en un máximo de quince (15) días hábiles, prorrogables ocho (8) más, conforme a los artículos 14 y 15 de la Ley 1581 de 2012. Te informaremos si necesitamos ampliar el plazo y por qué.',
          'Desde «Mi perfil» puedes consultar tus aceptaciones y revocar la autorización de tratamiento. Revocarla impide seguir pidiendo libros, porque sin tratar tus datos no podemos gestionar préstamos.',
        ],
      },
      {
        heading: 'Conservación',
        items: [
          'Cuenta y préstamos: mientras la cuenta esté activa y, después, solo el tiempo necesario para cerrar préstamos pendientes y atender reclamaciones.',
          'Sesiones: caducan a los 30 días sin uso.',
          'Enlaces de recuperación de contraseña: caducan en una hora.',
          'Evidencias de aceptación: mientras sea necesario para demostrar la autorización y atender reclamaciones; después se anonimizan.',
        ],
      },
      {
        heading: 'Seguridad',
        paragraphs: [
          'Contraseñas cifradas, sesiones en cookies no accesibles desde el navegador, control de acceso por roles validado en el servidor y registros de consentimiento que no pueden modificarse ni borrarse desde la aplicación.',
        ],
      },
      {
        heading: 'Menores de edad',
        paragraphs: [
          'Si eres menor de edad, la cuenta debe crearla o autorizarla tu representante legal. Solo tratamos los datos indispensables y respetando tu interés superior.',
        ],
      },
      {
        heading: 'Cambios y vigencia',
        paragraphs: [
          'Esta política rige desde la fecha indicada. Si cambia de forma sustancial te lo informaremos y, cuando corresponda, pediremos de nuevo tu autorización. Las versiones anteriores quedan en el historial.',
        ],
      },
    ],
  },
  cookies: {
    slug: 'cookies',
    title: 'Política de cookies',
    version: '1.0',
    effectiveAt: EFFECTIVE,
    summary: 'Qué cookies usa la plataforma y cómo gestionarlas.',
    changes: 'Primera versión.',
    sections: [
      {
        heading: 'Qué usamos',
        paragraphs: [
          'Solo cookies técnicas, necesarias para que funcione lo que pides. No usamos cookies de preferencias, analítica, publicidad ni de terceros, ni píxeles de seguimiento.',
        ],
        items: [
          'gg_session (técnica): mantiene tu sesión iniciada. HttpOnly, caduca a los 30 días sin uso.',
          'gg_flash (técnica): muestra un aviso tras una acción; dura 60 segundos y se borra al mostrarse.',
          'gg_consent (técnica): recuerda tu elección sobre cookies opcionales; dura 12 meses.',
        ],
      },
      {
        heading: 'Cookies opcionales',
        paragraphs: [
          'Hoy no hay ninguna. Si en el futuro se añade alguna (por ejemplo, de analítica), no se activará hasta que la aceptes en «Preferencias de cookies», donde podrás retirar ese consentimiento cuando quieras.',
        ],
      },
      {
        heading: 'Cómo gestionarlas',
        paragraphs: [
          'Puedes borrar las cookies desde tu navegador. Si borras gg_session se cerrará tu sesión.',
        ],
      },
    ],
  },
  reembolsos: {
    slug: 'reembolsos',
    title: 'Política de reembolsos, devoluciones y cancelaciones',
    version: '1.0',
    effectiveAt: EFFECTIVE,
    summary: 'La plataforma no cobra: aquí se explica qué significa cancelar y devolver.',
    changes: 'Primera versión.',
    sections: [
      {
        heading: 'No hay transacciones comerciales',
        paragraphs: [
          'Biblioteca Gota Gota no vende productos ni cobra por el préstamo a través de la plataforma, por lo que no hay pagos que reembolsar. Si en algún momento se introdujeran cobros, esta política se actualizará antes, incluyendo los derechos de retracto, reversión del pago y garantía que reconoce la Ley 1480 de 2011 cuando correspondan.',
        ],
      },
      {
        heading: 'Cancelar una solicitud o una reserva',
        items: [
          'Puedes cancelar una solicitud pendiente o liberar un ejemplar apartado desde «Mis préstamos», sin coste.',
          'Puedes salir de una lista de espera en cualquier momento.',
          `Si no recoges un ejemplar apartado en ${LOAN_RULES.pickupDays} días, el apartado se cancela automáticamente.`,
        ],
      },
      {
        heading: 'Devolver un libro',
        paragraphs: [
          'Las devoluciones se hacen en el mostrador. El personal registra la devolución y el préstamo queda cerrado en tu historial.',
        ],
      },
      {
        heading: 'Si algo no cuadra',
        paragraphs: [
          'Si ves un préstamo que no reconoces o un estado incorrecto, escribe a {{email}}. Revisaremos el registro de operaciones y te responderemos.',
        ],
      },
    ],
  },
}

/** Versiones anteriores, por documento (vacío hasta que se publique una segunda versión). */
export const LEGAL_HISTORY: Record<LegalSlug, LegalDocument[]> = {
  terminos: [],
  privacidad: [],
  cookies: [],
  reembolsos: [],
}

export const LEGAL_PATH: Record<LegalSlug, string> = {
  terminos: '/terminos',
  privacidad: '/privacidad',
  cookies: '/cookies',
  reembolsos: '/reembolsos',
}

/** Consentimientos que exige crear una cuenta, independientes entre sí. */
export const ACCOUNT_CONSENTS = [
  { slug: 'terminos', type: 'terms_acceptance', field: 'acceptTerms' },
  { slug: 'privacidad', type: 'data_processing_authorization', field: 'acceptPrivacy' },
] as const

export function fillParty(text: string, party: LegalParty & { mailProvider: string }): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String((party as unknown as Record<string, string>)[key] ?? ''))
}

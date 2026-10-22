import { fineAmount, formatCOP } from './fines'
import { FINE_RULES, LOAN_RULES } from './rules'

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

/* ───────────── Versiones 1.0 (21 de octubre de 2026). Congeladas: no editar. ───────────── */

const TERMINOS_1_0: LegalDocument = {
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
        'El préstamo dura 21 días naturales desde la entrega y vence al final del último día.',
        'Se puede renovar hasta 2 veces (máximo 63 días) si el préstamo no ha vencido y nadie espera el libro.',
        'Un ejemplar apartado se guarda 3 días; después pasa a la siguiente persona.',
        'Puedes tener hasta 5 libros y 3 reservas a la vez.',
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
}

const PRIVACIDAD_1_0: LegalDocument = {
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
}

const COOKIES_1_0: LegalDocument = {
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
}

const REEMBOLSOS_1_0: LegalDocument = {
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
        'Si no recoges un ejemplar apartado en 3 días, el apartado se cancela automáticamente.',
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
}

/* ───────────── Versiones vigentes ───────────── */

const EFFECTIVE_1_1 = '2026-10-22'

/** Reutiliza tal cual una sección de una versión anterior. */
function keep(doc: LegalDocument, heading: string): LegalSection {
  const found = doc.sections.find((s) => s.heading === heading)
  if (!found) throw new Error(`La sección «${heading}» no existe en ${doc.slug} v${doc.version}`)
  return found
}

const FINE_EXAMPLES = [1, 3, 7, 10].map((d) => `${d} ${d === 1 ? 'día' : 'días'}: ${formatCOP(fineAmount(d))}`).join('; ')

const TERMINOS_1_1: LegalDocument = {
  ...TERMINOS_1_0,
  version: '1.1',
  effectiveAt: EFFECTIVE_1_1,
  changes:
    'Plazo de lectura elegido al pedir el libro y sin renovaciones; multas por mora; datos de identificación obligatorios para pedir préstamos; carnés de préstamo adicionales.',
  sections: [
    keep(TERMINOS_1_0, 'Quién presta el servicio'),
    {
      heading: 'Qué ofrece la plataforma',
      paragraphs: [
        'Consultar el catálogo de la biblioteca, crear una cuenta de lector, solicitar préstamos de ejemplares físicos eligiendo el plazo de lectura, reservar libros prestados y consultar el historial propio, los atrasos y las multas.',
        'La plataforma no vende productos ni procesa pagos. La tarjeta de crédito se pide como respaldo del préstamo: no se realizan cargos a ella y solo se guardan su franquicia y sus últimos cuatro dígitos.',
      ],
    },
    {
      heading: 'Cuenta de lector',
      items: [
        'Para pedir libros necesitas una cuenta con nombre, correo, contraseña, número de teléfono, documento de identidad (cédula de ciudadanía o tarjeta de identidad) y una tarjeta de crédito. Consultar el catálogo no requiere cuenta.',
        'Eres responsable de mantener tu contraseña en secreto y de que tus datos sean correctos y te pertenezcan.',
        'Cada cuenta es personal y cada documento solo puede tener una cuenta. El carné de lector identifica tus préstamos en el mostrador; puedes registrar carnés adicionales y elegir con cuál pides cada libro.',
      ],
    },
    {
      heading: 'Reglas de préstamo',
      items: [
        `Al pedir un libro eliges el plazo de lectura: ${LOAN_RULES.loanPeriods.join(', ')} días naturales desde la entrega. Vence al final del último día.`,
        'El plazo elegido es definitivo: una vez confirmada la solicitud no se puede ampliar, acortar ni renovar.',
        `Un ejemplar apartado se guarda ${LOAN_RULES.pickupDays} días; después pasa a la siguiente persona.`,
        `Puedes tener hasta ${LOAN_RULES.maxActiveLoans} libros y ${LOAN_RULES.maxActiveReservations} reservas a la vez.`,
        'Con un préstamo vencido o una multa pendiente no podrás pedir ni reservar otros libros.',
      ],
    },
    {
      heading: 'Multas por mora',
      items: [
        `Cada día natural de retraso en la devolución genera una multa de ${formatCOP(FINE_RULES.dailyFine)} COP. Multa = días de retraso × ${formatCOP(FINE_RULES.dailyFine)}.`,
        `Ejemplos: ${FINE_EXAMPLES}.`,
        'Mientras el libro no se devuelva, tu cuenta muestra la multa acumulada día a día. Al registrar la devolución se fija el valor definitivo.',
        'Las multas se pagan en el mostrador. La biblioteca puede condonar una multa justificando el motivo, que queda registrado.',
      ],
    },
    keep(TERMINOS_1_0, 'Cuidado de los ejemplares'),
    keep(TERMINOS_1_0, 'Suspensión y cancelación'),
    keep(TERMINOS_1_0, 'Disponibilidad y datos bibliográficos'),
    keep(TERMINOS_1_0, 'Cambios en estos términos'),
    keep(TERMINOS_1_0, 'Ley aplicable'),
  ],
}

const PRIVACIDAD_1_1: LegalDocument = {
  ...PRIVACIDAD_1_0,
  version: '1.1',
  effectiveAt: EFFECTIVE_1_1,
  changes: 'Se añaden teléfono, documento de identidad, datos parciales de la tarjeta de crédito, carnés de préstamo y multas.',
  sections: [
    keep(PRIVACIDAD_1_0, 'Responsable del tratamiento'),
    {
      heading: 'Datos que tratamos y por qué',
      items: [
        'Nombre: identificarte en el mostrador y en los avisos de préstamo.',
        'Correo electrónico: iniciar sesión, avisarte cuando un libro está listo o una solicitud cambia, y restablecer tu contraseña.',
        'Contraseña: solo en forma cifrada (scrypt), para autenticarte. Nadie del equipo puede leerla.',
        'Teléfono: contactarte por préstamos vencidos o ejemplares apartados.',
        'Documento de identidad (tipo y número): comprobar tu identidad al entregar un libro y evitar cuentas duplicadas.',
        'Tarjeta de crédito: solo franquicia y últimos cuatro dígitos, como respaldo del préstamo. El número completo se valida al escribirlo y se descarta; nunca se guarda, ni tampoco el código de seguridad ni la fecha de vencimiento.',
        'Números de carné: el que emite la biblioteca y los adicionales que registres, para identificar tus préstamos.',
        'Préstamos, plazos elegidos, reservas y multas con sus fechas: gestionar el servicio y demostrar el estado de cada ejemplar y de cada multa.',
        'Registro de aceptaciones de estos documentos: demostrar qué autorizaste, cuándo y en qué versión.',
        'Registro de operaciones del equipo: resolver incidencias sobre préstamos, multas y fichas.',
      ],
      paragraphs: ['No pedimos fecha de nacimiento ni dirección. No usamos analítica, publicidad ni perfiles de comportamiento.'],
    },
    keep(PRIVACIDAD_1_0, 'Finalidades'),
    {
      heading: 'Quién accede y encargados',
      items: [
        'Tú, y el personal de la biblioteca según su función: el personal bibliotecario ve los correos parcialmente; la administración, completos. El personal ve tu teléfono y los últimos dígitos de tu documento para atenderte en el mostrador.',
        'Proveedor de correo: si está activado, los avisos se envían mediante {{mailProvider}}, que actúa como encargado y puede tratar tu correo fuera de Colombia.',
        'Open Library recibe solo búsquedas bibliográficas del personal, nunca datos de lectores.',
      ],
    },
    keep(PRIVACIDAD_1_0, 'Tus derechos'),
    keep(PRIVACIDAD_1_0, 'Cómo ejercerlos'),
    {
      heading: 'Conservación',
      items: [
        'Cuenta, préstamos y multas: mientras la cuenta esté activa y, después, solo el tiempo necesario para cerrar préstamos y multas pendientes y atender reclamaciones.',
        'Sesiones: caducan a los 30 días sin uso.',
        'Enlaces de recuperación de contraseña: caducan en una hora.',
        'Evidencias de aceptación: mientras sea necesario para demostrar la autorización y atender reclamaciones; después se anonimizan.',
      ],
    },
    {
      heading: 'Seguridad',
      paragraphs: [
        'Contraseñas cifradas, sesiones en cookies no accesibles desde el navegador, control de acceso por roles validado en el servidor, tarjetas truncadas a sus últimos cuatro dígitos y registros de consentimiento y de multas que no pueden modificarse ni borrarse desde la aplicación.',
      ],
    },
    {
      heading: 'Menores de edad',
      paragraphs: [
        'Si eres menor de edad (te identificas con tarjeta de identidad), la cuenta debe crearla o autorizarla tu representante legal, y la tarjeta de crédito debe ser la suya. Solo tratamos los datos indispensables y respetando tu interés superior.',
      ],
    },
    keep(PRIVACIDAD_1_0, 'Cambios y vigencia'),
  ],
}

const REEMBOLSOS_1_1: LegalDocument = {
  ...REEMBOLSOS_1_0,
  version: '1.1',
  effectiveAt: EFFECTIVE_1_1,
  summary: 'Qué significa cancelar y devolver, y cómo se pagan o reclaman las multas por mora.',
  changes: 'Se incorporan las multas por mora y cómo reclamarlas.',
  sections: [
    {
      heading: 'Qué se cobra',
      paragraphs: [
        `El préstamo es gratuito. Lo único que se cobra son las multas por devolución tardía: ${formatCOP(FINE_RULES.dailyFine)} COP por cada día natural de retraso. La plataforma no realiza cargos a tu tarjeta: las multas se pagan en el mostrador.`,
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
    keep(REEMBOLSOS_1_0, 'Devolver un libro'),
    {
      heading: 'Reclamar una multa',
      paragraphs: [
        'Si crees que una multa es incorrecta (por ejemplo, porque devolviste el libro antes de la fecha registrada), escribe a {{email}} antes de pagarla o después. Revisaremos el registro de operaciones; si la multa no procede, la condonaremos o te devolveremos lo pagado por el mismo medio, conforme a la Ley 1480 de 2011 cuando corresponda.',
      ],
    },
    keep(REEMBOLSOS_1_0, 'Si algo no cuadra'),
  ],
}

export const LEGAL_DOCUMENTS: Record<LegalSlug, LegalDocument> = {
  terminos: TERMINOS_1_1,
  privacidad: PRIVACIDAD_1_1,
  cookies: COOKIES_1_0,
  reembolsos: REEMBOLSOS_1_1,
}

/** Versiones anteriores, por documento, de la más reciente a la más antigua. */
export const LEGAL_HISTORY: Record<LegalSlug, LegalDocument[]> = {
  terminos: [TERMINOS_1_0],
  privacidad: [PRIVACIDAD_1_0],
  cookies: [],
  reembolsos: [REEMBOLSOS_1_0],
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

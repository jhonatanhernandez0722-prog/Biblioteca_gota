import { env } from './env'

/**
 * Datos de contacto de la biblioteca (pie de página, contacto). Se configuran con
 * variables de entorno; si faltan, se muestran valores de ejemplo marcados como tales.
 */
export function getLibraryInfo() {
  const config = env()
  const isSample = !config.LIBRARY_EMAIL && !config.LIBRARY_ADDRESS
  return {
    isSample,
    email: config.LIBRARY_EMAIL || 'hola@gotagota.example',
    phone: config.LIBRARY_PHONE || '+57 601 000 0000',
    address: config.LIBRARY_ADDRESS || 'Calle 00 # 00-00, Bogotá',
    hours: config.LIBRARY_HOURS || 'De lunes a sábado, de 9:00 a 19:00',
  }
}

export function isDemoMode(): boolean {
  return env().DEMO_MODE
}

/** Responsable del tratamiento y titular del servicio. Lo que falte se muestra como pendiente. */
export function getLegalParty() {
  const c = env()
  const missing = (label: string) => `[pendiente: ${label}]`
  const party = {
    name: c.LEGAL_NAME || missing('razón social o nombre del responsable'),
    taxId: c.LEGAL_TAX_ID ? `NIT ${c.LEGAL_TAX_ID}` : missing('NIT o identificación'),
    address: c.LEGAL_ADDRESS || missing('domicilio'),
    email: c.LEGAL_EMAIL || missing('correo de atención de datos personales'),
    phone: c.LEGAL_PHONE || missing('teléfono'),
    mailProvider: c.MAIL_PROVIDER === 'resend' ? 'Resend (Estados Unidos)' : 'ningún proveedor externo (desactivado)',
  }
  return { ...party, incomplete: !c.LEGAL_NAME || !c.LEGAL_TAX_ID || !c.LEGAL_ADDRESS || !c.LEGAL_EMAIL }
}

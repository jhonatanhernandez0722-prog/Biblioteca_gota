import type { Metadata } from 'next'
import { LegalDocumentView } from '@/components/legal/LegalDocumentView'
import { LEGAL_DOCUMENTS } from '@/lib/legal'

export const metadata: Metadata = { title: 'Privacidad y tratamiento de datos' }

export default function Page() {
  return <LegalDocumentView doc={LEGAL_DOCUMENTS.privacidad} />
}

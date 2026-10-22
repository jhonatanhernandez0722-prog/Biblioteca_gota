import type { Metadata } from 'next'
import { LegalDocumentView } from '@/components/legal/LegalDocumentView'
import { LEGAL_DOCUMENTS } from '@/lib/legal'

export const metadata: Metadata = { title: 'Reembolsos y cancelaciones' }

export default function Page() {
  return <LegalDocumentView doc={LEGAL_DOCUMENTS.reembolsos} />
}

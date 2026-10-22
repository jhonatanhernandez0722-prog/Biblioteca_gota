import type { Metadata } from 'next'
import { CookiePreferences } from '@/components/legal/CookieConsent'
import { LegalDocumentView } from '@/components/legal/LegalDocumentView'
import { LEGAL_DOCUMENTS } from '@/lib/legal'

export const metadata: Metadata = { title: 'Cookies' }

export default function Page() {
  return (
    <LegalDocumentView doc={LEGAL_DOCUMENTS.cookies}>
      <CookiePreferences />
    </LegalDocumentView>
  )
}
